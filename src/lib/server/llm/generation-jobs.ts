import {
  formatGenerationEvent,
  type GenerationEventData,
  type SequencedGenerationEvent
} from '$lib/generation-events';

export interface GenerationJobLimits {
  maxActivePerUser: number;
  maxRetainedPerUser: number;
  maxRetainedProcess: number;
  maxRuntimeMs: number;
  retentionMs: number;
  maxOutputCharacters: number;
  maxEventBytes: number;
  heartbeatMs: number;
}

export const DEFAULT_GENERATION_JOB_LIMITS: GenerationJobLimits = {
  maxActivePerUser: 4,
  maxRetainedPerUser: 20,
  maxRetainedProcess: 1000,
  maxRuntimeMs: 10 * 60 * 1000,
  retentionMs: 10 * 60 * 1000,
  maxOutputCharacters: 32_000,
  maxEventBytes: 128_000,
  heartbeatMs: 15_000
};

export type GenerationJobState = 'running' | 'completed' | 'failed';

interface Subscriber {
  controller: ReadableStreamDefaultController<Uint8Array>;
  heartbeat: ReturnType<typeof setInterval>;
}

export interface CreateGenerationJob {
  id: string;
  userId: string;
  conversationId: string;
  model: string;
}

export class GenerationJobError extends Error {
  constructor(
    readonly code: 'not_found' | 'conflict' | 'limit',
    message: string
  ) {
    super(message);
  }
}

export class GenerationJob {
  readonly abortController = new AbortController();
  readonly events: SequencedGenerationEvent[] = [];
  readonly createdAt: number;
  state: GenerationJobState = 'running';
  terminalAt: number | null = null;
  outputCharacters = 0;
  eventBytes = 0;
  private sequence = 0;
  private readonly subscribers = new Set<Subscriber>();
  private runtimeTimer: ReturnType<typeof setTimeout>;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly id: string,
    readonly userId: string,
    readonly conversationId: string,
    readonly model: string,
    private readonly registry: GenerationJobRegistry,
    private readonly limits: GenerationJobLimits,
    now: number
  ) {
    this.createdAt = now;
    this.runtimeTimer = setTimeout(() => {
      if (this.state !== 'running') return;
      this.abortController.abort();
      this.fail('The response timed out');
    }, limits.maxRuntimeMs);
    this.unref(this.runtimeTimer);
  }

  append(data: GenerationEventData): boolean {
    if (this.state !== 'running') return false;
    const contentLength = data.type === 'delta' ? data.content.length : 0;
    const bytes = new TextEncoder().encode(JSON.stringify(data)).byteLength;
    if (
      this.outputCharacters + contentLength > this.limits.maxOutputCharacters ||
      this.eventBytes + bytes > this.limits.maxEventBytes
    ) {
      this.abortController.abort();
      this.forceTerminal(
        { type: 'error', error: 'The response exceeded the allowed size' },
        'failed'
      );
      return false;
    }

    this.outputCharacters += contentLength;
    this.eventBytes += bytes;
    const event = { sequence: ++this.sequence, data };
    this.events.push(event);
    this.broadcast(event);
    if (data.type === 'done') this.finish('completed');
    if (data.type === 'error') this.finish('failed');
    return true;
  }

  fail(message: string): void {
    if (this.state === 'running') this.forceTerminal({ type: 'error', error: message }, 'failed');
  }

  subscribe(after: number, follow = true): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let subscriber: Subscriber | null = null;
    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        for (const event of this.events) {
          if (event.sequence > after)
            controller.enqueue(encoder.encode(formatGenerationEvent(event)));
        }
        if (this.state !== 'running' || !follow) {
          controller.close();
          return;
        }
        subscriber = {
          controller,
          heartbeat: setInterval(() => {
            try {
              controller.enqueue(encoder.encode(': keep-alive\n\n'));
            } catch {
              if (subscriber) this.detach(subscriber);
            }
          }, this.limits.heartbeatMs)
        };
        this.unref(subscriber.heartbeat);
        this.subscribers.add(subscriber);
      },
      cancel: () => {
        if (subscriber) this.detach(subscriber);
      }
    });
  }

  closeSubscribers(): void {
    for (const subscriber of [...this.subscribers]) {
      clearInterval(subscriber.heartbeat);
      try {
        subscriber.controller.close();
      } catch {
        // The transport already closed.
      }
      this.subscribers.delete(subscriber);
    }
  }

  dispose(abort: boolean): void {
    if (abort && this.state === 'running') {
      this.state = 'failed';
      this.terminalAt = this.registry.now();
      this.abortController.abort();
    }
    clearTimeout(this.runtimeTimer);
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.closeSubscribers();
    this.events.length = 0;
    this.outputCharacters = 0;
    this.eventBytes = 0;
  }

  private forceTerminal(data: GenerationEventData, state: 'completed' | 'failed'): void {
    const event = { sequence: ++this.sequence, data };
    this.events.push(event);
    this.eventBytes += new TextEncoder().encode(JSON.stringify(data)).byteLength;
    this.broadcast(event);
    this.finish(state);
  }

  private finish(state: 'completed' | 'failed'): void {
    if (this.state !== 'running') return;
    this.state = state;
    this.terminalAt = this.registry.now();
    clearTimeout(this.runtimeTimer);
    this.registry.releaseConversation(this);
    this.closeSubscribers();
    this.expiryTimer = setTimeout(() => this.registry.removeExpired(this), this.limits.retentionMs);
    this.unref(this.expiryTimer);
  }

  private broadcast(event: SequencedGenerationEvent): void {
    const bytes = new TextEncoder().encode(formatGenerationEvent(event));
    for (const subscriber of [...this.subscribers]) {
      try {
        subscriber.controller.enqueue(bytes);
      } catch {
        this.detach(subscriber);
      }
    }
  }

  private detach(subscriber: Subscriber): void {
    clearInterval(subscriber.heartbeat);
    this.subscribers.delete(subscriber);
  }

  private unref(timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>): void {
    if (typeof timer === 'object' && 'unref' in timer) timer.unref();
  }
}

export class GenerationJobRegistry {
  private readonly jobs = new Map<string, GenerationJob>();
  private readonly activeConversations = new Map<string, string>();

  constructor(
    readonly limits: GenerationJobLimits = DEFAULT_GENERATION_JOB_LIMITS,
    readonly now: () => number = Date.now
  ) {}

  createOrGet(
    input: CreateGenerationJob,
    start: (job: GenerationJob) => void
  ): { job: GenerationJob; created: boolean } {
    this.cleanupExpired();
    const existing = this.jobs.get(input.id);
    if (existing) {
      if (existing.userId !== input.userId)
        throw new GenerationJobError('not_found', 'Job not found');
      if (existing.conversationId !== input.conversationId || existing.model !== input.model) {
        throw new GenerationJobError('conflict', 'Generation identity conflicts with existing job');
      }
      return { job: existing, created: false };
    }

    const conversationKey = this.conversationKey(input.userId, input.conversationId);
    if (this.activeConversations.has(conversationKey)) {
      throw new GenerationJobError('conflict', 'Generation already active');
    }
    this.ensureCapacity(input.userId);

    const job = new GenerationJob(
      input.id,
      input.userId,
      input.conversationId,
      input.model,
      this,
      this.limits,
      this.now()
    );
    this.jobs.set(job.id, job);
    this.activeConversations.set(conversationKey, job.id);
    queueMicrotask(() => start(job));
    return { job, created: true };
  }

  owned(userId: string, id: string): GenerationJob | null {
    this.cleanupExpired();
    const job = this.jobs.get(id);
    return job?.userId === userId ? job : null;
  }

  remove(userId: string, id: string): boolean {
    const job = this.owned(userId, id);
    if (!job) return false;
    this.removeJob(job, true);
    return true;
  }

  releaseConversation(job: GenerationJob): void {
    const key = this.conversationKey(job.userId, job.conversationId);
    if (this.activeConversations.get(key) === job.id) this.activeConversations.delete(key);
  }

  removeExpired(job: GenerationJob): void {
    if (job.state === 'running' || job.terminalAt === null) return;
    if (job.terminalAt + this.limits.retentionMs <= this.now()) this.removeJob(job, false);
  }

  cleanupExpired(): void {
    for (const job of this.jobs.values()) this.removeExpired(job);
  }

  reset(): void {
    for (const job of this.jobs.values()) job.dispose(true);
    this.jobs.clear();
    this.activeConversations.clear();
  }

  size(): number {
    return this.jobs.size;
  }

  private ensureCapacity(userId: string): void {
    const userJobs = [...this.jobs.values()].filter((job) => job.userId === userId);
    if (userJobs.filter((job) => job.state === 'running').length >= this.limits.maxActivePerUser) {
      throw new GenerationJobError('limit', 'Too many active generations');
    }
    this.evictTerminal(userJobs, this.limits.maxRetainedPerUser - 1);
    this.evictTerminal([...this.jobs.values()], this.limits.maxRetainedProcess - 1);
    if (
      [...this.jobs.values()].filter((job) => job.userId === userId).length >=
      this.limits.maxRetainedPerUser
    ) {
      throw new GenerationJobError('limit', 'Too many retained generations');
    }
    if (this.jobs.size >= this.limits.maxRetainedProcess) {
      throw new GenerationJobError('limit', 'Generation capacity is unavailable');
    }
  }

  private evictTerminal(jobs: GenerationJob[], maximumAfterEviction: number): void {
    const ordered = jobs
      .filter((job) => job.state !== 'running')
      .sort((a, b) => (a.terminalAt ?? 0) - (b.terminalAt ?? 0));
    let current = jobs.length;
    for (const job of ordered) {
      if (current <= maximumAfterEviction) break;
      this.removeJob(job, false);
      current--;
    }
  }

  private removeJob(job: GenerationJob, abort: boolean): void {
    if (this.jobs.get(job.id) !== job) return;
    this.jobs.delete(job.id);
    this.releaseConversation(job);
    job.dispose(abort);
  }

  private conversationKey(userId: string, conversationId: string): string {
    return `${userId}:${conversationId}`;
  }
}

export function generationJobStreamResponse(
  job: GenerationJob,
  after: number,
  follow = true
): Response {
  return new Response(job.subscribe(after, follow), {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive'
    }
  });
}

export const generationJobs = new GenerationJobRegistry();
