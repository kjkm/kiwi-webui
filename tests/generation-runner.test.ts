import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GENERATION_JOB_LIMITS,
  GenerationJobRegistry
} from '../src/lib/server/llm/generation-jobs';
import { runGenerationJob } from '../src/lib/server/llm/generation-runner';
import type { ensureOllamaModelReady } from '../src/lib/server/llm/ollama';
import type { consumeOpenAiStream, requestCompletion } from '../src/lib/server/llm/openai';

const create = (overrides = {}) => {
  const registry = new GenerationJobRegistry({ ...DEFAULT_GENERATION_JOB_LIMITS, ...overrides });
  const job = registry.createOrGet(
    { id: 'job', userId: 'user', conversationId: 'conversation', model: 'model' },
    () => undefined
  ).job;
  return { registry, job };
};

const successfulRequest = (async () =>
  new Response('stream', { status: 200 })) as typeof requestCompletion;

afterEach(() => vi.restoreAllMocks());

describe('generation job runner', () => {
  it('continues Ollama loading and inference after its subscriber disconnects', async () => {
    const { registry, job } = create();
    let finishLoading!: () => void;
    const loading = new Promise<void>((resolve) => (finishLoading = resolve));
    const ensureModel = (async (_model, options) => {
      options?.onLoading?.();
      await loading;
      return 'loaded';
    }) as typeof ensureOllamaModelReady;
    const request = vi.fn(successfulRequest);
    const consume = (async (_body, onDelta) => onDelta('answer')) as typeof consumeOpenAiStream;
    const messages = [{ role: 'user' as const, content: 'private prompt' }];

    const running = runGenerationJob(job, messages, { ensureModel, request, consume });
    const reader = job.subscribe(0).getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('loading_model');
    await reader.cancel();
    finishLoading();
    await running;

    expect(request).toHaveBeenCalledOnce();
    expect(job.state).toBe('completed');
    expect(messages).toEqual([]);
    expect(await new Response(job.subscribe(0)).text()).toContain('answer');
    registry.reset();
  });

  it('records a safe provider failure without logging content', async () => {
    const { registry, job } = create();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const messages = [{ role: 'user' as const, content: 'private prompt' }];
    const request = (async () => {
      throw new Error('provider included private prompt');
    }) as typeof requestCompletion;

    await runGenerationJob(job, messages, { request });
    const replay = await new Response(job.subscribe(0)).text();
    expect(replay).toContain('model provider is unavailable');
    expect(replay).not.toContain('private prompt');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private prompt');
    expect(messages).toEqual([]);
    registry.reset();
  });

  it('terminates oversized output without completing', async () => {
    const { registry, job } = create({ maxOutputCharacters: 3 });
    const consume = (async (_body, onDelta) => onDelta('oversized')) as typeof consumeOpenAiStream;
    await runGenerationJob(job, [{ role: 'user', content: 'prompt' }], {
      request: successfulRequest,
      consume
    });
    const replay = await new Response(job.subscribe(0)).text();
    expect(job.state).toBe('failed');
    expect(replay).toContain('allowed size');
    expect(replay).not.toContain('"type":"done"');
    registry.reset();
  });

  it('does not turn explicit cancellation into a replayable provider error', async () => {
    const { registry, job } = create();
    const request = (async (_messages, signal) => {
      await new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      );
      return new Response();
    }) as typeof requestCompletion;
    const running = runGenerationJob(job, [{ role: 'user', content: 'prompt' }], { request });
    await Promise.resolve();
    registry.remove('user', 'job');
    await running;
    expect(registry.owned('user', 'job')).toBeNull();
  });
});
