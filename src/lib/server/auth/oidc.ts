import { OidcClient } from '$lib/server/oidc-core/protocol/index.js';
import { getConfig, missingOidcConfig } from '$lib/server/config';
import { getDatabase } from '$lib/server/db/database';
import { SqliteFlowStore } from '$lib/server/db/flows';

let clientPromise: Promise<OidcClient> | undefined;
let discoveryError: Error | null = null;

export function getOidcClient(): Promise<OidcClient> {
  const config = getConfig();
  const missing = missingOidcConfig(config);
  if (missing.length)
    return Promise.reject(new Error(`Missing OIDC configuration: ${missing.join(', ')}`));
  clientPromise ??= OidcClient.discover({
    issuer: config.oidc.issuer,
    clientId: config.oidc.clientId,
    clientSecret: config.oidc.clientSecret,
    allowInsecureHttp: config.oidc.allowInsecureHttp,
    scope: 'openid profile email',
    flowStore: new SqliteFlowStore(getDatabase())
  })
    .then((client) => {
      discoveryError = null;
      return client;
    })
    .catch((error: unknown) => {
      discoveryError = error instanceof Error ? error : new Error('OIDC discovery failed');
      clientPromise = undefined;
      throw discoveryError;
    });
  return clientPromise;
}

export async function initializeOidc(): Promise<void> {
  try {
    await getOidcClient();
    discoveryError = null;
  } catch (error) {
    discoveryError = error instanceof Error ? error : new Error('OIDC discovery failed');
    console.error(discoveryError.message);
  }
}

export function oidcReadinessError(): string | null {
  const missing = missingOidcConfig();
  if (missing.length) return `Missing configuration: ${missing.join(', ')}`;
  return discoveryError?.message ?? null;
}

export function resetOidcForTests(): void {
  clientPromise = undefined;
  discoveryError = null;
}
