import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { missingProviderConfig } from '$lib/server/config';
import { oidcReadinessError } from '$lib/server/auth/oidc';

export const GET: RequestHandler = () => {
  const oidc = oidcReadinessError();
  const provider = missingProviderConfig();
  const errors = [
    ...(oidc ? [oidc] : []),
    ...(provider.length ? [`Missing configuration: ${provider.join(', ')}`] : [])
  ];
  return json({ ready: errors.length === 0, errors }, { status: errors.length ? 503 : 200 });
};
