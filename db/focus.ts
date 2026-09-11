import { db, logCompletion } from './habits';

export type FocusMode = 'timer' | 'stopwatch';
export type FocusStatus = 'running' | 'paused';

export interface ActiveSession {
  id: 1;
  habitId: number;
  mode: FocusMode;
  status: FocusStatus;
  startedAt: number; // ms timestamp
  accumulatedMs: number; // accumulated ms
  pausedAt: number | null; // ms timestamp
  targetGoalMs: number | null; // goal ms for timer mode
}

let isFocusDbInitialized = false;

// ponytail: busy_timeout alone not enough when sync + async mix; retry on locked
function runSyncRetry(sql: string, params?: any[]) {
  let lastErr: any;
  for (let i = 0; i < 5; i++) {
    try {
      return (db as any).runSync(sql, params as any);
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message ?? e);
      if (msg.includes('database is locked') || msg.includes('locked')) {
        if (i < 4) {
          const start = Date.now();
          while (Date.now() - start < 80) {} // brief spin, allows async queue to drain
          continue;
        }
      }
      throw e;
    }
  }
  throw lastErr;
}

export function initFocusDb(): void {
  try {
    db.execSync(`
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
    `);
    isFocusDbInitialized = true;
  } catch (e) {
    console.warn('initFocusDb error:', e);
  }
}

export function ensureFocusDb(): void {
  if (!isFocusDbInitialized) {
    initFocusDb();
  }
  try { db.execSync('PRAGMA busy_timeout = 5000;'); } catch {}
}

export function getActiveSession(): ActiveSession | null {
  ensureFocusDb();
  try {
    const row = db.getFirstSync<any>(`SELECT * FROM active_session WHERE id = 1`);
    if (!row) return null;
    return {
      id: 1,
      habitId: row.habitId,
      mode: row.mode,
      status: row.status,
      startedAt: row.startedAt,
      accumulatedMs: row.accumulatedMs,
      pausedAt: row.pausedAt ?? null,
      targetGoalMs: row.targetGoalMs ?? null,
    };
  } catch {
    return null;
  }
}

export function startActiveSession(session: {
  habitId: number;
  mode: FocusMode;
  targetGoalMs?: number | null;
}): ActiveSession {
  ensureFocusDb();
  const now = Date.now();
  const targetGoalMs = session.targetGoalMs ?? null;

  runSyncRetry(
    `INSERT INTO active_session (id, habitId, mode, status, startedAt, accumulatedMs, pausedAt, targetGoalMs)
     VALUES (1, ?, ?, 'running', ?, 0, NULL, ?)
     ON CONFLICT(id) DO UPDATE SET
       habitId = excluded.habitId,
       mode = excluded.mode,
       status = 'running',
       startedAt = excluded.startedAt,
       accumulatedMs = 0,
       pausedAt = NULL,
       targetGoalMs = excluded.targetGoalMs`,
    [session.habitId, session.mode, now, targetGoalMs]
  );

  return getActiveSession()!;
}

export function pauseActiveSession(): ActiveSession | null {
  ensureFocusDb();
  const current = getActiveSession();
  if (!current || current.status === 'paused') return current;

  const now = Date.now();
  const additionalMs = now - current.startedAt;
  const newAccumulatedMs = current.accumulatedMs + additionalMs;

  runSyncRetry(
    `UPDATE active_session
     SET status = 'paused', accumulatedMs = ?, pausedAt = ?
     WHERE id = 1`,
    [newAccumulatedMs, now]
  );

  return getActiveSession();
}

export function resumeActiveSession(): ActiveSession | null {
  ensureFocusDb();
  const current = getActiveSession();
  if (!current || current.status === 'running') return current;

  const now = Date.now();
  runSyncRetry(
    `UPDATE active_session
     SET status = 'running', startedAt = ?, pausedAt = NULL
     WHERE id = 1`,
    [now]
  );

  return getActiveSession();
}

function getLocalDateString(dateObj: Date): string {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function incrementDailyTotal(habitId: number, dateStr: string, durationMs: number): number {
  ensureFocusDb();
  runSyncRetry(
    `INSERT INTO daily_totals (habitId, date, totalDurationMs)
     VALUES (?, ?, ?)
     ON CONFLICT(habitId, date) DO UPDATE SET
       totalDurationMs = totalDurationMs + excluded.totalDurationMs`,
    [habitId, dateStr, durationMs]
  );

  const row = db.getFirstSync<{ totalDurationMs: number }>(
    `SELECT totalDurationMs FROM daily_totals WHERE habitId = ? AND date = ?`,
    [habitId, dateStr]
  );

  return row?.totalDurationMs ?? 0;
}

export function getDailyTotalMs(habitId: number, dateStr: string): number {
  ensureFocusDb();
  try {
    const row = db.getFirstSync<{ totalDurationMs: number }>(
      `SELECT totalDurationMs FROM daily_totals WHERE habitId = ? AND date = ?`,
      [habitId, dateStr]
    );
    return row?.totalDurationMs ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Seeds daily_totals with the given ms value ONLY if no real focus-session data
 * exists yet (i.e. totalDurationMs is 0 or the row doesn't exist).
 * Used when a habit is directly marked complete without a focus session.
 */
export function seedDailyTotal(habitId: number, dateStr: string, goalMs: number): void {
  ensureFocusDb();
  try {
    runSyncRetry(
      `INSERT INTO daily_totals (habitId, date, totalDurationMs)
       VALUES (?, ?, ?)
       ON CONFLICT(habitId, date) DO UPDATE SET
         totalDurationMs = CASE WHEN totalDurationMs = 0 THEN excluded.totalDurationMs ELSE totalDurationMs END`,
      [habitId, dateStr, goalMs]
    );
  } catch (e) {
    console.warn('seedDailyTotal error:', e);
  }
}

export function resetTodayLoggedMinutes(habitId: number, dateStr: string): void {
  ensureFocusDb();
  try {
    runSyncRetry(
      `INSERT INTO daily_totals (habitId, date, totalDurationMs)
       VALUES (?, ?, 0)
       ON CONFLICT(habitId, date) DO UPDATE SET totalDurationMs = 0`,
      [habitId, dateStr]
    );

    runSyncRetry(
      `UPDATE habit_logs
       SET loggedMinutes = 0, completed = 0
       WHERE habitId = ? AND date = ?`,
      [habitId, dateStr]
    );
  } catch (e) {
    console.warn('resetTodayLoggedMinutes error:', e);
  }
}

export function resolveActiveSession(): { habitId: number; durationMs: number } | null {
  ensureFocusDb();
  const session = getActiveSession();
  if (!session) return null;

  const now = Date.now();
  let sessionDurationMs = session.accumulatedMs;
  if (session.status === 'running') {
    sessionDurationMs += now - session.startedAt;
  }

  // Clear active session first (releases single-session lock)
  try {
    runSyncRetry(`DELETE FROM active_session WHERE id = 1`);
  } catch (e) {
    console.warn('DELETE FROM active_session failed:', e);
  }

  if (sessionDurationMs <= 0) {
    return { habitId: session.habitId, durationMs: 0 };
  }

  // Midnight split check (using device local calendar date)
  const startDateObj = new Date(session.startedAt);
  const nowDateObj = new Date(now);

  const startDateStr = getLocalDateString(startDateObj);
  const nowDateStr = getLocalDateString(nowDateObj);

  if (startDateStr === nowDateStr) {
    // Single day
    incrementDailyTotal(session.habitId, startDateStr, sessionDurationMs);
    const totalMsForDay = getDailyTotalMs(session.habitId, startDateStr);
    const loggedMinutes = Math.max(1, Math.round(totalMsForDay / 60000));

    // Don't mark completed until goal reached — let autoCompletePending handle it
    let shouldComplete = false;
    try {
      const habitRow: any = db.getFirstSync(`SELECT progressType, goalMinutes FROM habits WHERE id = ?`, [session.habitId]);
      if (habitRow?.progressType === 'duration' && habitRow.goalMinutes) {
        shouldComplete = loggedMinutes >= habitRow.goalMinutes;
      }
    } catch {}

    // ponytail: use sync insert to avoid async lock (was logCompletion async)
    try {
      runSyncRetry(
        `INSERT INTO habit_logs (habitId, date, loggedMinutes, loggedQty, completed) VALUES (?, ?, ?, NULL, ?) ON CONFLICT(habitId, date) DO UPDATE SET loggedMinutes=excluded.loggedMinutes, completed=excluded.completed`,
        [session.habitId, startDateStr, loggedMinutes, shouldComplete ? 1 : 0]
      );
    } catch {}
  } else {
    // Spans midnight into multiple days
    const midnightOfNextDay = new Date(
      startDateObj.getFullYear(),
      startDateObj.getMonth(),
      startDateObj.getDate() + 1,
      0,
      0,
      0,
      0
    ).getTime();

    const durationDayA = Math.max(0, midnightOfNextDay - session.startedAt);
    const durationDayB = Math.max(0, now - midnightOfNextDay);

    if (durationDayA > 0) {
      incrementDailyTotal(session.habitId, startDateStr, durationDayA);
      const totalMsA = getDailyTotalMs(session.habitId, startDateStr);
      const loggedMinutesA = Math.max(1, Math.round(totalMsA / 60000));
      let shouldCompleteA = false;
      try {
        const habitRow: any = db.getFirstSync(`SELECT progressType, goalMinutes FROM habits WHERE id = ?`, [session.habitId]);
        if (habitRow?.progressType === 'duration' && habitRow.goalMinutes) {
          shouldCompleteA = loggedMinutesA >= habitRow.goalMinutes;
        }
      } catch {}
      try {
        runSyncRetry(
          `INSERT INTO habit_logs (habitId, date, loggedMinutes, loggedQty, completed) VALUES (?, ?, ?, NULL, ?) ON CONFLICT(habitId, date) DO UPDATE SET loggedMinutes=excluded.loggedMinutes, completed=excluded.completed`,
          [session.habitId, startDateStr, loggedMinutesA, shouldCompleteA ? 1 : 0]
        );
      } catch {}
    }

    if (durationDayB > 0) {
      incrementDailyTotal(session.habitId, nowDateStr, durationDayB);
      const totalMsB = getDailyTotalMs(session.habitId, nowDateStr);
      const loggedMinutesB = Math.max(1, Math.round(totalMsB / 60000));
      let shouldCompleteB = false;
      try {
        const habitRow: any = db.getFirstSync(`SELECT progressType, goalMinutes FROM habits WHERE id = ?`, [session.habitId]);
        if (habitRow?.progressType === 'duration' && habitRow.goalMinutes) {
          shouldCompleteB = loggedMinutesB >= habitRow.goalMinutes;
        }
      } catch {}
      try {
        runSyncRetry(
          `INSERT INTO habit_logs (habitId, date, loggedMinutes, loggedQty, completed) VALUES (?, ?, ?, NULL, ?) ON CONFLICT(habitId, date) DO UPDATE SET loggedMinutes=excluded.loggedMinutes, completed=excluded.completed`,
          [session.habitId, nowDateStr, loggedMinutesB, shouldCompleteB ? 1 : 0]
        );
      } catch {}
    }
  }

  return { habitId: session.habitId, durationMs: sessionDurationMs };
}
