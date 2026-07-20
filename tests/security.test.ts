import { afterEach, describe, expect, it } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { clearSessionCookie, setSessionCookie } from '../src/lib/server/auth/cookies';
import { resetConfigForTests } from '../src/lib/server/config';
import { hasValidRequestOrigin } from '../src/lib/server/security';

const originalBase = process.env.PUBLIC_BASE_URL;
afterEach(() => {
  process.env.PUBLIC_BASE_URL = originalBase;
  resetConfigForTests();
});

describe('request security', () => {
  it('rejects cross-origin mutations', () => {
    const target = new URL('https://chat.example.com/api/chats');
    expect(
      hasValidRequestOrigin(
        new Request(target, { method: 'POST', headers: { origin: 'https://evil.example' } }),
        target
      )
    ).toBe(false);
    expect(
      hasValidRequestOrigin(
        new Request(target, { method: 'POST', headers: { origin: target.origin } }),
        target
      )
    ).toBe(true);
    expect(hasValidRequestOrigin(new Request(target, { method: 'POST' }), target)).toBe(false);
    expect(hasValidRequestOrigin(new Request(target), target)).toBe(true);
  });

  it('sets an opaque session cookie with hardened attributes', () => {
    process.env.PUBLIC_BASE_URL = 'https://chat.example.com';
    resetConfigForTests();
    let captured: { name?: string; value?: string; options?: Record<string, unknown> } = {};
    const cookies = {
      set(name: string, value: string, options: Record<string, unknown>) {
        captured = { name, value, options };
      },
      delete() {}
    } as unknown as Cookies;
    setSessionCookie(cookies, 'opaque', Date.now() + 1000);
    expect(captured.value).toBe('opaque');
    expect(captured.options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/'
    });
    clearSessionCookie(cookies);
  });
});
