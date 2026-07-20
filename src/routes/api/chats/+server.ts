import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ChatRepository, validTitle } from '$lib/server/db/chats';
import { getDatabase } from '$lib/server/db/database';

export const GET: RequestHandler = ({ locals }) => {
  return json({ chats: new ChatRepository(getDatabase()).list(locals.user!.id) });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const body = (await request.json().catch(() => ({}))) as { title?: unknown };
  const title = body.title === undefined ? 'New chat' : body.title;
  if (!validTitle(title)) return json({ error: 'Title must be 1–120 characters' }, { status: 400 });
  const chat = new ChatRepository(getDatabase()).create(locals.user!.id, title);
  return json({ chat }, { status: 201 });
};
