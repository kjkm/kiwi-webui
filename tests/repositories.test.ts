import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { testDatabase } from './support/database';
import { SessionRepository, hashSessionToken } from '../src/lib/server/db/sessions';
import { SqliteFlowStore } from '../src/lib/server/db/flows';
import { UserRepository } from '../src/lib/server/db/users';

let db: Database.Database;
let users: UserRepository;

beforeEach(() => {
  db = testDatabase();
  users = new UserRepository(db);
});
afterEach(() => db.close());

describe('repositories', () => {
  it('stores user metadata and enforces case-insensitive usernames', () => {
    const user = users.create({ username: 'Alice', displayName: 'Alice Example' });
    expect(users.getByUsername('ALICE')).toMatchObject({
      id: user.id,
      displayName: 'Alice Example'
    });
    expect(() => users.create({ username: 'alice' })).toThrow();
  });

  it('contains no server-side conversation tables', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toContain('users');
    expect(tables).toContain('sessions');
    expect(tables).toContain('oidc_flows');
    expect(tables).not.toContain('chats');
    expect(tables).not.toContain('messages');
  });

  it('stores only a session hash and expires sessions', () => {
    const user = users.create({ username: 'alice' });
    const sessions = new SessionRepository(db);
    const session = sessions.create(user.id, 60);
    expect(db.prepare('SELECT token_hash FROM sessions').get()).toEqual({
      token_hash: hashSessionToken(session.token)
    });
    expect(sessions.resolve(session.token)?.id).toBe(user.id);
    db.prepare('UPDATE sessions SET expires_at = 0').run();
    expect(sessions.resolve(session.token)).toBeNull();
  });

  it('consumes OIDC flows once and rejects expiry', async () => {
    const flows = new SqliteFlowStore(db);
    const handle = await flows.create({ state: 's', nonce: 'n', verifier: 'v' }, 1000);
    expect(await flows.consume(handle)).toEqual({ state: 's', nonce: 'n', verifier: 'v' });
    expect(await flows.consume(handle)).toBeNull();
    const expired = await flows.create({ state: 's2', nonce: 'n2', verifier: 'v2' }, 1000);
    db.prepare('UPDATE oidc_flows SET expires_at = 0 WHERE id = ?').run(expired);
    expect(await flows.consume(expired)).toBeNull();
  });
});
