import { beforeEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../src/lib/server/config';
import { getProviderModels, resetModelCacheForTests } from '../src/lib/server/llm/models';
import { consumeOpenAiStream, requestCompletion } from '../src/lib/server/llm/openai';

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
