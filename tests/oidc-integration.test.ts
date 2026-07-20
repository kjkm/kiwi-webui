import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OidcClient, OidcProtocolError } from '../src/lib/server/oidc-core/protocol/index.js';
import { SqliteFlowStore } from '../src/lib/server/db/flows';
import { SessionRepository } from '../src/lib/server/db/sessions';
import { UserRepository } from '../src/lib/server/db/users';
import { testDatabase } from './support/database';
import { startStubIdp, type StubIdp } from './support/stub-idp';

const clientId = 'kiwi-test';
const redirectUri = 'http://127.0.0.1:4173/auth/callback';
const db = testDatabase();
let idp: StubIdp;
let client: OidcClient;

beforeAll(async () => {
  idp = await startStubIdp(clientId);
  client = await OidcClient.discover({
    issuer: idp.issuer,
    clientId,
    clientSecret: 'secret',
    allowInsecureHttp: true,
    flowStore: new SqliteFlowStore(db)
  });
});
afterAll(async () => {
  db.close();
  await idp.close();
});

async function start(): Promise<{ state: string; handle: string }> {
  const result = await client.startAuthorization(redirectUri);
  const url = new URL(result.url);
  idp.nonce = url.searchParams.get('nonce')!;
  return { state: url.searchParams.get('state')!, handle: result.flowHandle };
}

describe('OIDC login integration', () => {
  it('validates claims, provisions an account, and creates a session', async () => {
    idp.claims = { sub: 'subject-1', preferred_username: 'alice', email: 'alice@example.com' };
    const flow = await start();
    const callback = new URL(`${redirectUri}?code=one&state=${flow.state}`);
    const claims = await client.completeCallback(flow.handle, callback);
    const users = new UserRepository(db);
    expect(users.resolveOidcIdentity(claims).kind).toBe('provisioned');
    const user = users.getBySub('subject-1')!;
    const session = new SessionRepository(db).create(user.id, 60);
    expect(new SessionRepository(db).resolve(session.token)?.username).toBe('alice');
  });

  it('rejects a consumed or tampered flow without claims', async () => {
    idp.claims = { sub: 'subject-2', preferred_username: 'bob' };
    const flow = await start();
    await expect(
      client.completeCallback(flow.handle, new URL(`${redirectUri}?code=two&state=tampered`))
    ).rejects.toBeInstanceOf(OidcProtocolError);
    await expect(
      client.completeCallback(flow.handle, new URL(`${redirectUri}?code=three&state=${flow.state}`))
    ).rejects.toMatchObject({ reason: 'flow-missing' });
  });
});
