import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveProviderModel } from '$lib/server/llm/models';
import { requestTitleCompletion } from '$lib/server/llm/openai';
import { normalizeGeneratedTitle, parseTitleRequest } from '$lib/server/llm/title';

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) return json({ error: 'Authentication required' }, { status: 401 });

  const body = parseTitleRequest(await request.json().catch(() => null));
  if (!body) return json({ error: 'Invalid title request' }, { status: 400 });

  let selectedModel: string;
  try {
    selectedModel = await resolveProviderModel(body.model);
  } catch {
    return json({ error: 'Model is not available' }, { status: 400 });
  }

  try {
    const output = await requestTitleCompletion(body.message, request.signal, selectedModel);
    const title = normalizeGeneratedTitle(output);
    if (!title) return json({ error: 'Provider returned an invalid title' }, { status: 502 });
    return json({ title });
  } catch {
    console.error('Title completion failed');
    return json({ error: 'The model provider is unavailable' }, { status: 502 });
  }
};
