import notifee from '@notifee/react-native';
import {
  pauseActiveSession,
  resumeActiveSession,
  resolveActiveSession,
  getActiveSession,
  getDailyTotalMs,
} from '@/db/focus';
import { getHabitById } from '@/db/habits';
import {
  updateSessionNotification,
  stopSessionNotification,
  cancelTimerCompletion,
  scheduleTimerCompletion,
} from '@/services/notificationService';
import { getTodayDateStr } from '@/utils/dates';

export async function pauseFromNotification(): Promise<void> {
  const paused = pauseActiveSession();
  if (paused) {
    await cancelTimerCompletion(paused.habitId).catch(() => {});
    const habit = await getHabitById(paused.habitId);
    if (habit) await updateSessionNotification(paused, habit);
  }
}

export async function resumeFromNotification(): Promise<void> {
  const resumed = resumeActiveSession();
  if (resumed) {
    const habit = await getHabitById(resumed.habitId);
    if (habit) {
      await updateSessionNotification(resumed, habit);
      if (habit.progressType === 'duration' && resumed.mode === 'timer') {
        await scheduleTimerCompletion(habit, resumed).catch(() => {});
      }
    }
  }
}

export async function stopFromNotification(): Promise<void> {
  const session = getActiveSession();
  if (!session) {
    await notifee.stopForegroundService();
    return;
  }

  await cancelTimerCompletion(session.habitId).catch(() => {});
  const result = resolveActiveSession();

  if (result) {
    const habit = await getHabitById(result.habitId);
    if (habit) {
      const todayStr = getTodayDateStr();
      const dailyTotalMs = getDailyTotalMs(result.habitId, todayStr);
      const sessionMs = result.durationMs ?? 0;
      await stopSessionNotification(habit.id, habit.name, sessionMs, dailyTotalMs);
    } else {
      await notifee.stopForegroundService();
    }
  } else {
    await notifee.stopForegroundService();
  }
}

export async function completeTimerFromTrigger(): Promise<void> {
  const session = getActiveSession();
  if (
    !session ||
    session.status !== 'running' ||
    session.mode !== 'timer' ||
    !session.targetGoalMs
  ) {
    return;
  }

  const elapsed = session.accumulatedMs + (Date.now() - session.startedAt);
  if (elapsed < session.targetGoalMs - 2000) {
    return;
  }

  const habit = await getHabitById(session.habitId);
  const result = resolveActiveSession();

  if (result && habit) {
    const todayStr = getTodayDateStr();
    const dailyTotalMs = getDailyTotalMs(result.habitId, todayStr);
    const sessionMs = result.durationMs ?? 0;
    await stopSessionNotification(
      habit.id,
      habit.name,
      sessionMs,
      dailyTotalMs,
      'completed'
    );
  } else {
    await notifee.stopForegroundService();
  }
}
