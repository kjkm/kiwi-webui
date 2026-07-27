import { getConfig } from '$lib/server/config';

const DEFAULT_PRELOAD_TIMEOUT_MS = 5 * 60 * 1000;
const preloadOperations = new Map<string, Promise<void>>();

interface RunningModel {
  name?: unknown;
  model?: unknown;
}

interface OllamaOptions {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  preloadTimeoutMs?: number;
  onLoading?: () => void;
}

export type OllamaModelState = 'disabled' | 'resident' | 'loaded' | 'unknown';

export function canonicalOllamaModelName(value: string): string {
  const normalized = value.trim().toLowerCase();
  const finalSegment = normalized.slice(normalized.lastIndexOf('/') + 1);
  return finalSegment.includes(':') ? normalized : `${normalized}:latest`;
}

function nativeHeaders(): Record<string, string> {
  const apiKey = getConfig().openai.apiKey;
  return {
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    accept: 'application/json'
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
}

export async function isOllamaModelLoaded(
  model: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<boolean> {
  const baseUrl = getConfig().ollama.baseUrl;
  if (!baseUrl) throw new Error('Ollama integration is not configured');

  const response = await fetcher(`${baseUrl}/api/ps`, {
    headers: nativeHeaders(),
    signal
  });
  if (!response.ok) throw new Error(`Ollama residency request failed (${response.status})`);

  const payload = (await response.json()) as { models?: unknown };
  if (!Array.isArray(payload.models)) throw new Error('Ollama residency response is invalid');
  const selected = canonicalOllamaModelName(model);
  return payload.models.some((item) => {
    if (!item || typeof item !== 'object') return false;
    const running = item as RunningModel;
    return [running.name, running.model].some(
      (value) => typeof value === 'string' && canonicalOllamaModelName(value) === selected
    );
  });
}

export async function preloadOllamaModel(
  model: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = DEFAULT_PRELOAD_TIMEOUT_MS
): Promise<void> {
  const baseUrl = getConfig().ollama.baseUrl;
  if (!baseUrl) throw new Error('Ollama integration is not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { ...nativeHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [], stream: false }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Ollama preload request failed (${response.status})`);
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Ollama preload timed out');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function sharedPreload(model: string, fetcher: typeof fetch, timeoutMs: number): Promise<void> {
  const key = `${getConfig().ollama.baseUrl}\0${canonicalOllamaModelName(model)}`;
  const existing = preloadOperations.get(key);
  if (existing) return existing;

  const operation = preloadOllamaModel(model, fetcher, timeoutMs);
  preloadOperations.set(key, operation);
  void operation.then(
    () => preloadOperations.delete(key),
    () => preloadOperations.delete(key)
  );
  return operation;
}

function awaitWithSignal(operation: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (!signal) return operation;
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(signal.reason ?? new DOMException('The operation was aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    void operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function ensureOllamaModelReady(
  model: string,
  {
    fetcher = fetch,
    signal,
    preloadTimeoutMs = DEFAULT_PRELOAD_TIMEOUT_MS,
    onLoading
  }: OllamaOptions = {}
): Promise<OllamaModelState> {
  if (!getConfig().ollama.baseUrl) return 'disabled';

  let resident: boolean;
  try {
    resident = await isOllamaModelLoaded(model, fetcher, signal);
  } catch {
    throwIfAborted(signal);
    console.warn('Ollama residency check failed');
    return 'unknown';
  }
  if (resident) return 'resident';

  onLoading?.();
  await awaitWithSignal(sharedPreload(model, fetcher, preloadTimeoutMs), signal);
  return 'loaded';
}

export function resetOllamaLoadsForTests(): void {
  preloadOperations.clear();
}
