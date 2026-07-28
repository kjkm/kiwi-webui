import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseEventSequence } from '$lib/generation-events';
import { generationJobs, generationJobStreamResponse } from '$lib/server/llm/generation-jobs';

export const GET: RequestHandler = ({ locals, params, url }) => {
  const after = parseEventSequence(url.searchParams.get('after') ?? '0');
  if (after === null) return json({ error: 'Invalid event cursor' }, { status: 400 });
  const job = generationJobs.owned(locals.user!.id, params.id);
  if (!job) return json({ error: 'Generation not found' }, { status: 404 });
  return generationJobStreamResponse(job, after, url.searchParams.get('follow') !== 'false');
};

export const DELETE: RequestHandler = ({ locals, params }) => {
  if (!generationJobs.remove(locals.user!.id, params.id)) {
    return json({ error: 'Generation not found' }, { status: 404 });
  }
  return new Response(null, { status: 204 });
};
