import { afterAll, describe, it } from 'vitest';
import type Database from 'better-sqlite3';
import {
  runConformance,
  type PolicyAdapter,
  type SeedUser
} from '../src/lib/server/oidc-core/index.js';
import { UserRepository } from '../src/lib/server/db/users';
import { testDatabase } from './support/database';

const db: Database.Database = testDatabase();
const users = new UserRepository(db);

const adapter: PolicyAdapter = {
  capabilities: { supportsDeletion: false, sampleInvalidUsername: 'a!' },
  async resolve(claims) {
    return users.resolveOidcIdentity(claims);
  },
  async reset() {
    db.prepare('DELETE FROM users').run();
  },
  async seedUser(seed: SeedUser) {
    users.create({ username: seed.username, sub: seed.sub, email: seed.email });
  },
  async getUserByUsername(username) {
    const user = users.getByUsername(username);
    return user ? { username: user.username, sub: user.oidcSub } : null;
  },
  async getUserBySub(sub) {
    const user = users.getBySub(sub);
    return user ? { username: user.username, sub: user.oidcSub } : null;
  }
};

describe('canonical OIDC identity policy', () => {
  runConformance(adapter, {
    test: (name, fn) => it(name, fn),
    skip: (name, reason) => it.skip(`${name} (${reason})`, () => {})
  });
});

afterAll(() => db.close());
