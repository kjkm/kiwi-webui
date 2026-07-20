import type Database from 'better-sqlite3';
import { createHash, randomBytes } from 'node:crypto';
import type { User } from './types';
import { UserRepository } from './users';

export const SESSION_COOKIE = 'kiwi_session';

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class SessionRepository {
  private readonly users: UserRepository;

  constructor(private readonly db: Database.Database) {
    this.users = new UserRepository(db);
  }

  create(userId: string, ttlSeconds: number): { token: string; expiresAt: number } {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.db
      .prepare(
        'INSERT INTO sessions(token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
      )
      .run(hashSessionToken(token), userId, expiresAt, Date.now());
    return { token, expiresAt };
  }

  resolve(token: string | undefined): User | null {
    if (!token) return null;
    const row = this.db
      .prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
      .get(hashSessionToken(token)) as { user_id: string; expires_at: number } | undefined;
    if (!row) return null;
    if (row.expires_at <= Date.now()) {
      this.revoke(token);
      return null;
    }
    return this.users.getById(row.user_id);
  }

  revoke(token: string | undefined): void {
    if (token)
      this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashSessionToken(token));
  }

  revokeForUser(userId: string): void {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  purgeExpired(): number {
    return this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now()).changes;
  }
}
