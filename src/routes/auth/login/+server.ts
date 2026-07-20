import type { RequestHandler } from './$types';
import { getConfig } from '$lib/server/config';
import { getOidcClient } from '$lib/server/auth/oidc';
import { setFlowCookie } from '$lib/server/auth/cookies';

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const client = await getOidcClient();
    const callback = `${getConfig().publicBaseUrl}/auth/callback`;
    const { url, flowHandle } = await client.startAuthorization(callback);
    setFlowCookie(cookies, flowHandle);
    return new Response(null, { status: 303, headers: { location: url } });
  } catch (error) {
    console.error('OIDC sign-in start failed', error);
    return new Response(null, { status: 303, headers: { location: '/signin?error=sso' } });
  }
};
