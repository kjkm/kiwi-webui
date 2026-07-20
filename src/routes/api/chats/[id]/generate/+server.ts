import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ChatRepository, validMessage } from '$lib/server/db/chats';
import { getDatabase } from '$lib/server/db/database';
import { consumeOpenAiStream, requestCompletion } from '$lib/server/llm/openai';

const activeChats = new Set<string>();
const encoder = new TextEncoder();
const event = (type: string, data: object) =>
  encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`);

export const POST: RequestHandler = async ({ locals, params, request }) => {
  const userId = locals.user!.id;
  const chats = new ChatRepository(getDatabase());
  if (!chats.get(userId, params.id)) return json({ error: 'Chat not found' }, { status: 404 });
  if (activeChats.has(params.id))
    return json({ error: 'Generation already active' }, { status: 409 });

  const body = (await request.json().catch(() => ({}))) as { content?: unknown };
  if (!validMessage(body.content))
    return json({ error: 'Message must be 1–32000 characters' }, { status: 400 });

  activeChats.add(params.id);
  const userMessage = chats.append(userId, params.id, 'user', body.content);
  const history = chats.get(userId, params.id)!;
  const abort = new AbortController();
  request.signal.addEventListener('abort', () => abort.abort(), { once: true });

  let upstream: Response;
  try {
    upstream = await requestCompletion(
      history.messages.map(({ role, content }) => ({ role, content })),
      abort.signal
    );
  } catch (error) {
    activeChats.delete(params.id);
    console.error('Completion request failed', error);
    return json({ error: 'The model provider is unavailable', userMessage }, { status: 502 });
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
        const message = chats.append(userId, params.id, 'assistant', assistant);
        controller.enqueue(event('done', { message }));
      } catch (error) {
        if (!cancelled) {
          console.error('Completion stream failed', error);
          controller.enqueue(event('error', { error: 'The response was interrupted' }));
        }
      } finally {
        activeChats.delete(params.id);
        controller.close();
      }
    },
    cancel() {
      cancelled = true;
      abort.abort();
      activeChats.delete(params.id);
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

export function _resetActiveChatsForTests(): void {
  activeChats.clear();
}
