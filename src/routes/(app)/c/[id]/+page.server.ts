import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ChatRepository } from '$lib/server/db/chats';
import { getDatabase } from '$lib/server/db/database';

export const load: PageServerLoad = ({ locals, params }) => {
  const chat = new ChatRepository(getDatabase()).get(locals.user!.id, params.id);
  if (!chat) error(404, 'Chat not found');
  return { chat };
};
