import { openDatabaseSync } from 'expo-sqlite';
import { initDb } from './schema';

export const db = openDatabaseSync('habits.db');

// Resolves once; every query path awaits it. No query reaches the
// native layer before PRAGMAs + schema + ALTERs complete on this connection.
export const dbReady: Promise<void> = (async () => {
  db.execSync('PRAGMA busy_timeout = 5000;');
  db.execSync('PRAGMA journal_mode = WAL;');
  await initDb(db);
})();
