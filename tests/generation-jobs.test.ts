import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GENERATION_JOB_LIMITS,
  GenerationJobError,
  GenerationJobRegistry,
  type GenerationJobLimits
} from '../src/lib/server/llm/generation-jobs';

const input = (id: string, userId = 'user', conversationId = 'conversation') => ({
  id,
  userId,
  conversationId,
  model: 'model'
});

const registry = (overrides: Partial<GenerationJobLimits> = {}, now: () => number = Date.now) =>
  new GenerationJobRegistry({ ...DEFAULT_GENERATION_JOB_LIMITS, ...overrides }, now);

afterEach(() => vi.restoreAllMocks());

describe('generation job registry', () => {
  it('creates once, returns idempotently, and isolates ownership', async () => {
    const jobs = registry();
    const start = vi.fn();
    const first = jobs.createOrGet(input('one'), start);
    const retry = jobs.createOrGet(input('one'), start);
    await Promise.resolve();
    expect(first.created).toBe(true);
    expect(retry).toEqual({ job: first.job, created: false });
    expect(start).toHaveBeenCalledOnce();
    expect(jobs.owned('other', 'one')).toBeNull();
    expect(() => jobs.createOrGet(input('one', 'other'), start)).toThrowError(GenerationJobError);
    jobs.reset();
  });

  it('rejects conflicting identities and concurrent conversation jobs', () => {
    const jobs = registry();
    jobs.createOrGet(input('one'), () => undefined);
    expect(() =>
      jobs.createOrGet({ ...input('one'), conversationId: 'different' }, () => undefined)
    ).toThrow(/conflicts/);
    expect(() => jobs.createOrGet(input('two'), () => undefined)).toThrow(/already active/);
    jobs.reset();
  });

  it('replays ordered events after a cursor and closes terminal subscriptions', async () => {
    const jobs = registry();
    const { job } = jobs.createOrGet(input('one'), () => undefined);
    job.append({ type: 'status', status: 'generating' });
    job.append({ type: 'delta', content: 'one' });
    job.append({ type: 'delta', content: 'two' });
    job.append({ type: 'done' });
    const text = await new Response(job.subscribe(1)).text();
    expect(text).not.toContain('generating');
    expect(text.indexOf('one')).toBeLessThan(text.indexOf('two'));
    expect(text).toContain('id: 4');
    jobs.reset();
  });

  it('detaches a subscriber without aborting its running job', async () => {
    const jobs = registry({ heartbeatMs: 5 });
    const { job } = jobs.createOrGet(input('one'), () => undefined);
    const reader = job.subscribe(0).getReader();
    job.append({ type: 'delta', content: 'answer' });
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('answer');
    await reader.cancel();
    expect(job.state).toBe('running');
    expect(job.abortController.signal.aborted).toBe(false);
    job.append({ type: 'done' });
    jobs.reset();
  });

  it('explicitly cancels and removes a running job', () => {
    const jobs = registry();
    const { job } = jobs.createOrGet(input('one'), () => undefined);
    expect(jobs.remove('other', 'one')).toBe(false);
    expect(jobs.remove('user', 'one')).toBe(true);
    expect(job.abortController.signal.aborted).toBe(true);
    expect(jobs.owned('user', 'one')).toBeNull();
  });

  it('times out jobs and expires terminal replay', async () => {
    let now = 100;
    const jobs = registry({ maxRuntimeMs: 5, retentionMs: 5 }, () => now);
    const { job } = jobs.createOrGet(input('one'), () => undefined);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(job.state).toBe('failed');
    expect(await new Response(job.subscribe(0)).text()).toContain('timed out');
    now = 106;
    jobs.cleanupExpired();
    expect(jobs.owned('user', 'one')).toBeNull();
  });

  it('enforces active, retained, process, and output limits', async () => {
    const jobs = registry({
      maxActivePerUser: 1,
      maxRetainedPerUser: 1,
      maxRetainedProcess: 2,
      maxOutputCharacters: 3,
      maxEventBytes: 1000
    });
    const first = jobs.createOrGet(input('one'), () => undefined).job;
    expect(() =>
      jobs.createOrGet(input('two', 'user', 'other-conversation'), () => undefined)
    ).toThrow(/Too many active/);
    expect(first.append({ type: 'delta', content: 'four' })).toBe(false);
    expect(first.state).toBe('failed');
    expect(await new Response(first.subscribe(0)).text()).toContain('allowed size');

    const second = jobs.createOrGet(
      input('two', 'user', 'other-conversation'),
      () => undefined
    ).job;
    expect(jobs.owned('user', 'one')).toBeNull();
    second.append({ type: 'done' });
    jobs.createOrGet(input('three', 'other', 'conversation'), () => undefined);
    expect(jobs.size()).toBe(2);
    expect(() =>
      jobs.createOrGet(input('four', 'third', 'conversation'), () => undefined)
    ).not.toThrow();
    expect(jobs.size()).toBe(2);
    jobs.reset();
  });
});
