import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getConfig } from '$lib/server/config';

export const load: LayoutServerLoad = ({ locals }) => {
  if (!locals.user) redirect(303, '/signin');
  return {
    appName: getConfig().appName,
    defaultModel: getConfig().openai.model,
    user: locals.user
  };
};
