import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConfig } from '$lib/server/config';
import { availableProviderModels } from '$lib/server/llm/models';

export const GET: RequestHandler = async () => {
  return json({
    models: await availableProviderModels(),
    defaultModel: getConfig().openai.model
  });
};
