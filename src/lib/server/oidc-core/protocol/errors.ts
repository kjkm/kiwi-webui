/** Why a callback failed — for operator logs, never for user-facing text. */
export type OidcProtocolFailureReason =
  /** No flow handle, or the handle was expired, tampered, or already consumed. */
  | 'flow-missing'
  /** The authorization-code exchange or its validations (state/nonce/PKCE/token) failed. */
  | 'exchange-failed'
  /** The exchange succeeded but the token claims carry no subject. */
  | 'no-subject';

/**
 * The single error type for every callback failure. Callers catch it once,
 * log `reason`/`cause` diagnostically, and render one generic failure that is
 * indistinguishable across reasons — nothing on this error is user-facing.
 */
export class OidcProtocolError extends Error {
  constructor(
    readonly reason: OidcProtocolFailureReason,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'OidcProtocolError';
  }
}
