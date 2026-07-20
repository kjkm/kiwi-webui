/**
 * The policy repository port: the contract an app implements to run the
 * OIDC identity-resolution conformance suite against its own code.
 *
 * The conformance boundary is `resolve` — it MUST invoke the app's actual
 * production resolution path (the same code the OIDC callback route runs).
 * Re-implementing the resolution logic inside an adapter is forbidden: that
 * would test a copy and let production drift undetected. Where an app's
 * resolution logic is inline in a route handler, extract it (behavior-
 * preserving) into an exported function that both the route and the adapter
 * call.
 *
 * Everything else on this interface (reset/seedUser/getters) is test-only
 * plumbing owned by the app's adapter and MUST NOT be reachable from
 * production code paths.
 */

/** Claims presented after a successful, validated OIDC callback. */
export interface OidcClaims {
  sub: string;
  preferredUsername?: string;
  email?: string;
}

/**
 * The result of resolving claims to a local account.
 *
 * `refused` deliberately carries no reason code: the policy is fail-closed
 * with generic failure, and distinguishing refusal reasons at this boundary
 * would invite apps to leak them. The suite distinguishes refusal cases by
 * setup, not by inspecting the refusal.
 */
export type ResolveOutcome =
  | {
      /** How the account was resolved. */
      kind: "pinned" | "linked" | "provisioned";
      /** The resolved account's stored username (verbatim, as persisted). */
      username: string;
      /** The OIDC subject now pinned to the account. */
      sub: string;
    }
  | { kind: "refused" };

/** A local account to create directly in the store, bypassing resolution. */
export interface SeedUser {
  username: string;
  /** Pre-pin this OIDC subject to the account. */
  sub?: string;
  /**
   * Create the account in the app's deleted state (whatever the app's
   * production deletion produces, e.g. a soft-delete flag). Only required
   * when `capabilities.supportsDeletion` is true.
   */
  deleted?: boolean;
  /** Stored email, for apps that have an email column; others ignore it. */
  email?: string;
}

/** Inspection view of a stored account. `sub` is null when unlinked. */
export interface UserRecord {
  username: string;
  sub: string | null;
}

export interface AdapterCapabilities {
  /**
   * True if the app supports account deletion (and its resolution policy
   * therefore includes deleted-account lockout). Apps without deletion
   * declare false; the deletion cases are then skipped loudly.
   */
  supportsDeletion: boolean;
  /**
   * A username the app's own registration rules reject (e.g. "a!" against
   * quetzal's USERNAME_RE), used to verify the app refuses — and never
   * sanitizes — an invalid claimed username. Declare null if the app applies
   * no format validation on the SSO provisioning path; the format-refusal
   * case is then skipped loudly. (Refusal of a MISSING username is
   * unconditional policy and is never skipped.)
   */
  sampleInvalidUsername: string | null;
}

export interface PolicyAdapter {
  /**
   * Resolve validated OIDC claims to a local account by invoking the app's
   * production resolution logic.
   */
  resolve(claims: OidcClaims): Promise<ResolveOutcome>;

  /** Return the user store to empty. Called before every case. */
  reset(): Promise<void>;

  /** Create a local account directly (test-only). */
  seedUser(user: SeedUser): Promise<void>;

  /**
   * Look up a stored account by username, using the same case-sensitivity
   * the app's username uniqueness uses. Returns the username exactly as
   * stored.
   */
  getUserByUsername(username: string): Promise<UserRecord | null>;

  /** Look up a stored account by pinned OIDC subject. */
  getUserBySub(sub: string): Promise<UserRecord | null>;

  capabilities: AdapterCapabilities;
}
