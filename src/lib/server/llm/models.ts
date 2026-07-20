import type { ModelInfo } from '$lib/models';
import { getConfig, missingProviderConfig } from '$lib/server/config';

export type { ModelInfo } from '$lib/models';

let cache: { expiresAt: number; models: ModelInfo[] } | null = null;

function defaultModel(): ModelInfo {
  const id = getConfig().openai.model;
  return { id, name: id, ownedBy: null };
}

export async function getProviderModels(fetcher: typeof fetch = fetch): Promise<ModelInfo[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.models;

  const config = getConfig();
  const missing = missingProviderConfig(config);
  if (missing.length) throw new Error(`Provider unavailable: missing ${missing.join(', ')}`);

  const response = await fetcher(`${config.openai.baseUrl}/models`, {
    headers: {
      authorization: `Bearer ${config.openai.apiKey}`,
      accept: 'application/json'
    }
  });
  if (!response.ok) throw new Error(`Provider model request failed (${response.status})`);

  const payload = (await response.json()) as {
    data?: Array<{ id?: unknown; name?: unknown; owned_by?: unknown }>;
  };
  const byId = new Map<string, ModelInfo>();
  for (const item of payload.data ?? []) {
    if (typeof item.id !== 'string' || !item.id.trim()) continue;
    byId.set(item.id, {
      id: item.id,
      name: typeof item.name === 'string' && item.name.trim() ? item.name : item.id,
      ownedBy: typeof item.owned_by === 'string' ? item.owned_by : null
    });
  }

  const fallback = defaultModel();
  if (fallback.id && !byId.has(fallback.id)) byId.set(fallback.id, fallback);
  const models = [...byId.values()].sort((a, b) => {
    if (a.id === fallback.id) return -1;
    if (b.id === fallback.id) return 1;
    return a.name.localeCompare(b.name);
  });
  cache = { models, expiresAt: Date.now() + 60_000 };
  return models;
}

export async function availableProviderModels(fetcher: typeof fetch = fetch): Promise<ModelInfo[]> {
  try {
    return await getProviderModels(fetcher);
  } catch {
    const fallback = defaultModel();
    return fallback.id ? [fallback] : [];
  }
}

export async function resolveProviderModel(requested: unknown): Promise<string> {
  const fallback = getConfig().openai.model;
  if (requested === undefined || requested === null || requested === '') return fallback;
  if (typeof requested !== 'string' || requested.length > 200) throw new Error('Invalid model');
  if (requested === fallback) return requested;
  const models = await getProviderModels();
  if (!models.some((model) => model.id === requested)) throw new Error('Unknown model');
  return requested;
}

export function resetModelCacheForTests(): void {
  cache = null;
}
