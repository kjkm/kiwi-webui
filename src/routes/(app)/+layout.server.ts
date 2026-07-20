import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { ChatRepository } from '$lib/server/db/chats';
import { getDatabase } from '$lib/server/db/database';
import { getConfig } from '$lib/server/config';

export const load: LayoutServerLoad = ({ locals }) => {
  if (!locals.user) redirect(303, '/signin');
  return {
    appName: getConfig().appName,
    defaultModel: getConfig().openai.model,
    user: locals.user,
    chats: new ChatRepository(getDatabase()).list(locals.user.id)
  };
};
