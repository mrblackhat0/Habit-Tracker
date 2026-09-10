import notifee, { EventType } from '@notifee/react-native';
import {
  pauseActiveSession,
  resumeActiveSession,
  resolveActiveSession,
  getDailyTotalMs,
} from '@/db/focus';
import { getHabitById } from '@/db/habits';
import {
  updateSessionNotification,
  stopSessionNotification,
  handleMarkCompletedAction,
  handleStartTimerAction,
  handlePlusOneAction,
} from '@/services/notificationService';
import { router } from 'expo-router';

function getTodayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

notifee.registerForegroundService(() => new Promise(() => {}));

notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.PRESS && detail.pressAction?.id === 'default') {
    const habitId = detail.notification?.data?.habitId;
    if (habitId) {
      router.navigate({
        pathname: '/habit/[id]/goal',
        params: { id: habitId.toString() },
      });
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
      const result = resolveActiveSession();
      if (result) {
        const habit = await getHabitById(result.habitId);
        if (habit) {
          const todayStr = getTodayDateStr();
          const dailyTotalMs = getDailyTotalMs(result.habitId, todayStr);
          const totalMinsToday = Math.max(1, Math.round(dailyTotalMs / 60000));
          await stopSessionNotification(habit.id, habit.name, totalMinsToday);
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
      const habitId = detail.notification?.data?.habitId;
      if (habitId) {
        try { await notifee.cancelNotification(detail.notification?.id); } catch {}
        router.navigate({ pathname: '/habit/[id]', params: { id: String(habitId), reschedule: '1' } });
      }
    } else if (actionId === 'start_timer') {
      const habitId = detail.notification?.data?.habitId;
      if (habitId) {
        await handleStartTimerAction(parseInt(habitId, 10), detail.notification?.id);
      }
    } else if (actionId === 'plus_one') {
      const habitId = detail.notification?.data?.habitId;
      if (habitId) {
        await handlePlusOneAction(parseInt(habitId, 10), detail.notification?.id);
      }
    }
  } catch (e) {
    console.warn('[notifee background handler]', e);
  }
});
