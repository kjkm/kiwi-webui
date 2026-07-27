import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseGenerationRequest } from '$lib/server/llm/generation';
import {
  generationJobs,
  generationJobStreamResponse,
  GenerationJobError
} from '$lib/server/llm/generation-jobs';
import { runGenerationJob } from '$lib/server/llm/generation-runner';
import { resolveProviderModel } from '$lib/server/llm/models';

export const POST: RequestHandler = async ({ locals, request }) => {
  const body = parseGenerationRequest(await request.json().catch(() => null));
  if (!body) return json({ error: 'Invalid or excessive conversation history' }, { status: 400 });

  let selectedModel: string;
  try {
    selectedModel = await resolveProviderModel(body.model);
  } catch {
    return json({ error: 'Model is not available' }, { status: 400 });
  }

  if (request.signal.aborted) return json({ error: 'Generation cancelled' }, { status: 499 });

  try {
    const { job } = generationJobs.createOrGet(
      {
        id: body.generationId,
        userId: locals.user!.id,
        conversationId: body.conversationId,
        model: selectedModel
      },
      (created) => void runGenerationJob(created, body.messages)
    );
    return generationJobStreamResponse(job, 0);
  } catch (error) {
    if (error instanceof GenerationJobError) {
      if (error.code === 'not_found')
        return json({ error: 'Generation not found' }, { status: 404 });
      if (error.code === 'conflict') return json({ error: error.message }, { status: 409 });
      return json({ error: error.message }, { status: 429 });
    }
    return json({ error: 'Unable to start generation' }, { status: 503 });
  }
};

export function _resetActiveConversationsForTests(): void {
  generationJobs.reset();
}
