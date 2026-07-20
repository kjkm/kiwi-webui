import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getConfig } from '$lib/server/config';

let database: Database.Database | undefined;

export function migrate(db: Database.Database, directory = resolve('migrations')): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);
  const applied = db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?');
  const record = db.prepare('INSERT INTO schema_migrations(name, applied_at) VALUES (?, ?)');
  for (const name of readdirSync(directory)
    .filter((file) => file.endsWith('.sql'))
    .sort()) {
    if (applied.get(name)) continue;
    const sql = readFileSync(resolve(directory, name), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      record.run(name, Date.now());
    })();
  }
}

export function openDatabase(path = getConfig().databasePath): Database.Database {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

export function getDatabase(): Database.Database {
  database ??= openDatabase();
  return database;
}

export function closeDatabase(): void {
  database?.close();
  database = undefined;
}
