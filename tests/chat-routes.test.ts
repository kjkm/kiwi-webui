import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../src/lib/server/config';
import { closeDatabase, getDatabase } from '../src/lib/server/db/database';
import { UserRepository } from '../src/lib/server/db/users';
import {
  POST as generate,
  _resetActiveConversationsForTests
} from '../src/routes/api/generate/+server';

let provider: Server;
let mode: 'success' | 'error' | 'slow' = 'success';
let requests = 0;
let alice: ReturnType<UserRepository['create']>;
let bob: ReturnType<UserRepository['create']>;
const conversationId = '00000000-0000-4000-8000-000000000001';

function event(
  user: typeof alice,
  id = conversationId,
  messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: 'hello' }
  ]
) {
  return {
    locals: { user },
    request: new Request('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({ conversationId: id, messages })
    })
  } as never;
}

beforeAll(async () => {
  process.env.DATABASE_PATH = ':memory:';
  process.env.PUBLIC_BASE_URL = 'http://localhost';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL = 'test-model';
  provider = createServer((_request, response) => {
    requests++;
    if (mode === 'error') {
      response.writeHead(500).end('failed');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.flushHeaders();
    const finish = () =>
      response.end('data: {"choices":[{"delta":{"content":"answer"}}]}\n\ndata: [DONE]\n\n');
    if (mode === 'slow') setTimeout(finish, 100);
    else finish();
  });
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  if (!address || typeof address === 'string') throw new Error('provider did not bind');
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
  resetConfigForTests();
});

afterAll(async () => {
  closeDatabase();
  await new Promise<void>((resolve) => provider.close(() => resolve()));
});

beforeEach(() => {
  const db = getDatabase();
  db.prepare('DELETE FROM users').run();
  const users = new UserRepository(db);
  alice = users.create({ username: 'alice' });
  bob = users.create({ username: 'bob' });
  mode = 'success';
  requests = 0;
  _resetActiveConversationsForTests();
});

describe('stateless generation route', () => {
  it('streams a completed turn without persisting conversation content', async () => {
    const response = await generate(event(alice));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('answer');
    const tables = getDatabase()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).not.toContain('chats');
    expect(tables).not.toContain('messages');
  });

  it('rejects malformed history before contacting the provider', async () => {
    const response = await generate(event(alice, 'invalid'));
    expect(response.status).toBe(400);
    expect(requests).toBe(0);
  });

  it('returns provider failure without writing content', async () => {
    mode = 'error';
    const response = await generate(event(alice));
    expect(response.status).toBe(502);
    expect(requests).toBe(1);
  });

  it('serializes generation per user and conversation and releases cancellation', async () => {
    mode = 'slow';
    const first = await generate(event(alice));
    const conflict = await generate(event(alice));
    expect(conflict.status).toBe(409);
    const otherUser = await generate(event(bob));
    expect(otherUser.status).toBe(200);
    await Promise.all([first.body?.cancel(), otherUser.body?.cancel()]);
    await new Promise((resolve) => setTimeout(resolve, 130));
    mode = 'success';
    const retry = await generate(event(alice));
    expect(retry.status).toBe(200);
    await retry.body?.cancel();
  });
});
