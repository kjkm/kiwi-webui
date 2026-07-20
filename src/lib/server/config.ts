export interface AppConfig {
  appName: string;
  publicBaseUrl: string;
  databasePath: string;
  sessionTtlSeconds: number;
  oidc: {
    issuer: string;
    clientId: string;
    clientSecret: string;
    allowInsecureHttp: boolean;
  };
  openai: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function boolean(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true';
}

export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  const publicBaseUrl = env.PUBLIC_BASE_URL ?? 'http://localhost:5173';
  try {
    new URL(publicBaseUrl);
  } catch {
    throw new Error('PUBLIC_BASE_URL must be an absolute URL');
  }

  return {
    appName: env.PUBLIC_APP_NAME ?? 'Kiwi WebUI',
    publicBaseUrl: publicBaseUrl.replace(/\/$/, ''),
    databasePath: env.DATABASE_PATH ?? './data/kiwi-webui.db',
    sessionTtlSeconds: positiveInteger(
      env.SESSION_TTL_SECONDS,
      14 * 24 * 60 * 60,
      'SESSION_TTL_SECONDS'
    ),
    oidc: {
      issuer: env.OIDC_ISSUER ?? '',
      clientId: env.OIDC_CLIENT_ID ?? '',
      clientSecret: env.OIDC_CLIENT_SECRET ?? '',
      allowInsecureHttp: boolean(env.OIDC_ALLOW_INSECURE_HTTP)
    },
    openai: {
      baseUrl: (env.OPENAI_BASE_URL ?? '').replace(/\/$/, ''),
      apiKey: env.OPENAI_API_KEY ?? '',
      model: env.OPENAI_MODEL ?? ''
    }
  };
}

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  cached ??= parseConfig(process.env);
  return cached;
}

export function resetConfigForTests(): void {
  cached = undefined;
}

export function missingOidcConfig(config = getConfig()): string[] {
  return [
    ['OIDC_ISSUER', config.oidc.issuer],
    ['OIDC_CLIENT_ID', config.oidc.clientId],
    ['OIDC_CLIENT_SECRET', config.oidc.clientSecret]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

export function missingProviderConfig(config = getConfig()): string[] {
  return [
    ['OPENAI_BASE_URL', config.openai.baseUrl],
    ['OPENAI_API_KEY', config.openai.apiKey],
    ['OPENAI_MODEL', config.openai.model]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
}
