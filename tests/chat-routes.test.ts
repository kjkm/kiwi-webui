import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetConfigForTests } from '../src/lib/server/config';
import { closeDatabase, getDatabase } from '../src/lib/server/db/database';
import { UserRepository } from '../src/lib/server/db/users';
import { resetOllamaLoadsForTests } from '../src/lib/server/llm/ollama';
import {
  POST as generate,
  _resetActiveConversationsForTests
} from '../src/routes/api/generate/+server';
import {
  DELETE as removeGeneration,
  GET as replayGeneration
} from '../src/routes/api/generate/[id]/+server';

let provider: Server;
let providerOrigin = '';
let mode: 'success' | 'error' | 'slow' = 'success';
let ollamaMode: 'resident' | 'unloaded' | 'probe-error' | 'preload-error' = 'resident';
let requests = 0;
let psRequests = 0;
let preloadRequests = 0;
let preloadBody: unknown;
let alice: ReturnType<UserRepository['create']>;
let bob: ReturnType<UserRepository['create']>;
const conversationId = '00000000-0000-4000-8000-000000000001';
const generationId = '00000000-0000-4000-8000-000000000002';
const otherGenerationId = '00000000-0000-4000-8000-000000000003';

function event(
  user: typeof alice,
  options: {
    conversationId?: string;
    generationId?: string;
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  } = {}
) {
  return {
    locals: { user },
    request: new Request('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({
        generationId: options.generationId ?? generationId,
        conversationId: options.conversationId ?? conversationId,
        messages: options.messages ?? [{ role: 'user', content: 'hello' }]
      })
    })
  } as never;
}

function jobEvent(user: typeof alice, id: string, after = '0') {
  return {
    locals: { user },
    params: { id },
    url: new URL(`http://localhost/api/generate/${id}?after=${after}`)
  } as never;
}

async function readRequestBody(request: import('node:http').IncomingMessage): Promise<string> {
  return await new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

beforeAll(async () => {
  process.env.DATABASE_PATH = ':memory:';
  process.env.PUBLIC_BASE_URL = 'http://localhost';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL = 'test-model';
  provider = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', providerOrigin);
      if (url.pathname === '/api/ps') {
        psRequests++;
        if (ollamaMode === 'probe-error') return response.writeHead(503).end();
        const models = ollamaMode === 'resident' ? [{ name: 'test-model:latest' }] : [];
        response.writeHead(200, { 'content-type': 'application/json' });
        return response.end(JSON.stringify({ models }));
      }
      if (url.pathname === '/api/chat') {
        preloadRequests++;
        preloadBody = JSON.parse(await readRequestBody(request));
        if (ollamaMode === 'preload-error') return response.writeHead(500).end();
        response.writeHead(200, { 'content-type': 'application/json' });
        return response.end(JSON.stringify({ done: true }));
      }

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
    })();
  });
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  if (!address || typeof address === 'string') throw new Error('provider did not bind');
  providerOrigin = `http://127.0.0.1:${address.port}`;
  process.env.OPENAI_BASE_URL = `${providerOrigin}/v1`;
  resetConfigForTests();
});

afterAll(async () => {
  _resetActiveConversationsForTests();
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
  ollamaMode = 'resident';
  requests = 0;
  psRequests = 0;
  preloadRequests = 0;
  preloadBody = undefined;
  delete process.env.OLLAMA_BASE_URL;
  resetConfigForTests();
  resetOllamaLoadsForTests();
  _resetActiveConversationsForTests();
  vi.restoreAllMocks();
});

describe('resumable generation routes', () => {
  it('streams a sequenced completed turn without persisting conversation content', async () => {
    const response = await generate(event(alice));
    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain('id: 1');
    expect(stream).toContain('"status":"generating"');
    expect(stream).toContain('answer');
    expect(psRequests).toBe(0);
    const tables = getDatabase()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).not.toContain('chats');
    expect(tables).not.toContain('messages');
  });

  it('rejects malformed history and generation IDs before contacting the provider', async () => {
    expect((await generate(event(alice, { conversationId: 'invalid' }))).status).toBe(400);
    expect((await generate(event(alice, { generationId: 'invalid' }))).status).toBe(400);
    expect(requests).toBe(0);
  });

  it('streams provider startup failures without logging conversation content', async () => {
    mode = 'error';
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await generate(
      event(alice, { messages: [{ role: 'user', content: 'secret' }] })
    );
    expect(await response.text()).toContain('The model provider is unavailable');
    expect(requests).toBe(1);
    const diagnostics = JSON.stringify(log.mock.calls);
    expect(diagnostics).not.toContain('secret');
    expect(diagnostics).not.toContain(generationId);
    expect(diagnostics).not.toContain(conversationId);
  });

  it('preserves Ollama loading status and failure behavior inside a job', async () => {
    process.env.OLLAMA_BASE_URL = providerOrigin;
    resetConfigForTests();
    ollamaMode = 'unloaded';
    const response = await generate(event(alice));
    const stream = await response.text();
    expect(psRequests).toBe(1);
    expect(preloadRequests).toBe(1);
    expect(preloadBody).toEqual({ model: 'test-model', messages: [], stream: false });
    expect(stream.indexOf('loading_model')).toBeLessThan(stream.indexOf('"status":"generating"'));
    expect(stream.indexOf('"status":"generating"')).toBeLessThan(stream.indexOf('answer'));

    _resetActiveConversationsForTests();
    requests = 0;
    ollamaMode = 'preload-error';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failed = await generate(event(alice));
    expect(await failed.text()).toContain('The model provider is unavailable');
    expect(requests).toBe(0);
  });

  it('fails open without a false loading status when the residency probe fails', async () => {
    process.env.OLLAMA_BASE_URL = providerOrigin;
    resetConfigForTests();
    ollamaMode = 'probe-error';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const stream = await (await generate(event(alice))).text();
    expect(stream).not.toContain('loading_model');
    expect(stream).toContain('answer');
  });

  it('idempotently resubscribes, conflicts other jobs, and runs inference once', async () => {
    mode = 'slow';
    const first = await generate(event(alice));
    await first.body?.cancel();
    const retry = await generate(event(alice));
    const conflict = await generate(event(alice, { generationId: otherGenerationId }));
    expect(retry.status).toBe(200);
    expect(conflict.status).toBe(409);
    expect(await retry.text()).toContain('answer');
    expect(requests).toBe(1);
  });

  it('replays after a cursor and acknowledges a completed job', async () => {
    await (await generate(event(alice))).text();
    const replay = await replayGeneration(jobEvent(alice, generationId, '1'));
    const text = await replay.text();
    expect(text).not.toContain('id: 1\n');
    expect(text).toContain('answer');
    expect((await replayGeneration(jobEvent(alice, generationId, '-1'))).status).toBe(400);
    expect((await removeGeneration(jobEvent(alice, generationId))).status).toBe(204);
    expect((await replayGeneration(jobEvent(alice, generationId))).status).toBe(404);
  });

  it('does not reveal or mutate jobs across users', async () => {
    mode = 'slow';
    const response = await generate(event(alice));
    await response.body?.cancel();
    expect((await replayGeneration(jobEvent(bob, generationId))).status).toBe(404);
    expect((await removeGeneration(jobEvent(bob, generationId))).status).toBe(404);
    expect((await generate(event(bob))).status).toBe(404);
    expect((await removeGeneration(jobEvent(alice, generationId))).status).toBe(204);
  });

  it('explicit cancellation releases conversation concurrency', async () => {
    mode = 'slow';
    const first = await generate(event(alice));
    await first.body?.cancel();
    expect((await removeGeneration(jobEvent(alice, generationId))).status).toBe(204);
    mode = 'success';
    const retry = await generate(event(alice, { generationId: otherGenerationId }));
    expect(await retry.text()).toContain('answer');
  });
});
