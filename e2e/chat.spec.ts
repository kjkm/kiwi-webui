import { createServer, type Server } from 'node:http';
import { createSign, generateKeyPairSync } from 'node:crypto';
import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';

const IDP_PORT = 43210;
const LLM_PORT = 43211;
const issuer = `http://127.0.0.1:${IDP_PORT}`;
const clientId = 'kiwi-e2e';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const codes = new Map<string, string>();
let counter = 0;
let idp: Server;
let llm: Server;

function json(response: import('node:http').ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

function readBody(request: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function jwt(nonce: string): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = encode({ alg: 'RS256', typ: 'JWT', kid: 'e2e-key' });
  const body = encode({
    iss: issuer,
    aud: clientId,
    sub: 'e2e-subject',
    preferred_username: 'e2e-user',
    email: 'e2e@example.com',
    nonce,
    iat: now,
    exp: now + 300
  });
  const signature = createSign('RSA-SHA256')
    .update(`${head}.${body}`)
    .end()
    .sign(privateKey)
    .toString('base64url');
  return `${head}.${body}.${signature}`;
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

test.beforeAll(async () => {
  const db = new Database('./data/e2e.db');
  db.pragma('foreign_keys = ON');
  db.prepare('DELETE FROM sessions').run();
  db.prepare('DELETE FROM users').run();
  db.close();

  idp = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', issuer);
      if (request.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
        return json(response, 200, {
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256']
        });
      }
      if (request.method === 'GET' && url.pathname === '/jwks') {
        return json(response, 200, {
          keys: [
            {
              ...(publicKey.export({ format: 'jwk' }) as object),
              kid: 'e2e-key',
              alg: 'RS256',
              use: 'sig'
            }
          ]
        });
      }
      if (request.method === 'GET' && url.pathname === '/authorize') {
        const code = `e2e-code-${++counter}`;
        codes.set(code, url.searchParams.get('nonce') ?? '');
        const callback = new URL(url.searchParams.get('redirect_uri')!);
        callback.searchParams.set('code', code);
        callback.searchParams.set('state', url.searchParams.get('state')!);
        response.writeHead(302, { location: callback.href });
        return response.end();
      }
      if (request.method === 'POST' && url.pathname === '/token') {
        const params = new URLSearchParams(await readBody(request));
        const nonce = codes.get(params.get('code') ?? '');
        if (nonce === undefined) return json(response, 400, { error: 'invalid_grant' });
        codes.delete(params.get('code')!);
        return json(response, 200, {
          access_token: 'e2e-token',
          token_type: 'Bearer',
          expires_in: 300,
          id_token: jwt(nonce)
        });
      }
      return json(response, 404, { error: 'not_found' });
    })();
  });

  llm = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write('data: {"choices":[{"delta":{"content":"Hello **world**. "}}]}\n\n');
    response.write(
      'data: {"choices":[{"delta":{"content":"<script>window.pwned=true</script>"}}]}\n\n'
    );
    response.end('data: [DONE]\n\n');
  });

  await Promise.all([listen(idp, IDP_PORT), listen(llm, LLM_PORT)]);
});

test.afterAll(async () => {
  await Promise.all([close(idp), close(llm)]);
});

test('OIDC login, persistent streamed chat, CSRF protection, and logout', async ({ page }) => {
  await page.goto('/signin');
  await page.getByRole('link', { name: 'Continue with SSO' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('@e2e-user')).toBeVisible();

  await page.getByRole('button', { name: /New chat/ }).click();
  await expect(page).toHaveURL(/\/c\//);
  const composer = page.getByRole('textbox', { name: 'Message' });
  await composer.fill('Say hello');
  await composer.press('Enter');
  await expect(page.getByText('Hello world.')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as Window & { pwned?: boolean }).pwned))
    .not.toBe(true);
  await expect(page.locator('.message.assistant script')).toHaveCount(0);

  await page.reload();
  await expect(page.getByText('Say hello')).toBeVisible();
  await expect(page.getByText('Hello world.')).toBeVisible();

  await page.getByRole('link', { name: 'New chat', exact: true }).hover();
  page.once('dialog', (dialog) => dialog.accept('Renamed chat'));
  await page.getByRole('button', { name: 'Rename New chat' }).click();
  await expect(page.getByRole('link', { name: 'Renamed chat' })).toBeVisible();

  const csrf = await page.request.post('/api/chats', {
    headers: { origin: 'http://evil.example' },
    data: {}
  });
  expect(csrf.status()).toBe(403);

  await page.getByRole('link', { name: 'Renamed chat' }).hover();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete Renamed chat' }).click();
  await expect(page).toHaveURL('/');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/signin');
});
