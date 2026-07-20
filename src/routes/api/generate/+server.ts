import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseGenerationRequest } from '$lib/server/llm/generation';
import { resolveProviderModel } from '$lib/server/llm/models';
import { consumeOpenAiStream, requestCompletion } from '$lib/server/llm/openai';

const activeConversations = new Set<string>();
const encoder = new TextEncoder();
const event = (type: string, data: object = {}) =>
  encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`);

export const POST: RequestHandler = async ({ locals, request }) => {
  const body = parseGenerationRequest(await request.json().catch(() => null));
  if (!body) return json({ error: 'Invalid or excessive conversation history' }, { status: 400 });

  let selectedModel: string;
  try {
    selectedModel = await resolveProviderModel(body.model);
  } catch {
    return json({ error: 'Model is not available' }, { status: 400 });
  }

  const activeKey = `${locals.user!.id}:${body.conversationId}`;
  if (activeConversations.has(activeKey))
    return json({ error: 'Generation already active' }, { status: 409 });
  activeConversations.add(activeKey);

  const abort = new AbortController();
  request.signal.addEventListener('abort', () => abort.abort(), { once: true });

  let upstream: Response;
  try {
    upstream = await requestCompletion(body.messages, abort.signal, selectedModel);
  } catch {
    activeConversations.delete(activeKey);
    console.error('Completion request failed');
    return json({ error: 'The model provider is unavailable' }, { status: 502 });
  }

  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let assistant = '';
      try {
        await consumeOpenAiStream(upstream.body!, (text) => {
          assistant += text;
          controller.enqueue(event('delta', { content: text }));
        });
        if (!assistant.trim()) throw new Error('Provider returned an empty response');
        controller.enqueue(event('done'));
      } catch {
        if (!cancelled) {
          console.error('Completion stream failed');
          controller.enqueue(event('error', { error: 'The response was interrupted' }));
        }
      } finally {
        activeConversations.delete(activeKey);
        controller.close();
      }
    },
    cancel() {
      cancelled = true;
      abort.abort();
      activeConversations.delete(activeKey);
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive'
    }
  });
};

export function _resetActiveConversationsForTests(): void {
  activeConversations.clear();
}
