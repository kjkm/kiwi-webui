import { json, type Handle } from '@sveltejs/kit';
import { getDatabase } from '$lib/server/db/database';
import { SessionRepository, SESSION_COOKIE } from '$lib/server/db/sessions';
import { initializeOidc } from '$lib/server/auth/oidc';
import { hasValidRequestOrigin } from '$lib/server/security';

export async function init(): Promise<void> {
  getDatabase();
  await initializeOidc();
}

const publicApiPaths = new Set(['/api/health/ready']);

export const handle: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get(SESSION_COOKIE) ?? null;
  event.locals.sessionToken = token;
  event.locals.user = new SessionRepository(getDatabase()).resolve(token ?? undefined);

  if (!hasValidRequestOrigin(event.request, event.url)) {
    return json({ error: 'Invalid request origin' }, { status: 403 });
  }

  if (
    event.url.pathname.startsWith('/api/') &&
    !publicApiPaths.has(event.url.pathname) &&
    !event.locals.user
  ) {
    return json({ error: 'Authentication required' }, { status: 401 });
  }

  const response = await resolve(event);
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'same-origin');
  response.headers.set('x-frame-options', 'DENY');
  return response;
};
