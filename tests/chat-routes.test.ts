import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../src/lib/server/config';
import { closeDatabase, getDatabase } from '../src/lib/server/db/database';
import { ChatRepository } from '../src/lib/server/db/chats';
import { UserRepository } from '../src/lib/server/db/users';
import {
  POST as generate,
  _resetActiveChatsForTests
} from '../src/routes/api/chats/[id]/generate/+server';

let provider: Server;
let mode: 'success' | 'error' | 'slow' = 'success';
let requests = 0;
let alice: ReturnType<UserRepository['create']>;
let bob: ReturnType<UserRepository['create']>;
let chatId: string;

function event(user: typeof alice, id: string, content = 'hello') {
  return {
    locals: { user },
    params: { id },
    request: new Request(`http://localhost/api/chats/${id}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({ content })
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
  chatId = new ChatRepository(db).create(alice.id).id;
  mode = 'success';
  requests = 0;
  _resetActiveChatsForTests();
});

describe('generation route', () => {
  it('streams and persists a completed turn', async () => {
    const response = await generate(event(alice, chatId));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('answer');
    expect(
      new ChatRepository(getDatabase()).get(alice.id, chatId)?.messages.map((item) => item.content)
    ).toEqual(['hello', 'answer']);
  });

  it('rejects cross-user access before contacting the provider', async () => {
    const response = await generate(event(bob, chatId));
    expect(response.status).toBe(404);
    expect(requests).toBe(0);
  });

  it('keeps the user message but no assistant message on provider failure', async () => {
    mode = 'error';
    const response = await generate(event(alice, chatId));
    expect(response.status).toBe(502);
    expect(
      new ChatRepository(getDatabase()).get(alice.id, chatId)?.messages.map((item) => item.role)
    ).toEqual(['user']);
  });

  it('serializes generation and cancels without persisting an assistant response', async () => {
    mode = 'slow';
    const first = await generate(event(alice, chatId, 'first'));
    const second = await generate(event(alice, chatId, 'second'));
    expect(second.status).toBe(409);
    await first.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 130));
    expect(
      new ChatRepository(getDatabase()).get(alice.id, chatId)?.messages.map((item) => item.content)
    ).toEqual(['first']);
  });
});
