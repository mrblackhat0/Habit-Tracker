import {
  parseOccurrence,
  isScheduledDay,
  getTodayDateStr,
  getPrevDateStr,
  getNextScheduledDateStr,
} from '../utils/dates';
import { openDatabaseSync } from 'expo-sqlite';

export const db = openDatabaseSync('habits.db');
try { db.execSync('PRAGMA busy_timeout = 5000;'); } catch {}
try { db.execSync('PRAGMA journal_mode = WAL;'); } catch {}

try {
  db.execSync(`ALTER TABLE habits ADD COLUMN reminder INTEGER NOT NULL DEFAULT 0;`);
  db.execSync(`UPDATE habits SET reminder = 1 WHERE time IS NOT NULL AND time != '';`);
} catch {}
try {
  db.execSync(`ALTER TABLE habits ADD COLUMN strictMode INTEGER NOT NULL DEFAULT 0;`);
} catch {}

export type ProgressType = 'duration' | 'quantity' | 'check';

export interface Habit {
  id: number;
  name: string;
  icon: string;
  progressType: ProgressType;
  time: string | null; // 'HH:MM' 24h, null = no fixed time
  reminder: boolean;
  strictMode: boolean;
  goalMinutes: number | null;
  goalQty: number | null;
  unit: string | null;
  occurrence: string;
  createdAt: string;
}

export interface HabitLog {
  id: number;
  habitId: number;
  date: string; // 'YYYY-MM-DD'
  loggedMinutes: number | null;
  loggedQty: number | null;
  completed: boolean;
}

export type CreateHabitInput = {
  name: string;
  icon: string;
  progressType: ProgressType;
  time?: string | null;
  reminder?: boolean;
  strictMode?: boolean;
  goalMinutes?: number | null;
  goalQty?: number | null;
  unit?: string | null;
  occurrence: string;
  createdAt?: string;
};

export type LogCompletionInput = {
  habitId: number;
  date: string; // 'YYYY-MM-DD'
  loggedMinutes?: number | null;
  loggedQty?: number | null;
  completed: boolean;
};

export async function createHabit(input: CreateHabitInput): Promise<Habit> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const goalMinutes = input.goalMinutes ?? null;
  const goalQty = input.goalQty ?? null;
  const unit = input.unit ?? null;
  const time = input.time ?? null;
  const reminder = input.reminder ?? (time !== null && time.trim() !== '');
  const reminderInt = reminder ? 1 : 0;
  const strictMode = input.strictMode ?? false;
  const strictModeInt = strictMode ? 1 : 0;

  const result = await db.runAsync(
    `INSERT INTO habits (name, icon, progressType, time, reminder, strictMode, goalMinutes, goalQty, unit, occurrence, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name,
      input.icon,
      input.progressType,
      time,
      reminderInt,
      strictModeInt,
      goalMinutes,
      goalQty,
      unit,
      input.occurrence,
      createdAt,
    ]
  );

  return {
    id: result.lastInsertRowId,
    name: input.name,
    icon: input.icon,
    progressType: input.progressType,
    goalMinutes,
    goalQty,
    time,
    reminder,
    strictMode,
    unit,
    occurrence: input.occurrence,
    createdAt,
  };
}

function hours24(date: string) {
  const d = new Date(date);
  const [hrs, min] = [d.getHours(), d.getMinutes()];
  return hrs + min / 60;
}

export interface TodayHabitItem extends Habit {
  done: boolean;
  loggedMinutes: number;
  loggedQty: number;
  streak: number;
}

export function getStreaksFromSet(occurrence: string, completedDates: Set<string>, todayStr: string): StreakInfo {
  const scheduledDays = parseOccurrence(occurrence);
  if (completedDates.size === 0) {
    return { currentStreak: 0, bestStreak: 0 };
  }

  let currentStreak = 0;
  let checkDate = todayStr;

  if (isScheduledDay(checkDate, scheduledDays) && !completedDates.has(checkDate)) {
    checkDate = getPrevDateStr(checkDate);
  }
  while (true) {
    if (!isScheduledDay(checkDate, scheduledDays)) {
      checkDate = getPrevDateStr(checkDate);
      continue;
    }
    if (completedDates.has(checkDate)) {
      currentStreak++;
      checkDate = getPrevDateStr(checkDate);
    } else {
      break;
    }
  }

  const sortedDates = Array.from(completedDates).sort();
  let bestStreak = 0;
  let runningStreak = 0;
  let lastCompletedDate: string | null = null;

  for (const dateStr of sortedDates) {
    if (lastCompletedDate === null) {
      runningStreak = 1;
    } else {
      const expectedNext = getNextScheduledDateStr(lastCompletedDate, scheduledDays);
      if (dateStr === expectedNext) {
        runningStreak++;
      } else {
        runningStreak = 1;
      }
    }
    lastCompletedDate = dateStr;
    if (runningStreak > bestStreak) {
      bestStreak = runningStreak;
    }
  }

  bestStreak = Math.max(bestStreak, currentStreak);
  return { currentStreak, bestStreak };
}

export async function getTodayHabitsWithLogs(todayStr: string = getTodayDateStr()): Promise<TodayHabitItem[]> {
  // 1. Single JOIN query for habits and today's log status (Async)
  const rows = await db.getAllAsync<any>(
    `SELECT h.*, l.loggedMinutes, l.loggedQty, l.completed
     FROM habits h
     LEFT JOIN habit_logs l ON h.id = l.habitId AND l.date = ?`,
    [todayStr]
  );

  // 2. Single batch query for all completion dates (Async)
  const completionRows = await db.getAllAsync<{ habitId: number; date: string }>(
    `SELECT habitId, date FROM habit_logs WHERE completed = 1`
  );

  const completedMap = new Map<number, Set<string>>();
  for (const r of completionRows) {
    let set = completedMap.get(r.habitId);
    if (!set) {
      set = new Set();
      completedMap.set(r.habitId, set);
    }
    set.add(r.date);
  }

  const sortedRows = rows.sort((a, b) => {
    const rem = (b.reminder ? 1 : 0) - (a.reminder ? 1 : 0);
    if (rem !== 0) return rem;
    return hours24(a.time) - hours24(b.time);
  });

  return sortedRows.map((row) => {
    const habitId = row.id;
    const completedSet = completedMap.get(habitId) || new Set();
    const streak = getStreaksFromSet(row.occurrence, completedSet, todayStr).currentStreak;

    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      progressType: row.progressType,
      time: row.time,
      reminder: row.reminder === 1 || Boolean(row.reminder),
      strictMode: row.strictMode === 1 || Boolean(row.strictMode),
      goalMinutes: row.goalMinutes,
      goalQty: row.goalQty,
      unit: row.unit,
      occurrence: row.occurrence,
      createdAt: row.createdAt,
      done: row.completed === 1,
      loggedMinutes: row.loggedMinutes ?? 0,
      loggedQty: row.loggedQty ?? 0,
      streak,
    };
  });
}

export async function getAllHabits(): Promise<Habit[]> {
  const rows = await db.getAllAsync<any>(`SELECT * FROM habits`);
  const sortedRows = rows.sort((a, b) => {
    const rem = (b.reminder ? 1 : 0) - (a.reminder ? 1 : 0);
    if (rem !== 0) return rem;
    return hours24(a.time) - hours24(b.time);
  });
  return sortedRows.map((row) => ({
    ...row,
    reminder: row.reminder === 1 || Boolean(row.reminder),
    strictMode: row.strictMode === 1 || Boolean(row.strictMode),
  }));
}

export async function logCompletion(input: LogCompletionInput): Promise<HabitLog> {
  const loggedMinutes = input.loggedMinutes ?? null;
  const loggedQty = input.loggedQty ?? null;
  const completedInt = input.completed ? 1 : 0;

  await db.runAsync(
    `INSERT INTO habit_logs (habitId, date, loggedMinutes, loggedQty, completed)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(habitId, date) DO UPDATE SET
       loggedMinutes = excluded.loggedMinutes,
       loggedQty = excluded.loggedQty,
       completed = excluded.completed`,
    [input.habitId, input.date, loggedMinutes, loggedQty, completedInt]
  );

  const row = await db.getFirstAsync<{
    id: number;
    habitId: number;
    date: string;
    loggedMinutes: number | null;
    loggedQty: number | null;
    completed: number;
  }>(`SELECT * FROM habit_logs WHERE habitId = ? AND date = ?`, [input.habitId, input.date]);

  if (!row) {
    throw new Error(
      `Failed to retrieve logged completion for habitId ${input.habitId} on ${input.date}`
    );
  }

  return {
    id: row.id,
    habitId: row.habitId,
    date: row.date,
    loggedMinutes: row.loggedMinutes,
    loggedQty: row.loggedQty,
    completed: row.completed === 1,
  };
}

export async function clearAllData(): Promise<void> {
  await db.runAsync(`DELETE FROM habit_logs`);
  await db.runAsync(`DELETE FROM habits`);
  await db.runAsync(`DELETE FROM active_session`);
}

export async function getLogsForHabit(habitId: number): Promise<HabitLog[]> {
  const rows = await db.getAllAsync<{
    id: number;
    habitId: number;
    date: string;
    loggedMinutes: number | null;
    loggedQty: number | null;
    completed: number;
  }>(`SELECT * FROM habit_logs WHERE habitId = ? ORDER BY date DESC`, [habitId]);

  return rows.map((row) => ({
    ...row,
    completed: row.completed === 1,
  }));
}

export interface StreakInfo {
  currentStreak: number;
  bestStreak: number;
}

export async function getStreaks(habitId: number, occurrence: string, todayDate?: string): Promise<StreakInfo> {
  const todayStr = todayDate ?? getTodayDateStr();
  const scheduledDays = parseOccurrence(occurrence);

  const rows = await db.getAllAsync<{ date: string }>(
    `SELECT date FROM habit_logs WHERE habitId = ? AND completed = 1 ORDER BY date ASC`,
    [habitId]
  );
  const completedDates = new Set(rows.map((r) => r.date));
  if (completedDates.size === 0) {
    return { currentStreak: 0, bestStreak: 0 };
  }

  let currentStreak = 0;
  let checkDate = todayStr;

  if (isScheduledDay(checkDate, scheduledDays) && !completedDates.has(checkDate)) {
    checkDate = getPrevDateStr(checkDate);
  }
  while (true) {
    if (!isScheduledDay(checkDate, scheduledDays)) {
      checkDate = getPrevDateStr(checkDate);
      continue;
    }
    if (completedDates.has(checkDate)) {
      currentStreak++;
      checkDate = getPrevDateStr(checkDate);
    } else {
      break;
    }
  }

  const sortedDates = Array.from(completedDates).sort();
  let bestStreak = 0;
  let runningStreak = 0;
  let lastCompletedDate: string | null = null;

  for (const dateStr of sortedDates) {
    if (lastCompletedDate === null) {
      runningStreak = 1;
    } else {
      const expectedNext = getNextScheduledDateStr(lastCompletedDate, scheduledDays);
      if (dateStr === expectedNext) {
        runningStreak++;
      } else {
        runningStreak = 1;
      }
    }
    lastCompletedDate = dateStr;
    if (runningStreak > bestStreak) {
      bestStreak = runningStreak;
    }
  }

  bestStreak = Math.max(bestStreak, currentStreak);

  return { currentStreak, bestStreak };
}

export async function getStreak(habitId: number, occurrence: string, todayDate?: string): Promise<number> {
  const res = await getStreaks(habitId, occurrence, todayDate);
  return res.currentStreak;
}

export async function deleteHabit(id: number): Promise<void> {
  await db.runAsync(`DELETE FROM habits WHERE id = ?`, [id]);
}

export async function updateHabit(id: number, input: Partial<Omit<Habit, 'id' | 'createdAt'>>): Promise<Habit> {
  const existingRow = await db.getFirstAsync<any>(`SELECT * FROM habits WHERE id = ?`, [id]);
  if (!existingRow) {
    throw new Error(`Habit with id ${id} not found`);
  }

  const existing: Habit = {
    ...existingRow,
    reminder: existingRow.reminder === 1 || Boolean(existingRow.reminder),
    strictMode: existingRow.strictMode === 1 || Boolean(existingRow.strictMode),
  };

  const name = input.name ?? existing.name;
  const icon = input.icon ?? existing.icon;
  const progressType = input.progressType ?? existing.progressType;
  const goalMinutes = input.goalMinutes !== undefined ? input.goalMinutes : existing.goalMinutes;
  const goalQty = input.goalQty !== undefined ? input.goalQty : existing.goalQty;
  const unit = input.unit !== undefined ? input.unit : existing.unit;
  const occurrence = input.occurrence ?? existing.occurrence;
  const time = input.time !== undefined ? input.time : existing.time;
  const reminder = input.reminder !== undefined ? input.reminder : existing.reminder;
  const reminderInt = reminder ? 1 : 0;
  const strictMode = input.strictMode !== undefined ? input.strictMode : existing.strictMode;
  const strictModeInt = strictMode ? 1 : 0;

  await db.runAsync(
    `UPDATE habits SET name = ?, icon = ?, progressType = ?, time = ?, reminder = ?, strictMode = ?, goalMinutes = ?, goalQty = ?, unit = ?, occurrence = ? WHERE id = ?`,
    [name, icon, progressType, time, reminderInt, strictModeInt, goalMinutes, goalQty, unit, occurrence, id]
  );

  return {
    ...existing,
    name,
    icon,
    progressType,
    goalMinutes,
    goalQty,
    unit,
    occurrence,
    time,
    reminder,
    strictMode,
  };
}

export async function getHabitById(id: number): Promise<Habit | null> {
  const row = await db.getFirstAsync<any>(`SELECT * FROM habits WHERE id = ?`, [id]);
  if (!row) return null;
  return {
    ...row,
    reminder: row.reminder === 1 || Boolean(row.reminder),
    strictMode: row.strictMode === 1 || Boolean(row.strictMode),
  };
}

export async function getLogsByHabitIdAndMonth(
  habitId: number,
  year: number,
  month: number // 1-12
): Promise<HabitLog[] | null> {
  const mm = String(month).padStart(2, '0');
  const startDate = `${year}-${mm}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;

  return await db.getAllAsync<HabitLog>(
    `SELECT * FROM habit_logs
     WHERE habitId = ? AND date >= ? AND date <= ?
     ORDER BY date DESC`,
    [habitId, startDate, endDate]
  );
}

export async function getCompletedDatesForMonth(
  habitId: number,
  year: number,
  month: number // 1-indexed
): Promise<Set<string>> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const rows = await db.getAllAsync<{ date: string }>(
    `SELECT date FROM habit_logs WHERE habitId = ? AND completed = 1 AND date >= ? AND date <= ?`,
    [habitId, startDate, endDate]
  );

  return new Set(rows.map((r) => r.date));
}

export async function getAllHabitsMonthlyCompletion(year: number, monthIndex: number): Promise<Map<number, Set<string>>> {
  const month = String(monthIndex + 1).padStart(2, '0');
  const startDate = `${year}-${month}-01`;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

  const rows = await db.getAllAsync<{ habitId: number; date: string }>(
    `SELECT habitId, date FROM habit_logs WHERE completed = 1 AND date >= ? AND date <= ?`,
    [startDate, endDate]
  );

  const map = new Map<number, Set<string>>();
  for (const r of rows) {
    let set = map.get(r.habitId);
    if (!set) {
      set = new Set();
      map.set(r.habitId, set);
    }
    set.add(r.date);
  }
  return map;
}

export interface DateHabitItem extends Habit {
  done: boolean;
  loggedMinutes: number;
  loggedQty: number;
}

export async function getHabitsForDate(dateStr: string): Promise<DateHabitItem[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT h.*, l.loggedMinutes, l.loggedQty, l.completed
     FROM habits h
     LEFT JOIN habit_logs l ON h.id = l.habitId AND l.date = ?`,
    [dateStr]
  );

  const sortedRows = rows.sort((a: any, b: any) => {
    const rem = (b.reminder ? 1 : 0) - (a.reminder ? 1 : 0);
    if (rem !== 0) return rem;
    return hours24(a.time) - hours24(b.time);
  });

  return sortedRows.map((row: any) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    progressType: row.progressType,
    time: row.time,
    reminder: row.reminder === 1 || Boolean(row.reminder),
    strictMode: row.strictMode === 1 || Boolean(row.strictMode),
    goalMinutes: row.goalMinutes,
    goalQty: row.goalQty,
    unit: row.unit,
    occurrence: row.occurrence,
    createdAt: row.createdAt,
    done: row.completed === 1,
    loggedMinutes: row.loggedMinutes ?? 0,
    loggedQty: row.loggedQty ?? 0,
  }));
}

export async function getMonthDayStatuses(
  year: number,
  monthIndex: number,
  habits: Habit[]
): Promise<Map<string, 'all' | 'partial' | 'none'>> {
  const month = String(monthIndex + 1).padStart(2, '0');
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const todayStr = getTodayDateStr();

  const rows = await db.getAllAsync<{ habitId: number; date: string }>(
    `SELECT habitId, date FROM habit_logs WHERE completed = 1 AND date >= ? AND date <= ?`,
    [`${year}-${month}-01`, `${year}-${month}-${String(daysInMonth).padStart(2, '0')}`]
  );

  const completionsByDate = new Map<string, Set<number>>();
  for (const r of rows) {
    let set = completionsByDate.get(r.date);
    if (!set) {
      set = new Set();
      completionsByDate.set(r.date, set);
    }
    set.add(r.habitId);
  }

  const result = new Map<string, 'all' | 'partial' | 'none'>();
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${month}-${String(d).padStart(2, '0')}`;
    if (ds > todayStr) continue;

    let scheduledCount = 0;
    let completedCount = 0;
    const completedSet = completionsByDate.get(ds);
    for (const h of habits) {
      if (h.createdAt.slice(0, 10) > ds) continue;
      const schedDays = parseOccurrence(h.occurrence);
      if (!isScheduledDay(ds, schedDays)) continue;
      scheduledCount++;
      if (completedSet?.has(h.id)) completedCount++;
    }
    if (scheduledCount === 0) continue;

    if (completedCount >= scheduledCount) result.set(ds, 'all');
    else if (completedCount > 0) result.set(ds, 'partial');
    else result.set(ds, 'none');
  }

  return result;
}
