import { beforeEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../src/lib/server/config';
import { getProviderModels, resetModelCacheForTests } from '../src/lib/server/llm/models';
import {
  consumeOpenAiStream,
  requestCompletion,
  requestTitleCompletion
} from '../src/lib/server/llm/openai';

function body(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }
  });
}

beforeEach(() => {
  process.env.OPENAI_BASE_URL = 'https://models.example/v1';
  process.env.OPENAI_API_KEY = 'secret';
  process.env.OPENAI_MODEL = 'default-model';
  resetConfigForTests();
  resetModelCacheForTests();
});

describe('OpenAI-compatible model discovery', () => {
  it('lists provider models with the configured default first', async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: 'other-model', owned_by: 'local' },
            { id: 'default-model', name: 'Default Model', owned_by: 'local' }
          ]
        }),
        { headers: { 'content-type': 'application/json' } }
      )) as typeof fetch;
    const models = await getProviderModels(fetcher);
    expect(models.map((model) => model.id)).toEqual(['default-model', 'other-model']);
    expect(models[0]?.name).toBe('Default Model');
  });

  it('sends the selected model in completion requests', async () => {
    let requestBody: { model?: string } = {};
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response('data: [DONE]\\n\\n', { status: 200 });
    }) as typeof fetch;
    await requestCompletion([], new AbortController().signal, 'other-model', fetcher);
    expect(requestBody.model).toBe('other-model');
  });

  it('streams a title without a generation-token cap and includes an internal instruction', async () => {
    let requestBody: {
      model?: string;
      stream?: boolean;
      max_tokens?: number;
      messages?: Array<{ role?: string; content?: string }>;
    } = {};
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        body([
          'data: {"choices":[{"delta":{"content":"Generated "}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"title"}}]}\n\ndata: [DONE]\n\n'
        ]),
        { headers: { 'content-type': 'text/event-stream' } }
      );
    }) as typeof fetch;

    await expect(
      requestTitleCompletion('First message', new AbortController().signal, 'other-model', fetcher)
    ).resolves.toBe('Generated title');
    expect(requestBody).toMatchObject({ model: 'other-model', stream: true });
    expect(requestBody.max_tokens).toBeUndefined();
    expect(requestBody.messages).toEqual([
      expect.objectContaining({ role: 'system' }),
      { role: 'user', content: 'First message' }
    ]);
  });

  it('rejects failed, malformed, and excessive streamed title responses', async () => {
    const failed = (async () => new Response(null, { status: 503 })) as typeof fetch;
    const malformed = (async () =>
      new Response(body(['data: nope\n\n']), {
        headers: { 'content-type': 'text/event-stream' }
      })) as typeof fetch;
    const excessive = (async () =>
      new Response(
        body([
          `data: ${JSON.stringify({ choices: [{ delta: { content: 'x'.repeat(4097) } }] })}\n\n`,
          'data: [DONE]\n\n'
        ]),
        { headers: { 'content-type': 'text/event-stream' } }
      )) as typeof fetch;
    await expect(
      requestTitleCompletion('Message', new AbortController().signal, 'model', failed)
    ).rejects.toThrow(/503/);
    await expect(
      requestTitleCompletion('Message', new AbortController().signal, 'model', malformed)
    ).rejects.toThrow();
    await expect(
      requestTitleCompletion('Message', new AbortController().signal, 'model', excessive)
    ).rejects.toThrow(/excessive title response/);
  });
});

describe('OpenAI-compatible stream parser', () => {
  it('handles split SSE chunks', async () => {
    let text = '';
    await consumeOpenAiStream(
      body(['data: {"choices":[{"delta":{"content":"hel', 'lo"}}]}\n\ndata: [DONE]\n\n']),
      (delta) => (text += delta)
    );
    expect(text).toBe('hello');
  });

  it('rejects malformed and incomplete streams', async () => {
    await expect(consumeOpenAiStream(body(['data: nope\n\n']), () => {})).rejects.toThrow();
    await expect(consumeOpenAiStream(body(['data: {"choices":[]}\n\n']), () => {})).rejects.toThrow(
      /before completion/
    );
  });
});
