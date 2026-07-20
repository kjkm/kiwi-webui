import { describe, expect, it } from 'vitest';
import { missingOidcConfig, missingProviderConfig, parseConfig } from '../src/lib/server/config';

describe('configuration', () => {
  it('parses complete configuration', () => {
    const config = parseConfig({
      PUBLIC_BASE_URL: 'https://chat.example.com/',
      SESSION_TTL_SECONDS: '60',
      OIDC_ISSUER: 'https://auth.example.com',
      OIDC_CLIENT_ID: 'client',
      OIDC_CLIENT_SECRET: 'secret',
      OPENAI_BASE_URL: 'https://llm.example.com/v1/',
      OPENAI_API_KEY: 'key',
      OPENAI_MODEL: 'model'
    });
    expect(config.publicBaseUrl).toBe('https://chat.example.com');
    expect(config.openai.baseUrl).toBe('https://llm.example.com/v1');
    expect(config.sessionTtlSeconds).toBe(60);
    expect(missingOidcConfig(config)).toEqual([]);
    expect(missingProviderConfig(config)).toEqual([]);
  });

  it('reports missing external configuration', () => {
    const config = parseConfig({});
    expect(missingOidcConfig(config)).toContain('OIDC_ISSUER');
    expect(missingProviderConfig(config)).toContain('OPENAI_API_KEY');
  });

  it('rejects malformed values', () => {
    expect(() => parseConfig({ PUBLIC_BASE_URL: 'relative' })).toThrow(/absolute URL/);
    expect(() => parseConfig({ SESSION_TTL_SECONDS: '0' })).toThrow(/positive integer/);
  });
});
