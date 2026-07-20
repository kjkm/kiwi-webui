import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getConfig } from '$lib/server/config';

export const load: PageServerLoad = ({ locals, url }) => {
  if (locals.user) redirect(303, '/');
  return { appName: getConfig().appName, failed: url.searchParams.get('error') === 'sso' };
};
