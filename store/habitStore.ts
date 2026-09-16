import { create } from 'zustand';
import {
  Habit,
  TodayHabitItem,
  getAllHabits,
  getArchivedHabits,
  getTodayHabitsWithLogs,
  createHabit,
  updateHabit as dbUpdateHabit,
  deleteHabit as dbDeleteHabit,
  archiveHabit as dbArchiveHabit,
  unarchiveHabit as dbUnarchiveHabit,
  logCompletion,
  getLogsForHabit,
  CreateHabitInput,
} from '../db/habits';

import { syncHabitReminder, cancelHabitReminders } from '../services/notificationService';
import { seedDailyTotal, resetTodayLoggedMinutes } from '../db/focus';

function getTodayDateStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface HabitStoreState {
  habits: Habit[];
  todayHabits: TodayHabitItem[];
  archivedHabits: Habit[];
  loadHabits: () => Promise<void>;
  loadArchived: () => Promise<void>;
  addHabit: (habitData: CreateHabitInput) => Promise<Habit>;
  updateHabit: (id: number, habitData: Partial<Omit<Habit, 'id' | 'createdAt'>>) => Promise<Habit>;
  deleteHabit: (id: number) => Promise<void>;
  archiveHabit: (id: number) => Promise<void>;
  unarchiveHabit: (id: number) => Promise<void>;
  clearAll: () => Promise<void>;
  toggleCompletion: (habitId: number, date?: string) => Promise<void>;
  resetCompletion: (habitId: number, date?: string) => Promise<void>;
  markAsUnComplete: (habitId: number, date?: string) => Promise<void>;
}

export const useHabitStore = create<HabitStoreState>((set, get) => ({
  habits: [],
  todayHabits: [],
  archivedHabits: [],

  loadHabits: async () => {
    const { dbReady } = await import('../db/database');
    await dbReady;
    const [habits, todayHabits] = await Promise.all([getAllHabits(), getTodayHabitsWithLogs()]);
    set({ habits, todayHabits });
  },

  loadArchived: async () => {
    const archivedHabits = await getArchivedHabits();
    set({ archivedHabits });
  },

  addHabit: async (habitData: CreateHabitInput) => {
    const newHabit = await createHabit(habitData);
    await get().loadHabits();
    syncHabitReminder(
      newHabit.id,
      newHabit.name,
      newHabit.time,
      newHabit.occurrence,
      newHabit.reminder
    );
    return newHabit;
  },

  updateHabit: async (id: number, habitData: Partial<Omit<Habit, 'id' | 'createdAt'>>) => {
    const existing = get().habits.find((h) => h.id === id);
    const oldType = existing?.progressType;
    const newType = (habitData.progressType as Habit['progressType'] | undefined) ?? oldType;

    if (existing && oldType && newType && oldType !== newType) {
      const { db } = await import('../db/habits');
      if (newType === 'check' && (oldType === 'duration' || oldType === 'quantity')) {
        await db.runAsync(
          `UPDATE habit_logs SET loggedMinutes = NULL, loggedQty = NULL WHERE habitId = ? AND completed = 1`,
          [id]
        );
      } else if (oldType === 'check' && newType === 'duration') {
        const goal = habitData.goalMinutes ?? existing.goalMinutes ?? null;
        if (goal != null) {
          await db.runAsync(
            `UPDATE habit_logs SET loggedMinutes = ?, loggedQty = NULL WHERE habitId = ? AND completed = 1`,
            [goal, id]
          );
        }
      } else if (oldType === 'check' && newType === 'quantity') {
        const goal = habitData.goalQty ?? existing.goalQty ?? null;
        if (goal != null) {
          await db.runAsync(
            `UPDATE habit_logs SET loggedQty = ?, loggedMinutes = NULL WHERE habitId = ? AND completed = 1`,
            [goal, id]
          );
        }
      } else if (oldType === 'duration' && newType === 'quantity') {
        const goal = habitData.goalQty ?? null;
        if (goal != null) {
          await db.runAsync(
            `UPDATE habit_logs SET loggedQty = ?, loggedMinutes = NULL WHERE habitId = ? AND completed = 1`,
            [goal, id]
          );
        } else {
          await db.runAsync(
            `UPDATE habit_logs SET loggedMinutes = NULL WHERE habitId = ? AND completed = 1`,
            [id]
          );
        }
      } else if (oldType === 'quantity' && newType === 'duration') {
        const goal = habitData.goalMinutes ?? null;
        if (goal != null) {
          await db.runAsync(
            `UPDATE habit_logs SET loggedMinutes = ?, loggedQty = NULL WHERE habitId = ? AND completed = 1`,
            [goal, id]
          );
        } else {
          await db.runAsync(
            `UPDATE habit_logs SET loggedQty = NULL WHERE habitId = ? AND completed = 1`,
            [id]
          );
        }
      }
    }

    const updated = await dbUpdateHabit(id, habitData);
    await get().loadHabits();
    syncHabitReminder(updated.id, updated.name, updated.time, updated.occurrence, updated.reminder);
    return updated;
  },

  deleteHabit: async (id: number) => {
    cancelHabitReminders(id);
    await dbDeleteHabit(id);
    await Promise.all([get().loadHabits(), get().loadArchived()]);
  },

  archiveHabit: async (id: number) => {
    // optimistic hide
    set((s) => ({
      habits: s.habits.filter((h) => h.id !== id),
      todayHabits: s.todayHabits.filter((h) => h.id !== id),
    }));
    await dbArchiveHabit(id);
    // if archived habit had active focus session, clear it
    try {
      const { useFocusStore } = await import('./focusStore');
      const s = useFocusStore.getState().activeSession;
      if (s?.habitId === id) useFocusStore.getState().cancelSessionWithoutLogging();
    } catch {}
    try {
      const notifee = (await import('@notifee/react-native')).default;
      const { getTodayDateStr } = await import('../utils/dates');
      notifee.cancelNotification(`focus_habit_${id}_${getTodayDateStr()}`).catch(() => {});
      (notifee as any).stopForegroundService?.().catch(() => {});
    } catch {}
    await Promise.all([get().loadHabits(), get().loadArchived()]);
  },

  unarchiveHabit: async (id: number) => {
    await dbUnarchiveHabit(id);
    await Promise.all([get().loadHabits(), get().loadArchived()]);
  },

  clearAll: async () => {
    const { clearAllData } = await import('../db/habits');
    await clearAllData();
    await get().loadHabits();
  },

  toggleCompletion: async (habitId: number, date?: string) => {
    const targetDate = date ?? getTodayDateStr();
    const isToday = targetDate === getTodayDateStr();

    // --- optimistic UI update (instant) ---
    if (isToday) {
      const current = get().todayHabits;
      const idx = current.findIndex((h) => h.id === habitId);
      if (idx !== -1) {
        const h = current[idx];
        const newDone = !h.done;
        let optimisticLoggedMinutes = h.loggedMinutes ?? 0;
        let optimisticLoggedQty = h.loggedQty ?? 0;
        if (newDone) {
          if ((h.loggedMinutes ?? 0) === 0 && h.goalMinutes)
            optimisticLoggedMinutes = h.goalMinutes;
          if ((h.loggedQty ?? 0) === 0 && h.goalQty) optimisticLoggedQty = h.goalQty;
        }
        const next = [...current];
        next[idx] = {
          ...h,
          done: newDone,
          loggedMinutes: optimisticLoggedMinutes,
          loggedQty: optimisticLoggedQty,
        };
        set({ todayHabits: next });
      }
    }

    // --- background DB update ---
    try {
      const logs = await getLogsForHabit(habitId);
      const existingLog = logs.find((l) => l.date === targetDate);
      const isCurrentlyCompleted = existingLog ? existingLog.completed : false;

      const habit = get().habits.find((h) => h.id === habitId);
      const newCompleted = !isCurrentlyCompleted;

      let loggedMinutes: number | null;
      let loggedQty: number | null;

      if (newCompleted) {
        const existingMins = existingLog?.loggedMinutes ?? 0;
        loggedMinutes = existingMins > 0 ? existingMins : (habit?.goalMinutes ?? null);
        const existingQty = existingLog?.loggedQty ?? 0;
        loggedQty = existingQty > 0 ? existingQty : (habit?.goalQty ?? null);
      } else {
        loggedMinutes = existingLog?.loggedMinutes ?? null;
        loggedQty = existingLog?.loggedQty ?? null;
      }

      await logCompletion({
        habitId,
        date: targetDate,
        loggedMinutes,
        loggedQty,
        completed: newCompleted,
      });

      if (newCompleted && habit?.goalMinutes) {
        const existingMins = existingLog?.loggedMinutes ?? 0;
        if (existingMins === 0) {
          seedDailyTotal(habitId, targetDate, habit.goalMinutes * 60000);
        }
      }

      // sync from DB in background (no UI block — already optimistic)
      const [habits, todayHabits] = await Promise.all([getAllHabits(), getTodayHabitsWithLogs()]);
      set({ habits, todayHabits });

      const freshHabit = habits.find((x) => x.id === habitId) ?? habit;
      if (freshHabit) {
        syncHabitReminder(
          freshHabit.id,
          freshHabit.name,
          freshHabit.time,
          freshHabit.occurrence,
          freshHabit.reminder
        );
      }
    } catch (e) {
      console.warn('toggleCompletion background sync failed:', e);
      // revert by reloading from DB
      try {
        const [habits, todayHabits] = await Promise.all([getAllHabits(), getTodayHabitsWithLogs()]);
        set({ habits, todayHabits });
      } catch {}
    }
  },

  resetCompletion: async (habitId: number, date?: string) => {
    const targetDate = date ?? getTodayDateStr();
    const isToday = targetDate === getTodayDateStr();

    // optimistic: set done false and reset logged values to 0
    if (isToday) {
      const current = get().todayHabits;
      const idx = current.findIndex((h) => h.id === habitId);
      if (idx !== -1) {
        const next = [...current];
        next[idx] = { ...next[idx], done: false, loggedMinutes: 0, loggedQty: 0 };
        set({ todayHabits: next });
      }
    }

    try {
      // reset daily totals and habit log
      try {
        resetTodayLoggedMinutes(habitId, targetDate);
      } catch {}
      await logCompletion({
        habitId,
        date: targetDate,
        loggedMinutes: 0,
        loggedQty: 0,
        completed: false,
      });
      const [habits, todayHabits] = await Promise.all([getAllHabits(), getTodayHabitsWithLogs()]);
      set({ habits, todayHabits });
      const habit = habits.find((x) => x.id === habitId);
      if (habit)
        syncHabitReminder(habit.id, habit.name, habit.time, habit.occurrence, habit.reminder);
    } catch (e) {
      console.warn('resetCompletion failed:', e);
      try {
        const [habits, todayHabits] = await Promise.all([getAllHabits(), getTodayHabitsWithLogs()]);
        set({ habits, todayHabits });
      } catch {}
    }
  },

  markAsUnComplete: async (habitId: number, date?: string) => {
    const targetDate = date ?? getTodayDateStr();
    const isToday = targetDate === getTodayDateStr();

    // optimistic: set done false
    if (isToday) {
      const current = get().todayHabits;
      const idx = current.findIndex((h) => h.id === habitId);
      if (idx !== -1) {
        const next = [...current];
        next[idx] = { ...next[idx], done: false };
        set({ todayHabits: next });
      }
    }
    try {
      // preserve existing logged values — only flip completed flag
      const logs = await getLogsForHabit(habitId);
      const existingLog = logs.find((l) => l.date === targetDate);
      await logCompletion({
        habitId,
        date: targetDate,
        loggedMinutes: existingLog?.loggedMinutes ?? null,
        loggedQty: existingLog?.loggedQty ?? null,
        completed: false,
      });
      const [habits, todayHabits] = await Promise.all([getAllHabits(), getTodayHabitsWithLogs()]);
      set({ habits, todayHabits });
      const habit = habits.find((x) => x.id === habitId);
      if (habit)
        syncHabitReminder(habit.id, habit.name, habit.time, habit.occurrence, habit.reminder);
    } catch (e) {
      console.warn('UnCompletion failed:', e);
      try {
        const [habits, todayHabits] = await Promise.all([getAllHabits(), getTodayHabitsWithLogs()]);
        set({ habits, todayHabits });
      } catch {}
    }
  },
}));
