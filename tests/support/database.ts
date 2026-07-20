import Database from 'better-sqlite3';
import { migrate } from '../../src/lib/server/db/database';

export function testDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}
