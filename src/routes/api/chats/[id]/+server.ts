import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ChatRepository, validTitle } from '$lib/server/db/chats';
import { getDatabase } from '$lib/server/db/database';

export const GET: RequestHandler = ({ locals, params }) => {
  const chat = new ChatRepository(getDatabase()).get(locals.user!.id, params.id);
  return chat ? json({ chat }) : json({ error: 'Chat not found' }, { status: 404 });
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const body = (await request.json().catch(() => ({}))) as { title?: unknown };
  if (!validTitle(body.title))
    return json({ error: 'Title must be 1–120 characters' }, { status: 400 });
  const updated = new ChatRepository(getDatabase()).rename(locals.user!.id, params.id, body.title);
  return updated ? json({ ok: true }) : json({ error: 'Chat not found' }, { status: 404 });
};

export const DELETE: RequestHandler = ({ locals, params }) => {
  const deleted = new ChatRepository(getDatabase()).delete(locals.user!.id, params.id);
  return deleted
    ? new Response(null, { status: 204 })
    : json({ error: 'Chat not found' }, { status: 404 });
};
