import { create } from 'zustand';
import notifee from '@notifee/react-native';
import {
  ActiveSession,
  FocusMode,
  getActiveSession,
  startActiveSession,
  pauseActiveSession,
  resumeActiveSession,
  resolveActiveSession,
  getDailyTotalMs,
} from '../db/focus';
import { getHabitById } from '../db/habits';
import { useHabitStore } from './habitStore';
import { updateSessionNotification, stopSessionNotification, scheduleTimerCompletion, cancelTimerCompletion } from '../services/notificationService';
import { getTodayDateStr } from '../utils/dates';

interface StalePromptState {
  visible: boolean;
  habitName: string;
  pausedMinsAgo: number;
}

interface FocusStoreState {
  activeSession: ActiveSession | null;
  stalePrompt: StalePromptState | null;

  loadActiveSession: () => void;
  startSession: (habitId: number, mode: FocusMode, targetGoalMs?: number | null, freshStart?: boolean) => boolean;
  pauseSession: () => void;
  resumeSession: () => void;
  stopSession: (reason?: 'completed') => void;
  cancelSessionWithoutLogging: () => void;
  checkStaleSession: () => void;
  dismissStalePrompt: () => void;
}

export const useFocusStore = create<FocusStoreState>((set, get) => ({
  activeSession: null,
  stalePrompt: null,

  loadActiveSession: async () => {
    const { dbReady } = await import('../db/database');
    await dbReady;
    try {
      const session = getActiveSession();
      set({ activeSession: session });
      get().checkStaleSession();
    } catch (e) {
      console.warn('loadActiveSession failed:', e);
      set({ activeSession: null });
    }
  },

  startSession: (habitId: number, mode: FocusMode, targetGoalMs?: number | null, freshStart?: boolean) => {
    const current = getActiveSession();
    if (current) {
      return false;
    }

    const newSession = startActiveSession({ habitId, mode, targetGoalMs });
    set({ activeSession: newSession });

    getHabitById(habitId).then((habit) => {
      if (habit) {
        updateSessionNotification(newSession, habit, freshStart).catch((e) => console.warn('[focusStore] update failed', e));
        if (habit.progressType === 'duration' && newSession.mode === 'timer') {
          scheduleTimerCompletion(habit, newSession).catch(() => {});
        }
      }
    });
    return true;
  },

  pauseSession: () => {
    const current = get().activeSession;
    if (!current || current.status === 'paused') return;

    const paused = pauseActiveSession();
    set({ activeSession: paused });

    if (paused) {
      cancelTimerCompletion(paused.habitId).catch(() => {});
      getHabitById(paused.habitId).then((habit) => {
        if (habit) updateSessionNotification(paused, habit).catch(e=>console.warn(e));
      });
    }
  },

  resumeSession: () => {
    const current = get().activeSession;
    if (!current || current.status === 'running') return;

    const resumed = resumeActiveSession();
    set({ activeSession: resumed, stalePrompt: null });

    if (resumed) {
      getHabitById(resumed.habitId).then((habit) => {
        if (habit) {
          updateSessionNotification(resumed, habit).catch(()=>{});
          if (habit.progressType === 'duration' && resumed.mode === 'timer') {
            scheduleTimerCompletion(habit, resumed).catch(() => {});
          }
        }
      });
    }
  },

  stopSession: (reason?: 'completed') => {
    const current = get().activeSession;
    if (!current) return;

    cancelTimerCompletion(current.habitId).catch(() => {});
    const result = resolveActiveSession();
    set({ activeSession: null, stalePrompt: null });
    useHabitStore.getState().loadHabits();

    if (result) {
      getHabitById(current.habitId).then((habit) => {
        if (habit) {
          const todayStr = getTodayDateStr();
          const dailyTotalMs = getDailyTotalMs(habit.id, todayStr);
          const sessionMs = result.durationMs ?? 0;
          stopSessionNotification(habit.id, habit.name, sessionMs, dailyTotalMs, reason);
        }
      });
    }
  },

  cancelSessionWithoutLogging: () => {
    const current = get().activeSession;
    if (current) {
      const notificationId = `focus_habit_${current.habitId}_${getTodayDateStr()}`;
      notifee.cancelNotification(notificationId).catch(() => {});
      notifee.stopForegroundService().catch(() => {});
      cancelTimerCompletion(current.habitId).catch(() => {});
    }

    const { db } = require('../db/habits');
    try {
      db.runSync(`DELETE FROM active_session WHERE id = 1`);
    } catch (_) {}

    set({ activeSession: null, stalePrompt: null });
    useHabitStore.getState().loadHabits();
  },

  checkStaleSession: () => {
    const current = getActiveSession();
    if (!current) {
      set({ activeSession: null, stalePrompt: null });
      return;
    }

    if (current.mode === 'timer' && current.targetGoalMs && current.targetGoalMs > 0) {
      let currentElapsedMs = current.accumulatedMs;
      if (current.status === 'running') {
        currentElapsedMs += Date.now() - current.startedAt;
      }
      if (currentElapsedMs >= current.targetGoalMs) {
        // Timer completed — automatically resolve and log session
        get().stopSession('completed');
        return;
      }
    }

    set({ activeSession: current });

    if (current.status === 'paused' && current.pausedAt) {
      const pausedMs = Date.now() - current.pausedAt;
      const pausedMinsAgo = Math.floor(pausedMs / 60000);

      if (pausedMinsAgo >= 30) {
        // async habit name - fetch then set stale prompt
        getHabitById(current.habitId).then((habit) => {
          const habitName = habit?.name ?? 'Habit';
          if (pausedMinsAgo <= 180) {
            set({
              stalePrompt: { visible: true, habitName, pausedMinsAgo },
            });
          } else {
            get().stopSession();
          }
        });
        return;
      }
    }
  },

  dismissStalePrompt: () => {
    set({ stalePrompt: null });
  },
}));