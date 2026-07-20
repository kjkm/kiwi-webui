import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearSessionCookie } from '$lib/server/auth/cookies';
import { getDatabase } from '$lib/server/db/database';
import { SessionRepository } from '$lib/server/db/sessions';

export const POST: RequestHandler = async ({ cookies, locals }) => {
  new SessionRepository(getDatabase()).revoke(locals.sessionToken ?? undefined);
  clearSessionCookie(cookies);
  redirect(303, '/signin');
};
