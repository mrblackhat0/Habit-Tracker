import notifee, { EventType } from '@notifee/react-native';
import {
  handleMarkCompletedAction,
  handleStartTimerAction,
} from '../services/notificationService';
import { pauseFromNotification, resumeFromNotification, stopFromNotification, completeTimerFromTrigger } from '../services/sessionActions';
import { getHabitById } from '@/db/habits';
import { router } from 'expo-router';

notifee.registerForegroundService(() => new Promise(() => {}));

notifee.onBackgroundEvent(async ({ type, detail }) => {
  // Gate on DB readiness — headless context may re-evaluate modules.
  try {
    const { dbReady } = require('@/db/database');
    await dbReady;
  } catch (e) { if (__DEV__) console.warn('[BG] dbReady', e); }
  if (
    type === EventType.DELIVERED &&
    detail.notification?.data?.type === 'timer_complete'
  ) {
    if (__DEV__) console.log('[Background] delivered timer_complete');
    try {
      await completeTimerFromTrigger();
    } catch (e) {
      console.warn('[timer_complete background]', e);
    }
    return;
  }
  if (type === EventType.PRESS && detail.pressAction?.id === 'default') {
    const habitId = detail.notification?.data?.habitId;
    if (__DEV__) console.log('[Background] default press, habitId:', habitId);
    if (habitId) {
      try {
        const habit = await getHabitById(Number(habitId));
        if (habit && habit.progressType !== 'check') {
          setTimeout(
            () =>
              router.navigate({ pathname: '/habit/[id]/goal', params: { id: habitId.toString() } }),
            80
          );
        } else {
          router.navigate({ pathname: '/habit/[id]', params: { id: habitId.toString() } });
        }
      } catch (e) {
        if (__DEV__) console.warn('[BG] default press habit lookup', e);
        router.navigate({ pathname: '/habit/[id]', params: { id: habitId.toString() } });
      }
    }
  }
  if (type !== EventType.ACTION_PRESS || !detail.pressAction?.id) return;

  const actionId = detail.pressAction.id;

  try {
    if (actionId === 'pause') {
      if (__DEV__) console.log('[Background] action: pause');
      await pauseFromNotification();
    } else if (actionId === 'resume') {
      if (__DEV__) console.log('[Background] action: resume');
      await resumeFromNotification();
    } else if (actionId === 'stop') {
      if (__DEV__) console.log('[Background] action: stop');
      await stopFromNotification();
    } else if (actionId === 'mark_completed') {
      const habitId = detail.notification?.data?.habitId;
      if (__DEV__) console.log('[Background] action: mark_completed, habitId:', habitId);
      if (habitId) {
        await handleMarkCompletedAction(parseInt(habitId, 10), detail.notification?.id);
      }
    } else if (actionId === 'reschedule') {
      const habitId = detail.notification?.data?.habitId;
      if (__DEV__) console.log('[Background] action: reschedule, habitId:', habitId);
      if (habitId) {
        if (detail.notification?.id)
          notifee.cancelNotification(detail.notification.id).catch((e) => { if (__DEV__) console.warn('[BG] cancelNotification', e); });
        router.navigate({
          pathname: '/habit/[id]',
          params: { id: String(habitId), reschedule: '1' },
        });
      }
    } else if (actionId === 'start_timer') {
      const habitId = detail.notification?.data?.habitId;
      if (__DEV__) console.log('[Background] action: start_timer, habitId:', habitId);
      if (habitId) {
        await handleStartTimerAction(parseInt(habitId, 10), detail.notification?.id);
      }
    }
  } catch (e) {
    console.warn('[notifee background handler]', e);
  }
});
