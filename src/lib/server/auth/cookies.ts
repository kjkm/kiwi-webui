import type { Cookies } from '@sveltejs/kit';
import { getConfig } from '$lib/server/config';
import { SESSION_COOKIE } from '$lib/server/db/sessions';

export const OIDC_FLOW_COOKIE = 'kiwi_oidc_flow';

function secure(): boolean {
  return new URL(getConfig().publicBaseUrl).protocol === 'https:';
}

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: number): void {
  cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: secure(),
    expires: new Date(expiresAt)
  });
}

export function clearSessionCookie(cookies: Cookies): void {
  cookies.delete(SESSION_COOKIE, { path: '/', secure: secure(), sameSite: 'lax' });
}

export function setFlowCookie(cookies: Cookies, handle: string): void {
  cookies.set(OIDC_FLOW_COOKIE, handle, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: secure(),
    maxAge: 10 * 60
  });
}

export function clearFlowCookie(cookies: Cookies): void {
  cookies.delete(OIDC_FLOW_COOKIE, { path: '/', secure: secure(), sameSite: 'lax' });
}
