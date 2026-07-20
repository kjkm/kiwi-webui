import * as oidc from 'openid-client';
import type { FlowStore } from './flow-store.js';
import { OidcProtocolError } from './errors.js';

/**
 * Validated claims out of a completed flow, passed through untransformed:
 * `sub` is required; `preferredUsername`/`email` are surfaced only when the
 * corresponding token claims are strings, exactly as received (no trimming,
 * no case-folding — username normalization is the policy layer's decision).
 */
export interface OidcClaims {
  sub: string;
  preferredUsername?: string;
  email?: string;
}

export interface OidcClientOptions {
  issuer: string;
  clientId: string;
  clientSecret: string;
  flowStore: FlowStore;
  /**
   * Permit a plain-http issuer — development and tests only. Without it an
   * `http:` issuer fails construction loudly instead of silently downgrading
   * transport security. (Deliberately stricter than scheme inference.)
   */
  allowInsecureHttp?: boolean;
  /** OAuth scope for authorization requests. Default: 'openid profile'. */
  scope?: string;
  /** Flow-state lifetime between redirect and callback. Default: 10 minutes. */
  flowTtlMs?: number;
}

const DEFAULT_SCOPE = 'openid profile';
const DEFAULT_FLOW_TTL_MS = 10 * 60_000;

/**
 * The canonical OIDC handshake shared by the sibling apps: boot-time
 * discovery, PKCE S256 + state + nonce authorization, single-use flow state,
 * validated callback exchange. Framework-free — the client speaks URLs and
 * strings, never request/response objects; cookies, sessions, and failure
 * rendering stay in the app.
 */
export class OidcClient {
  private constructor(
    private readonly idp: oidc.Configuration,
    private readonly flowStore: FlowStore,
    private readonly scope: string,
    private readonly flowTtlMs: number,
  ) {}

  /** Discover the issuer once at boot; throws (fail-fast) if it is unreachable. */
  static async discover(opts: OidcClientOptions): Promise<OidcClient> {
    const issuerUrl = new URL(opts.issuer);
    if (issuerUrl.protocol === 'http:' && !opts.allowInsecureHttp) {
      throw new Error(
        `OIDC issuer ${opts.issuer} uses plain http; set allowInsecureHttp only for local development and tests`,
      );
    }
    let idp: oidc.Configuration;
    try {
      idp = await oidc.discovery(
        issuerUrl,
        opts.clientId,
        opts.clientSecret,
        undefined,
        issuerUrl.protocol === 'http:' ? { execute: [oidc.allowInsecureRequests] } : undefined,
      );
    } catch (err) {
      throw new Error(
        `OIDC discovery failed for OIDC_ISSUER=${opts.issuer}; check the URL and that the IdP is reachable`,
        { cause: err },
      );
    }
    return new OidcClient(
      idp,
      opts.flowStore,
      opts.scope ?? DEFAULT_SCOPE,
      opts.flowTtlMs ?? DEFAULT_FLOW_TTL_MS,
    );
  }

  /**
   * Begin a flow: persist fresh PKCE/state/nonce via the flow store, return
   * the authorize URL and the opaque flow handle for the app to round-trip.
   * `redirectUri` is per-call so both existing derivations (request origin,
   * fixed public URL) are expressible.
   */
  async startAuthorization(redirectUri: string): Promise<{ url: string; flowHandle: string }> {
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const flowHandle = await this.flowStore.create({ state, nonce, verifier }, this.flowTtlMs);
    const url = oidc.buildAuthorizationUrl(this.idp, {
      redirect_uri: redirectUri,
      scope: this.scope,
      state,
      nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
    });
    return { url: url.href, flowHandle };
  }

  /**
   * Complete a flow: consume the single-use flow state, exchange the code
   * with PKCE + expected state/nonce, and return validated claims. Every
   * failure throws OidcProtocolError — the caller renders one generic
   * failure regardless of reason.
   */
  async completeCallback(flowHandle: string | undefined, callbackUrl: URL): Promise<OidcClaims> {
    const flow = await this.flowStore.consume(flowHandle);
    if (!flow) {
      throw new OidcProtocolError('flow-missing', 'missing, expired, or already-consumed OIDC flow');
    }

    let claims: oidc.IDToken | undefined;
    try {
      const tokens = await oidc.authorizationCodeGrant(this.idp, callbackUrl, {
        pkceCodeVerifier: flow.verifier,
        expectedState: flow.state,
        expectedNonce: flow.nonce,
      });
      claims = tokens.claims();
    } catch (err) {
      throw new OidcProtocolError('exchange-failed', 'OIDC authorization code exchange failed', {
        cause: err,
      });
    }
    if (!claims?.sub) {
      throw new OidcProtocolError('no-subject', 'no subject in token claims');
    }

    const result: OidcClaims = { sub: claims.sub };
    if (typeof claims.preferred_username === 'string') result.preferredUsername = claims.preferred_username;
    if (typeof claims.email === 'string') result.email = claims.email;
    return result;
  }
}
