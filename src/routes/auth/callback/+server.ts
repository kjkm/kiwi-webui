import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConfig } from '$lib/server/config';
import { clearFlowCookie, OIDC_FLOW_COOKIE, setSessionCookie } from '$lib/server/auth/cookies';
import { getOidcClient } from '$lib/server/auth/oidc';
import { getDatabase } from '$lib/server/db/database';
import { SessionRepository, SESSION_COOKIE } from '$lib/server/db/sessions';
import { UserRepository } from '$lib/server/db/users';

export const GET: RequestHandler = async ({ cookies, url }) => {
  const flowHandle = cookies.get(OIDC_FLOW_COOKIE);
  clearFlowCookie(cookies);
  try {
    const claims = await (await getOidcClient()).completeCallback(flowHandle, url);
    const users = new UserRepository(getDatabase());
    const outcome = users.resolveOidcIdentity(claims);
    if (outcome.kind === 'refused') throw new Error('Identity resolution refused');
    const user = users.getBySub(claims.sub);
    if (!user) throw new Error('Resolved user missing');
    const sessions = new SessionRepository(getDatabase());
    sessions.revoke(cookies.get(SESSION_COOKIE));
    const session = sessions.create(user.id, getConfig().sessionTtlSeconds);
    setSessionCookie(cookies, session.token, session.expiresAt);
  } catch (error) {
    console.error('OIDC callback failed', error);
    redirect(303, '/signin?error=sso');
  }
  redirect(303, '/');
};
