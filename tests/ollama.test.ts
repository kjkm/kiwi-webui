import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetConfigForTests } from '../src/lib/server/config';
import {
  canonicalOllamaModelName,
  ensureOllamaModelReady,
  preloadOllamaModel,
  resetOllamaLoadsForTests
} from '../src/lib/server/llm/ollama';

const asFetcher = (implementation: (url: string, init?: RequestInit) => Promise<Response>) =>
  implementation as typeof fetch;

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'native-key';
  process.env.OLLAMA_BASE_URL = 'http://ollama.test/';
  resetConfigForTests();
  resetOllamaLoadsForTests();
});

afterEach(() => {
  delete process.env.OLLAMA_BASE_URL;
  resetConfigForTests();
  resetOllamaLoadsForTests();
  vi.restoreAllMocks();
});

describe('Ollama model loading', () => {
  it('normalizes case and an omitted latest tag', () => {
    expect(canonicalOllamaModelName('Library/Model')).toBe('library/model:latest');
    expect(canonicalOllamaModelName('library/model:Q4')).toBe('library/model:q4');
  });

  it('recognizes resident models by name or model field', async () => {
    const fetcher = asFetcher(async () =>
      Response.json({ models: [{ name: 'other:latest' }, { model: 'LIBRARY/MODEL' }] })
    );
    expect(await ensureOllamaModelReady('library/model:latest', { fetcher })).toBe('resident');
  });

  it('returns unknown and does not preload when the residency probe fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let requests = 0;
    const fetcher = asFetcher(async () => {
      requests++;
      return new Response(null, { status: 503 });
    });
    expect(await ensureOllamaModelReady('model', { fetcher })).toBe('unknown');
    expect(requests).toBe(1);
    expect(warning).toHaveBeenCalledWith('Ollama residency check failed');
  });

  it('preloads with an empty non-streaming chat and server credential', async () => {
    let preload: { url: string; init?: RequestInit } | undefined;
    const fetcher = asFetcher(async (url, init) => {
      if (url.endsWith('/api/ps')) return Response.json({ models: [] });
      preload = { url, init };
      return Response.json({ done: true });
    });
    const loading = vi.fn();

    expect(await ensureOllamaModelReady('model:tag', { fetcher, onLoading: loading })).toBe(
      'loaded'
    );
    expect(loading).toHaveBeenCalledOnce();
    expect(preload?.url).toBe('http://ollama.test/api/chat');
    expect(preload?.init?.headers).toMatchObject({ authorization: 'Bearer native-key' });
    expect(JSON.parse(String(preload?.init?.body))).toEqual({
      model: 'model:tag',
      messages: [],
      stream: false
    });
  });

  it('reports preload failures and bounded timeouts', async () => {
    await expect(
      preloadOllamaModel(
        'model',
        asFetcher(async () => new Response(null, { status: 500 })),
        50
      )
    ).rejects.toThrow(/preload request failed/);

    const hanging = asFetcher(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError'))
          );
        })
    );
    await expect(preloadOllamaModel('model', hanging, 5)).rejects.toThrow(/timed out/);
  });

  it('deduplicates concurrent preloads without coupling them to one request signal', async () => {
    let preloadRequests = 0;
    let finishPreload!: () => void;
    const preloadResponse = new Promise<void>((resolve) => (finishPreload = resolve));
    const fetcher = asFetcher(async (url) => {
      if (url.endsWith('/api/ps')) return Response.json({ models: [] });
      preloadRequests++;
      await preloadResponse;
      return Response.json({ done: true });
    });
    const firstSignal = new AbortController();
    const first = ensureOllamaModelReady('model', { fetcher, signal: firstSignal.signal });
    const second = ensureOllamaModelReady('model:latest', { fetcher });

    await vi.waitFor(() => expect(preloadRequests).toBe(1));
    firstSignal.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    finishPreload();
    await expect(second).resolves.toBe('loaded');
    expect(preloadRequests).toBe(1);
  });

  it('does nothing when Ollama integration is disabled', async () => {
    delete process.env.OLLAMA_BASE_URL;
    resetConfigForTests();
    const fetcher = vi.fn();
    expect(await ensureOllamaModelReady('model', { fetcher: fetcher as typeof fetch })).toBe(
      'disabled'
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
