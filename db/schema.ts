import { SQLiteDatabase } from 'expo-sqlite';

export async function initDb(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      progressType TEXT NOT NULL,
      time TEXT,
      reminder INTEGER NOT NULL DEFAULT 0,
      goalMinutes INTEGER,
      goalQty INTEGER,
      unit TEXT,
      occurrence TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );



    CREATE TABLE IF NOT EXISTS habit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habitId INTEGER NOT NULL,
      date TEXT NOT NULL,
      loggedMinutes INTEGER,
      loggedQty INTEGER,
      completed INTEGER NOT NULL DEFAULT 0,
      UNIQUE(habitId, date),
      FOREIGN KEY (habitId) REFERENCES habits (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_habit_logs_habitId_date ON habit_logs (habitId, date);

    CREATE TABLE IF NOT EXISTS daily_totals (
      habitId INTEGER NOT NULL,
      date TEXT NOT NULL,
      totalDurationMs INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(habitId, date),
      FOREIGN KEY (habitId) REFERENCES habits (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS active_session (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      habitId INTEGER NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('timer','stopwatch')),
      status TEXT NOT NULL CHECK(status IN ('running','paused')),
      startedAt INTEGER NOT NULL,
      accumulatedMs INTEGER NOT NULL DEFAULT 0,
      pausedAt INTEGER,
      targetGoalMs INTEGER,
      FOREIGN KEY (habitId) REFERENCES habits (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  try {
    await db.execAsync(`ALTER TABLE habits ADD COLUMN reminder INTEGER NOT NULL DEFAULT 0;`);
    await db.execAsync(`UPDATE habits SET reminder = 1 WHERE time IS NOT NULL AND time != '';`);
  } catch {}
  try {
    await db.execAsync(`ALTER TABLE habits ADD COLUMN strictMode INTEGER NOT NULL DEFAULT 0;`);
  } catch {}
  try {
    await db.execAsync(`ALTER TABLE habits ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;`);
  } catch {}
}
