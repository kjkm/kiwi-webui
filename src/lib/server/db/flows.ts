import type Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import type { FlowData, FlowStore } from '$lib/server/oidc-core/protocol/index.js';

export class SqliteFlowStore implements FlowStore {
  constructor(private readonly db: Database.Database) {}

  async create(flow: FlowData, ttlMs: number): Promise<string> {
    const id = randomBytes(24).toString('base64url');
    this.db
      .prepare(
        'INSERT INTO oidc_flows(id, state, nonce, verifier, expires_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(id, flow.state, flow.nonce, flow.verifier, Date.now() + ttlMs);
    return id;
  }

  async consume(handle: string | undefined): Promise<FlowData | null> {
    if (!handle) return null;
    return this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT state, nonce, verifier, expires_at FROM oidc_flows WHERE id = ?')
        .get(handle) as (FlowData & { expires_at: number }) | undefined;
      if (!row) return null;
      this.db.prepare('DELETE FROM oidc_flows WHERE id = ?').run(handle);
      if (row.expires_at <= Date.now()) return null;
      return { state: row.state, nonce: row.nonce, verifier: row.verifier };
    })();
  }

  purgeExpired(): number {
    return this.db.prepare('DELETE FROM oidc_flows WHERE expires_at <= ?').run(Date.now()).changes;
  }
}
