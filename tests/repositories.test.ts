import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { testDatabase } from './support/database';
import { ChatRepository } from '../src/lib/server/db/chats';
import { SessionRepository, hashSessionToken } from '../src/lib/server/db/sessions';
import { SqliteFlowStore } from '../src/lib/server/db/flows';
import { UserRepository } from '../src/lib/server/db/users';

let db: Database.Database;
let users: UserRepository;
let chats: ChatRepository;

beforeEach(() => {
  db = testDatabase();
  users = new UserRepository(db);
  chats = new ChatRepository(db);
});
afterEach(() => db.close());

describe('repositories', () => {
  it('orders messages and isolates chat owners', () => {
    const alice = users.create({ username: 'alice' });
    const bob = users.create({ username: 'bob' });
    const chat = chats.create(alice.id, 'Hello');
    chats.append(alice.id, chat.id, 'user', 'one');
    chats.append(alice.id, chat.id, 'assistant', 'two');
    expect(chats.get(alice.id, chat.id)?.messages.map((message) => message.content)).toEqual([
      'one',
      'two'
    ]);
    expect(chats.get(bob.id, chat.id)).toBeNull();
    expect(chats.rename(bob.id, chat.id, 'Stolen')).toBe(false);
    expect(chats.delete(bob.id, chat.id)).toBe(false);
  });

  it('cascades messages when a chat is deleted', () => {
    const user = users.create({ username: 'alice' });
    const chat = chats.create(user.id);
    chats.append(user.id, chat.id, 'user', 'hello');
    expect(chats.delete(user.id, chat.id)).toBe(true);
    expect(
      (db.prepare('SELECT count(*) count FROM messages').get() as { count: number }).count
    ).toBe(0);
  });

  it('enforces case-insensitive username and message constraints', () => {
    users.create({ username: 'Alice' });
    expect(() => users.create({ username: 'alice' })).toThrow();
    const user = users.getByUsername('ALICE')!;
    const chat = chats.create(user.id);
    expect(chats.append(user.id, chat.id, 'user', '   ')).toBeNull();
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
