/**
 * Flow-state storage port: where a pending OIDC flow's PKCE verifier, state,
 * and nonce live between the authorization redirect and the callback. This is
 * the one genuinely divergent piece across the reference apps, so it is a
 * port:
 *
 * - Stateful (reputation/quetzal): an `oidc_flows` table row keyed by a
 *   random id; `consume` deletes the row, giving strict single-use.
 * - Stateless (rayfin): the handle itself carries the flow data (signed
 *   cookie payload); TTL and the signature substitute for server-side state.
 *
 * Caveat on the stateless shape: a stateless handle cannot be server-side
 * invalidated, so replay within the TTL is possible if the app fails to
 * clear its cookie. That matches rayfin's shipped posture — the state/nonce/
 * PKCE checks bind any replay to the same completed flow, and the
 * authorization code is single-use at the IdP — but apps wanting strict
 * single-use must choose a stateful store.
 */

/** A pending flow's secrets, persisted between redirect and callback. */
export interface FlowData {
  state: string;
  nonce: string;
  verifier: string;
}

export interface FlowStore {
  /**
   * Persist a new flow, returning the opaque string handle the app
   * round-trips to the browser (typically in an HttpOnly cookie).
   */
  create(flow: FlowData, ttlMs: number): Promise<string>;

  /**
   * Retrieve AND invalidate a flow. Returns null — never throws — for a
   * missing, expired, tampered, or previously consumed handle, so the client
   * maps every bad handle to one failure reason.
   */
  consume(handle: string | undefined): Promise<FlowData | null>;
}

/**
 * Dependency-free in-memory reference implementation: correct TTL and
 * consume-once behavior. Suitable for tests and single-process apps;
 * DB- or cookie-backed stores are written by consumers against their own
 * infrastructure (~20 lines).
 */
export class MemoryFlowStore implements FlowStore {
  private readonly flows = new Map<string, { flow: FlowData; expiresAt: number }>();
  private counter = 0;

  async create(flow: FlowData, ttlMs: number): Promise<string> {
    const handle = `flow-${++this.counter}-${Math.random().toString(36).slice(2)}`;
    this.flows.set(handle, { flow, expiresAt: Date.now() + ttlMs });
    return handle;
  }

  async consume(handle: string | undefined): Promise<FlowData | null> {
    if (!handle) return null;
    const entry = this.flows.get(handle);
    if (!entry) return null;
    this.flows.delete(handle);
    if (entry.expiresAt <= Date.now()) return null;
    return entry.flow;
  }
}
