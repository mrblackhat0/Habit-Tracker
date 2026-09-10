import notifee, {
  AndroidImportance,
  TriggerType,
  RepeatFrequency,
  TimestampTrigger,
} from '@notifee/react-native';
import { ActiveSession, seedDailyTotal } from '@/db/focus';
import { Habit, getLogsForHabit, getHabitById, logCompletion } from '@/db/habits';
import { Colors } from '@/constants/Colors';
import { getTodayDateStr } from '@/utils/dates';
import { useStore } from '@/store/store';

const TIMER_CHANNEL_ID = 'timer_channel';
const STOPWATCH_CHANNEL_ID = 'stopwatch_channel';

let channelsInitialized = false;

// ponytail: ic_notification asset is full-color 72px PNG and android/ folder is
// excluded from copy, so it may be missing/invalid at runtime. Fall back to
// ic_launcher (guaranteed after prebuild, .webp) instead of crashing.
async function safeDisplayNotification(payload: any) {
  try {
    console.log('[notifee] displayNotification try', payload.id, payload.android?.smallIcon, payload.android?.channelId, JSON.stringify(payload.android).slice(0,300));
    await notifee.displayNotification(payload);
    console.log('[notifee] displayNotification success', payload.id);
    try {
      const displayed = await notifee.getDisplayedNotifications();
      console.log('[notifee] displayed count', displayed.length, displayed.map((n:any)=>n.id));
      const ch = await notifee.getChannel(payload.android?.channelId).catch(()=>null);
      console.log('[notifee] channel check', payload.android?.channelId, ch);
    } catch (e:any) { console.log('[notifee] displayed check failed', e?.message); }
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('small icon') || msg.includes('Invalid notification')) {
      // ponytail: ic_notification is colored 72px, fails for non-foreground (paused/stop) on Android 13+.
      // Try ic_launcher directly — no WARN, just log.
      console.log('[notifee] displayNotification failed, retry with ic_launcher', payload.id, msg);
      try {
        await notifee.displayNotification({ ...payload, android: { ...payload.android, smallIcon: 'ic_launcher' } });
        console.log('[notifee] retry ic_launcher success', payload.id);
        return;
      } catch (e2: any) {
        console.log('[notifee] retry ic_launcher failed', e2?.message ?? e2);
      }
      try {
        console.log('[notifee] retry with ic_launcher_round', payload.id);
        await notifee.displayNotification({ ...payload, android: { ...payload.android, smallIcon: 'ic_launcher_round' } });
        console.log('[notifee] retry ic_launcher_round success', payload.id);
        return;
      } catch (e3: any) {
        console.log('[notifee] retry ic_launcher_round failed', e3?.message ?? e3);
      }
      try {
        const { smallIcon: _omit, ...androidRest } = payload.android ?? {};
        console.log('[notifee] retry without smallIcon', payload.id);
        await notifee.displayNotification({ ...payload, android: androidRest });
        console.log('[notifee] retry without smallIcon success', payload.id);
        return;
      } catch (e4: any) {
        console.log('[notifee] retry without smallIcon failed', e4?.message ?? e4);
      }
    } else {
      console.warn('[notifee] displayNotification failed', payload.id, e?.message ?? e);
    }
    throw e;
  }
}

async function safeCreateTriggerNotification(payload: any, trigger: any) {
  try {
    await notifee.createTriggerNotification(payload, trigger);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('small icon') || msg.includes('Invalid notification')) {
      try {
        await notifee.createTriggerNotification({ ...payload, android: { ...payload.android, smallIcon: 'ic_launcher' } }, trigger);
        return;
      } catch {}
      try {
        const { smallIcon: _omit, ...androidRest } = payload.android ?? {};
        await notifee.createTriggerNotification({ ...payload, android: androidRest }, trigger);
        return;
      } catch {}
    }
    throw e;
  }
}

export async function initNotificationChannels() {
  if (channelsInitialized) return;
  try {
    const perm = await notifee.requestPermission();
    console.log('[notifee] requestPermission', perm);
    const settings = await notifee.getNotificationSettings().catch(()=>null);
    console.log('[notifee] settings after perm', settings);

    await notifee.createChannel({
      id: TIMER_CHANNEL_ID,
      name: 'Timer Service',
      importance: AndroidImportance.HIGH,
      sound: 'default',
    });

    await notifee.createChannel({
      id: STOPWATCH_CHANNEL_ID,
      name: 'Stopwatch Service',
      importance: AndroidImportance.HIGH,
      sound: 'default',
    });

    channelsInitialized = true;
    console.log('[notifee] channels initialized');
  } catch (e) {
    console.warn('Notifee channel initialization failed:', e);
  }
}

function getNotificationId(habitId: number, dateStr?: string): string {
  const d = dateStr ?? getTodayDateStr();
  return `focus_habit_${habitId}_${d}`;
}

export async function updateSessionNotification(session: ActiveSession, habit: Habit) {
  try {
    const focusEnabled = useStore.getState().focusNotificationsEnabled;
    console.log('[notifee] updateSessionNotification start', { habitId: habit.id, mode: session.mode, status: session.status, focusEnabled });
    if (!focusEnabled) {
      console.log('[notifee] focusNotifications disabled — cancelling');
      try {
        await notifee.cancelNotification(getNotificationId(habit.id));
      } catch {}
      try {
        await (notifee as any).stopForegroundService?.();
      } catch {}
      return;
    }
    await initNotificationChannels();
    console.log('[notifee] channels ready, perms', await notifee.getNotificationSettings().catch(()=>null));

    const channelId = session.mode === 'timer' ? TIMER_CHANNEL_ID : STOPWATCH_CHANNEL_ID;
    const notificationId = getNotificationId(habit.id);

    const now = Date.now();
    let currentElapsedMs = session.accumulatedMs;
    if (session.status === 'running') {
      currentElapsedMs += now - session.startedAt;
    }

    const todayStr = getTodayDateStr();
    const { getDailyTotalMs: getTotal } = require('../db/focus');
    const dbTotal: number = getTotal(habit.id, todayStr);
    const logsForDay = await getLogsForHabit(habit.id);
    const todayLogForMs = logsForDay.find((l) => l.date === todayStr);
    const logMinsMs = (todayLogForMs?.loggedMinutes ?? 0) * 60000;
    const previousLoggedMs: number = Math.max(dbTotal, logMinsMs);

    const sessionTargetMs =
      session.targetGoalMs ?? (habit.goalMinutes ? habit.goalMinutes * 60000 : 0);

    const fullGoalMs = (habit.goalMinutes ?? 0) * 60000;
    const isExtraSession = fullGoalMs > 0 && previousLoggedMs >= fullGoalMs;

    if (session.status === 'running') {
      let timestamp = now;

      if (session.mode === 'timer' && sessionTargetMs > 0) {
        const remainingMs = Math.max(0, sessionTargetMs - currentElapsedMs);
        timestamp = now + remainingMs;
      } else {
        const totalElapsedMs = previousLoggedMs + currentElapsedMs;
        timestamp = now - totalElapsedMs;
      }

      try {
        await safeDisplayNotification({
          id: notificationId,
          title: habit.name,
          body: undefined,
          subtitle: undefined,
          data: { habitId: String(habit.id) },
          android: {
            channelId,
            asForegroundService: true,
            ongoing: true,
            color: Colors.primary,
            smallIcon: 'ic_notification',
            showChronometer: true,
            chronometerDirection: session.mode === 'timer' ? 'down' : 'up',
            timestamp,
            pressAction: { id: 'default' },
            actions: [
              {
                title: 'Pause',
                pressAction: { id: 'pause' },
              },
              {
                title: 'Stop',
                pressAction: { id: 'stop' },
              },
            ],
          },
        });
      } catch (e) {
        console.warn('Foreground display failed, falling back to ongoing notification:', e);
        await safeDisplayNotification({
          id: notificationId,
          title: habit.name,
          body: undefined,
          data: { habitId: String(habit.id) },
          android: {
            channelId,
            ongoing: true,
            autoCancel: false,
            color: Colors.primary,
            smallIcon: 'ic_notification',
            showChronometer: true,
            chronometerDirection: session.mode === 'timer' ? 'down' : 'up',
            timestamp,
            pressAction: { id: 'default' },
            actions: [
              { title: 'Pause', pressAction: { id: 'pause' } },
              { title: 'Stop', pressAction: { id: 'stop' } },
            ],
          },
        });
      }
    } else {
      const totalElapsedMs = previousLoggedMs + currentElapsedMs;

      let body = `Paused — ${Math.floor(totalElapsedMs / 60000)}m elapsed`;
      if (session.mode === 'timer' && sessionTargetMs > 0) {
        const remainingMs = Math.max(0, sessionTargetMs - currentElapsedMs);
        const remainingMins = Math.ceil(remainingMs / 60000);
        const sessionTargetMins = Math.round(sessionTargetMs / 60000);
        const label = isExtraSession ? 'extra' : 'goal';
        body = `Paused — ${remainingMins}m left of ${sessionTargetMins}m ${label}`;
      }

      await safeDisplayNotification({
        id: notificationId,
        title: habit.name,
        body,
        data: { habitId: String(habit.id) },
        android: {
          channelId,
          asForegroundService: false,
          ongoing: true,
          color: Colors.primary,
          smallIcon: 'ic_launcher',
          pressAction: { id: 'default' },
          showTimestamp: true,
          showChronometer: false,
          actions: [
            {
              title: 'Resume',
              pressAction: { id: 'resume' },
            },
            {
              title: 'Stop',
              pressAction: { id: 'stop' },
            },
          ],
        },
      });
    }
  } catch (e) {
    console.warn('Failed to update session notification:', e);
  }
}

export async function stopSessionNotification(
  habitId: number,
  habitName: string,
  totalMinsToday: number
) {
  try {
    if (!useStore.getState().focusNotificationsEnabled) {
      try {
        await notifee.cancelNotification(getNotificationId(habitId));
      } catch {}
      try {
        await (notifee as any).stopForegroundService?.();
      } catch {}
      return;
    }
    await initNotificationChannels();
    const notificationId = getNotificationId(habitId);

    await notifee.cancelNotification(notificationId);
    try { await notifee.stopForegroundService(); } catch {}

    await safeDisplayNotification({
      id: notificationId,
      title: habitName,
      body: `${totalMinsToday}m logged today ✓`,
      android: {
        channelId: TIMER_CHANNEL_ID,
        ongoing: false,
        autoCancel: true,
        showTimestamp: true,
        color: Colors.primary,
        smallIcon: 'ic_launcher',
        showChronometer: false,
        pressAction: { id: 'default' },
      },
    });
  } catch (e) {
    console.warn('Failed to stop session notification:', e);
  }
}

/* ==========================================
   HABIT REMINDERS (Trigger Notifications)
   ========================================== */

const REMINDER_CHANNEL_ID = 'habit_reminders_channel';
const WEEKLY_CHANNEL_ID = 'weekly_overview_channel';
const WEEKLY_ID = 'weekly-overview-sunday-7am';
const DAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const settings = await notifee.requestPermission();
    return settings.authorizationStatus >= 1;
  } catch (e) {
    console.warn('Failed to request notification permission:', e);
    return false;
  }
}

export async function initReminderChannel() {
  try {
    await notifee.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: 'Habit Reminders',
      importance: AndroidImportance.HIGH,
      sound: 'default',
    });
  } catch (e) {
    console.warn('Failed to create reminder channel:', e);
  }
}

export async function initWeeklyChannel() {
  try {
    await notifee.createChannel({
      id: WEEKLY_CHANNEL_ID,
      name: 'Weekly Overview',
      importance: AndroidImportance.DEFAULT,
      sound: 'default',
    });
  } catch (e) {
    console.warn('Failed to create weekly channel:', e);
  }
}

export function getNextTriggerTimestamp(dayOfWeek: number, hours: number, minutes: number): number {
  const now = new Date();
  const result = new Date();
  result.setHours(hours, minutes, 0, 0);

  const currentDayOfWeek = now.getDay();
  let daysToAdd = (dayOfWeek - currentDayOfWeek + 7) % 7;

  if (daysToAdd === 0 && result.getTime() <= now.getTime()) {
    daysToAdd = 7;
  }

  result.setDate(result.getDate() + daysToAdd);
  return result.getTime();
}

export async function cancelHabitReminders(habitId: number) {
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    try {
      await notifee.cancelNotification(`habit_reminder_${habitId}_day_${dayIndex}`);
    } catch {}
  }
}

function getReminderActions(habit: Habit) {
  const actions: { title: string; pressAction: { id: string } }[] = [];

  if (habit.progressType === 'duration') {
    actions.push({
      title: 'Start',
      pressAction: { id: 'start_timer' },
    });
  } else if (habit.progressType === 'quantity') {
    actions.push({
      title: '+1',
      pressAction: { id: 'plus_one' },
    });
  }

  actions.push(
    {
      title: 'Mark Completed',
      pressAction: { id: 'mark_completed' },
    },
    {
      title: 'Reschedule',
      pressAction: { id: 'reschedule' },
    }
  );

  return actions;
}

export async function syncHabitReminder(
  habitId: number,
  habitName: string,
  timeStr: string | null,
  occurrence: string,
  reminderEnabled: boolean = true
) {
  await cancelHabitReminders(habitId);

  if (!reminderEnabled || !timeStr || !timeStr.trim()) {
    return;
  }

  const d = new Date(timeStr);
  let hours: number;
  let minutes: number;

  if (!isNaN(d.getTime())) {
    hours = d.getHours();
    minutes = d.getMinutes();
  } else {
    const parts = timeStr.split(':');
    if (parts.length < 2) return;
    hours = parseInt(parts[0], 10);
    minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return;
  }

  let selectedDays: number[] = [];
  if (occurrence === 'daily') {
    selectedDays = [0, 1, 2, 3, 4, 5, 6];
  } else {
    selectedDays = occurrence
      .split(',')
      .map((s) => DAY_MAP[s.trim()])
      .filter((d) => d !== undefined);
  }

  if (selectedDays.length === 0) return;

  await initReminderChannel();

  // formatted reminder time for title e.g. "7:00 AM"
  const _tmpDate = new Date();
  _tmpDate.setHours(hours, minutes, 0, 0);
  const reminderTimeLabel = _tmpDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const habit = await getHabitById(habitId);
  const actions = habit
    ? getReminderActions(habit)
    : [
        { title: 'Mark Completed', pressAction: { id: 'mark_completed' } },
        { title: 'Reschedule', pressAction: { id: 'reschedule' } },
      ];

  const todayStr = getTodayDateStr();
  const logs = await getLogsForHabit(habitId);
  const isCompletedToday = logs.some((l) => l.date === todayStr && l.completed);
  const now = new Date();
  const todayDayOfWeek = now.getDay();

  for (const dayOfWeek of selectedDays) {
    let timestamp = getNextTriggerTimestamp(dayOfWeek, hours, minutes);

    if (dayOfWeek === todayDayOfWeek && isCompletedToday) {
      const todayTime = new Date();
      todayTime.setHours(hours, minutes, 0, 0);
      if (now.getTime() < todayTime.getTime()) {
        timestamp += 7 * 24 * 60 * 60 * 1000;
      }
    }

    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp,
      repeatFrequency: RepeatFrequency.WEEKLY,
    };

    try {
      await safeCreateTriggerNotification(
        {
          id: `habit_reminder_${habitId}_day_${dayOfWeek}`,
          title: `Reminder: ${habitName} — ${reminderTimeLabel}`,
          body: 'Time to get moving',
          data: { habitId: String(habitId) },
          android: {
            channelId: REMINDER_CHANNEL_ID,
            smallIcon: 'ic_launcher',
            color: Colors.primary,
            showTimestamp: true,
            pressAction: {
              id: 'default',
            },
            actions,
          },
        },
        trigger
      );
    } catch (e) {
      console.warn(`Failed to schedule reminder trigger for day ${dayOfWeek}:`, e);
    }
  }
}

export async function scheduleWeeklyOverview(enabled: boolean) {
  try {
    if (!enabled) {
      await notifee.cancelTriggerNotification(WEEKLY_ID);
      return;
    }
    await notifee.requestPermission();
    await initWeeklyChannel();
    const timestamp = getNextTriggerTimestamp(0, 7, 0);
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp,
      repeatFrequency: RepeatFrequency.WEEKLY,
    };
    await safeCreateTriggerNotification(
      {
        id: WEEKLY_ID,
        title: 'Weekly overview 📊',
        body: 'Your week in review — completions, streaks & missed habits are ready.',
        data: { type: 'weekly_overview' },
        android: {
          channelId: WEEKLY_CHANNEL_ID,
          smallIcon: 'ic_launcher',
          color: Colors.primary,
          pressAction: { id: 'default' },
        },
      },
      trigger
    );
  } catch (e) {
    console.warn('Failed to schedule weekly overview:', e);
  }
}

export async function onHabitCompletionToggled(habit: Habit, dateStr: string, completed: boolean) {
  const todayStr = getTodayDateStr();
  if (dateStr !== todayStr) return;

  await syncHabitReminder(habit.id, habit.name, habit.time, habit.occurrence, habit.reminder);
}

export async function handleMarkCompletedAction(habitId: number, notificationId?: string) {
  try {
    const habit = await getHabitById(habitId);
    if (!habit) return;

    const todayStr = getTodayDateStr();
    const logs = await getLogsForHabit(habitId);
    const existingLog = logs.find((l) => l.date === todayStr);

    if (!existingLog?.completed) {
      const existingMins = existingLog?.loggedMinutes ?? 0;
      const loggedMinutes = existingMins > 0 ? existingMins : (habit.goalMinutes ?? null);
      const existingQty = existingLog?.loggedQty ?? 0;
      const loggedQty = existingQty > 0 ? existingQty : (habit.goalQty ?? null);

      await logCompletion({
        habitId,
        date: todayStr,
        loggedMinutes,
        loggedQty,
        completed: true,
      });

      if (habit.goalMinutes && existingMins === 0) {
        seedDailyTotal(habitId, todayStr, habit.goalMinutes * 60000);
      }

      await syncHabitReminder(habit.id, habit.name, habit.time, habit.occurrence, habit.reminder);
    }

    if (notificationId) {
      await notifee.cancelNotification(notificationId);
    }
  } catch (e) {
    console.warn('Failed to handle mark_completed action:', e);
  }
}

export async function handleRescheduleAction(
  habitId: number,
  notificationId?: string,
  snoozeMinutes: number = 15
) {
  try {
    const habit = await getHabitById(habitId);
    if (!habit) return;

    if (notificationId) {
      await notifee.cancelNotification(notificationId);
    }

    await initReminderChannel();

    const actions = getReminderActions(habit);
    const snoozeTime = Date.now() + snoozeMinutes * 60 * 1000;
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: snoozeTime,
    };

    await safeCreateTriggerNotification(
      {
        id: `habit_reminder_${habitId}_rescheduled_${snoozeTime}`,
        title: `Reminder: ${habit.name}`,
        body: 'Time to get moving',
        data: { habitId: String(habitId) },
        android: {
          channelId: REMINDER_CHANNEL_ID,
          smallIcon: 'ic_launcher',
          color: Colors.primary,
          showTimestamp: true,
          pressAction: {
            id: 'default',
          },
          actions,
        },
      },
      trigger
    );
  } catch (e) {
    console.warn('Failed to handle reschedule action:', e);
  }
}

export async function handleStartTimerAction(habitId: number, notificationId?: string) {
  try {
    const habit = await getHabitById(habitId);
    if (!habit || habit.progressType !== 'duration') return;

    if (notificationId) {
      await notifee.cancelNotification(notificationId);
    }

    const { getActiveSession, startActiveSession, getDailyTotalMs } = require('../db/focus');
    const active = getActiveSession();
    if (active) {
      return;
    }

    const todayStr = getTodayDateStr();
    const todayLoggedMs = getDailyTotalMs(habit.id, todayStr);
    const fullGoalMins = habit.goalMinutes ?? 30;
    const fullGoalMs = fullGoalMins * 60 * 1000;
    const remainingMs = Math.max(0, fullGoalMs - todayLoggedMs);
    const targetMs = remainingMs > 0 ? remainingMs : fullGoalMs;

    const newSession = startActiveSession({
      habitId: habit.id,
      mode: 'timer',
      targetGoalMs: targetMs,
    });

    if (newSession) {
      await updateSessionNotification(newSession, habit);
    }
  } catch (e) {
    console.warn('Failed to handle start_timer action:', e);
  }
}

export async function handlePlusOneAction(habitId: number, notificationId?: string) {
  try {
    const habit = await getHabitById(habitId);
    if (!habit || habit.progressType !== 'quantity') return;

    const todayStr = getTodayDateStr();
    const logs = await getLogsForHabit(habitId);
    const todayLog = logs.find((l) => l.date === todayStr);

    const currentQty = todayLog?.loggedQty ?? 0;
    const newQty = currentQty + 1;
    const goalQty = habit.goalQty ?? 1;
    const completed = newQty >= goalQty || (todayLog?.completed ?? false);

    await logCompletion({
      habitId,
      date: todayStr,
      loggedQty: newQty,
      completed,
    });

    await syncHabitReminder(habit.id, habit.name, habit.time, habit.occurrence, habit.reminder);

    if (notificationId) {
      await notifee.cancelNotification(notificationId);
    }
  } catch (e) {
    console.warn('Failed to handle plus_one action:', e);
  }
}
