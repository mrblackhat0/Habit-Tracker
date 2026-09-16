import notifee, { EventType } from '@notifee/react-native';
import {
  pauseActiveSession,
  resumeActiveSession,
  resolveActiveSession,
  getDailyTotalMs,
  getActiveSession,
} from '@/db/focus';
import { getHabitById } from '@/db/habits';
import {
  updateSessionNotification,
  stopSessionNotification,
  handleMarkCompletedAction,
  handleStartTimerAction,
} from '../services/notificationService';
import { router } from 'expo-router';

function getTodayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

notifee.registerForegroundService(() => new Promise(() => {}));

notifee.onBackgroundEvent(async ({ type, detail }) => {
  // Gate on DB readiness — headless context may re-evaluate modules.
  try {
    const { dbReady } = require('@/db/database');
    await dbReady;
  } catch {}
  // Background timer completion — fires even if app is closed
  // Trigger already displayed the final notification (same id as stop), just ensure DB is completed
  if (
    type === EventType.TRIGGER_NOTIFICATION_CREATED &&
    detail.notification?.data?.type === 'timer_complete'
  ) {
    try {
      const session = getActiveSession();
      if (!session || session.mode !== 'timer' || !session.targetGoalMs) return;
      let elapsed = session.accumulatedMs;
      if (session.status === 'running') elapsed += Date.now() - session.startedAt;
      if (elapsed + 500 < session.targetGoalMs) return; // not yet (clock drift guard)
      // DB only — trigger's notification is already the final one (same id as stop), don't show duplicate
      resolveActiveSession();
      // Ensure trigger is cleaned up (already delivered)
      try {
        await notifee.cancelTriggerNotification(detail.notification.id);
      } catch {}
    } catch (e) {
      console.warn('[timer_complete background]', e);
    }
    return;
  }
  if (type === EventType.PRESS && detail.pressAction?.id === 'default') {
    const habitId = detail.notification?.data?.habitId;
    if (habitId) {
      try {
        const habit = await getHabitById(Number(habitId));
        if (habit && habit.progressType !== 'check') {
          // router.navigate({ pathname: '/habit/[id]', params: { id: habitId.toString() } });
          setTimeout(
            () =>
              router.navigate({ pathname: '/habit/[id]/goal', params: { id: habitId.toString() } }),
            80
          );
        } else {
          router.navigate({ pathname: '/habit/[id]', params: { id: habitId.toString() } });
        }
      } catch {
        router.navigate({ pathname: '/habit/[id]', params: { id: habitId.toString() } });
      }
    }
  }
  if (type !== EventType.ACTION_PRESS || !detail.pressAction?.id) return;

  const actionId = detail.pressAction.id;

  try {
    if (actionId === 'pause') {
      const paused = pauseActiveSession();
      if (paused) {
        const habit = await getHabitById(paused.habitId);
        if (habit) await updateSessionNotification(paused, habit);
      }
    } else if (actionId === 'resume') {
      const resumed = resumeActiveSession();
      if (resumed) {
        const habit = await getHabitById(resumed.habitId);
        if (habit) await updateSessionNotification(resumed, habit);
      }
    } else if (actionId === 'stop') {
      const result = resolveActiveSession(); // { habitId, durationMs } | null
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
    } else if (actionId === 'mark_completed') {
      const habitId = detail.notification?.data?.habitId;
      if (habitId) {
        await handleMarkCompletedAction(parseInt(habitId, 10), detail.notification?.id);
      }
    } else if (actionId === 'reschedule') {
      // Cancel so there's no stale notification, then navigate to details
      // screen with reschedule param — same as foreground handler in _layout.tsx
      const habitId = detail.notification?.data?.habitId;
      const notificationId = detail.notification?.id;
      if (notificationId) {
        notifee.cancelNotification(notificationId).catch(() => {});
      }
      if (habitId) {
        setTimeout(
          () => router.navigate({ pathname: '/habit/[id]', params: { id: habitId, reschedule: '1' } }),
          80
        );
      }
    } else if (actionId === 'start_timer') {
      const habitId = detail.notification?.data?.habitId;
      if (habitId) {
        await handleStartTimerAction(parseInt(habitId, 10), detail.notification?.id);
      }
    }
  } catch (e) {
    console.warn('[notifee background handler]', e);
  }
});
