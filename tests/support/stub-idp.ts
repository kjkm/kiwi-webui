/**
 * A minimal OIDC provider for tests (ported from rayfin's test/oidc.test.ts
 * stub): serves discovery and JWKS, and signs whatever `claims` say at the
 * token endpoint with the per-flow `nonce`. Tests drive it the way Authentik
 * would be driven, minus the human at the consent screen.
 *
 * Authorization codes are single-use, like a real IdP's: a redeemed code is
 * rejected with `invalid_grant`, so replay tests behave realistically even
 * against a stateless flow store.
 *
 * Node built-ins only (node:http, node:crypto) — no framework dependency.
 * Exported for future consumers' end-to-end tests as well as this package's.
 */
import { createServer, type Server } from 'node:http';
import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';

export interface StubIdp {
  issuer: string;
  /** Claims merged into the signed ID token (set per test; may omit `sub`). */
  claims: Record<string, unknown>;
  /** The nonce the next ID token is signed with (set per flow). */
  nonce: string;
  close(): Promise<void>;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function signIdToken(payload: Record<string, unknown>, privateKey: KeyObject): string {
  const head = b64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test-key' })));
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).end().sign(privateKey);
  return `${head}.${body}.${b64url(sig)}`;
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export async function startStubIdp(clientId: string): Promise<StubIdp> {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const redeemedCodes = new Set<string>();

  const stub: StubIdp = {
    issuer: '',
    claims: {},
    nonce: '',
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };

  const json = (res: import('node:http').ServerResponse, status: number, body: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const server: Server = createServer((req, res) => {
    void (async () => {
      const path = new URL(req.url ?? '/', stub.issuer).pathname;
      if (req.method === 'GET' && path === '/.well-known/openid-configuration') {
        return json(res, 200, {
          issuer: stub.issuer,
          authorization_endpoint: `${stub.issuer}/authorize`,
          token_endpoint: `${stub.issuer}/token`,
          jwks_uri: `${stub.issuer}/jwks`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256']
        });
      }
      if (req.method === 'GET' && path === '/jwks') {
        return json(res, 200, {
          keys: [
            {
              ...(publicKey.export({ format: 'jwk' }) as object),
              kid: 'test-key',
              alg: 'RS256',
              use: 'sig'
            }
          ]
        });
      }
      if (req.method === 'POST' && path === '/token') {
        const params = new URLSearchParams(await readBody(req));
        const code = params.get('code') ?? '';
        if (!code || redeemedCodes.has(code)) {
          return json(res, 400, {
            error: 'invalid_grant',
            error_description: 'code already redeemed'
          });
        }
        redeemedCodes.add(code);
        const now = Math.floor(Date.now() / 1000);
        const idToken = signIdToken(
          {
            iss: stub.issuer,
            aud: clientId,
            iat: now,
            exp: now + 300,
            nonce: stub.nonce,
            ...stub.claims
          },
          privateKey
        );
        return json(res, 200, {
          access_token: 'stub-access-token',
          token_type: 'Bearer',
          expires_in: 300,
          id_token: idToken
        });
      }
      json(res, 404, { error: 'not_found' });
    })().catch(() => json(res, 500, { error: 'stub_error' }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('stub idp failed to bind a port');
  stub.issuer = `http://127.0.0.1:${address.port}`;
  return stub;
}
