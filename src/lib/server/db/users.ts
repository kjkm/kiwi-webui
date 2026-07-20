import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { OidcClaims, ResolveOutcome } from '$lib/server/oidc-core/index.js';
import type { User } from './types';

interface UserRow {
  id: string;
  oidc_sub: string | null;
  username: string;
  display_name: string | null;
  email: string | null;
  created_at: number;
}

const USERNAME_RE = /^[A-Za-z0-9_.-]{1,50}$/;

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    oidcSub: row.oidc_sub,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    createdAt: row.created_at
  };
}

export class UserRepository {
  constructor(private readonly db: Database.Database) {}

  getById(id: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row ? mapUser(row) : null;
  }

  getBySub(sub: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE oidc_sub = ?').get(sub) as
      UserRow | undefined;
    return row ? mapUser(row) : null;
  }

  getByUsername(username: string): User | null {
    const row = this.db
      .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
      .get(username) as UserRow | undefined;
    return row ? mapUser(row) : null;
  }

  create(input: { username: string; sub?: string; email?: string; displayName?: string }): User {
    const user: User = {
      id: randomUUID(),
      oidcSub: input.sub ?? null,
      username: input.username,
      displayName: input.displayName ?? input.username,
      email: input.email ?? null,
      createdAt: Date.now()
    };
    this.db
      .prepare(
        `INSERT INTO users(id, oidc_sub, username, display_name, email, created_at)
         VALUES (@id, @oidcSub, @username, @displayName, @email, @createdAt)`
      )
      .run(user);
    return user;
  }

  resolveOidcIdentity(claims: OidcClaims): ResolveOutcome {
    return this.db.transaction((): ResolveOutcome => {
      const pinned = this.getBySub(claims.sub);
      if (pinned) return { kind: 'pinned', username: pinned.username, sub: claims.sub };

      const username = claims.preferredUsername;
      if (!username || !USERNAME_RE.test(username)) return { kind: 'refused' };

      const matching = this.getByUsername(username);
      if (matching) {
        if (matching.oidcSub !== null) return { kind: 'refused' };
        const result = this.db
          .prepare('UPDATE users SET oidc_sub = ? WHERE id = ? AND oidc_sub IS NULL')
          .run(claims.sub, matching.id);
        if (result.changes !== 1) return { kind: 'refused' };
        return { kind: 'linked', username: matching.username, sub: claims.sub };
      }

      try {
        const created = this.create({ username, sub: claims.sub, email: claims.email });
        return { kind: 'provisioned', username: created.username, sub: claims.sub };
      } catch {
        return { kind: 'refused' };
      }
    })();
  }
}

export { USERNAME_RE };
