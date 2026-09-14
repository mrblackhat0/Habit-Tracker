import notifee, {
  AndroidImportance,
  TriggerType,
  RepeatFrequency,
  TimestampTrigger,
} from '@notifee/react-native';
import { ActiveSession, seedDailyTotal } from '@/db/focus';
import { Habit, getLogsForHabit, getHabitById, logCompletion, db } from '@/db/habits';
import { Colors } from '@/constants/Colors';
import { getTodayDateStr } from '@/utils/dates';
import { useStore } from '@/store/store';

function isFocusNotificationsEnabled(): boolean {
  // In foreground _hydrated store is source of truth — ignore stale DB row after toggle
  try {
    const s = useStore.getState();
    if (s._hydrated) return s.focusNotificationsEnabled !== false;
    if (s.focusNotificationsEnabled === false) return false;
  } catch {}
  // Headless/background: store not hydrated, check persisted DB value
  try {
    const row = (db as any).getFirstSync?.(
      `SELECT value FROM app_settings WHERE key = ?`,
      ['focusNotificationsEnabled']
    );
    if (row) return row.value === '1';
  } catch {}
  try {
    return useStore.getState().focusNotificationsEnabled !== false;
  } catch {
    return true;
  }
}

const TIMER_CHANNEL_ID = 'timer_channel';
const STOPWATCH_CHANNEL_ID = 'stopwatch_channel';

let channelsInitialized = false;

async function safeDisplayNotification(payload: any) {
  try {
    await notifee.displayNotification(payload);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    console.warn('[notifee] display failed', payload.id, msg);
    if (msg.includes('small icon') || msg.includes('Invalid notification')) {
      try {
        await notifee.displayNotification({ ...payload, android: { ...payload.android, smallIcon: 'ic_launcher' } });
        return;
      } catch (e2) { console.warn('[notifee] fallback failed', e2); }
    }
    throw e;
  }
}

export async function initNotificationChannels() {
  if (channelsInitialized) return;
  try {
    await notifee.requestPermission();

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
  } catch (e) {
    console.warn('Notifee channel initialization failed:', e);
  }
}

function getNotificationId(habitId: number, dateStr?: string): string {
  const d = dateStr ?? getTodayDateStr();
  return `focus_habit_${habitId}_${d}`;
}

export async function updateSessionNotification(session: ActiveSession, habit: Habit, freshStart?: boolean) {
  const notificationId = getNotificationId(habit.id);
  if (!isFocusNotificationsEnabled()) {
    try { await notifee.cancelNotification(notificationId); } catch {}
    try { await (notifee as any).stopForegroundService?.(); } catch {}
    return;
  }
  try {
    await initNotificationChannels();

    const channelId = session.mode === 'timer' ? TIMER_CHANNEL_ID : STOPWATCH_CHANNEL_ID;

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
    const logMinsMs = Math.round((todayLogForMs?.loggedMinutes ?? 0) * 60) * 1000;
    const previousLoggedMs: number = Math.max(dbTotal, logMinsMs);

    const sessionTargetMs =
      session.targetGoalMs ?? (habit.goalMinutes ? habit.goalMinutes * 60000 : 0);

    const fullGoalMs = (habit.goalMinutes ?? 0) * 60000;
    const isExtraSession = fullGoalMs > 0 && previousLoggedMs >= fullGoalMs;

    if (session.status === 'running') {
      let timestamp = now;

      if (session.mode === 'timer' && sessionTargetMs > 0) {
        const remainingMs = Math.max(0, sessionTargetMs - currentElapsedMs);
        // ceil to match in-app countdown (system chronometer truncates)
        timestamp = now + Math.ceil(remainingMs / 1000) * 1000;
      } else {
      const totalElapsedMs = (freshStart ? 0 : previousLoggedMs) + currentElapsedMs;
        timestamp = now - totalElapsedMs;
      }

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
          smallIcon: 'ic_launcher',
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
    } else {
      const totalElapsedMs = (freshStart ? 0 : previousLoggedMs) + currentElapsedMs;

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

export async function scheduleTimerCompletion(habit: Habit, session: ActiveSession) {
  if (session.mode !== 'timer' || !session.targetGoalMs) return;
  const now = Date.now();
  let elapsed = session.accumulatedMs;
  if (session.status === 'running') elapsed += now - session.startedAt;
  const remaining = session.targetGoalMs - elapsed;
  if (remaining <= 500) return;
  try {
    await initNotificationChannels();
    const todayStr = getTodayDateStr();
    const notifId = `focus_habit_${habit.id}_${todayStr}`;
    // Use same id as stopSessionNotification so trigger and foreground share one notification (no duplicate)
    await notifee.cancelTriggerNotification(notifId).catch(() => {});
    // Compute final mins for trigger body so it matches stop & log (single notification)
    const { getDailyTotalMs: getTotal } = require('../db/focus');
    let dbTotal = 0;
    try { dbTotal = getTotal(habit.id, todayStr); } catch {}
    let logMinsMs = 0;
    try {
      const logs = await getLogsForHabit(habit.id);
      const t = logs.find((l:any) => l.date === todayStr);
      logMinsMs = Math.round((t?.loggedMinutes ?? 0) * 60) * 1000;
    } catch {}
    const previous = Math.max(dbTotal, logMinsMs);
    const sessionMins = Math.max(1, Math.round(remaining / 60000));
    // total after completion: previous + remaining (freshStart already baked into target)
    const totalMins = Math.round((previous + remaining) / 60000);
    // Delay 1s so foreground has chance to cancel and show its own (avoid double fire)
    const trigger: TimestampTrigger = { type: TriggerType.TIMESTAMP, timestamp: now + remaining + 1000 };
    await notifee.createTriggerNotification(
      {
        id: notifId,
        title: habit.name,
        body: `logged now: ${sessionMins}m ✓ • logged today: ${totalMins}m ✓`,
        data: { habitId: String(habit.id), type: 'timer_complete', targetMs: String(session.targetGoalMs) },
        android: {
          channelId: TIMER_CHANNEL_ID,
          smallIcon: 'ic_launcher',
          color: Colors.primary,
          pressAction: { id: 'default' },
          ongoing: false,
          autoCancel: true,
          showTimestamp: true,
          showChronometer: false,
        },
      },
      trigger
    );
  } catch (e) {
    console.warn('scheduleTimerCompletion failed', e);
  }
}

export async function cancelTimerCompletion(habitId: number) {
  try {
    const todayStr = getTodayDateStr();
    const notifId = `focus_habit_${habitId}_${todayStr}`;
    await notifee.cancelTriggerNotification(notifId).catch(() => {});
    await notifee.cancelTriggerNotification(`timer_complete_${habitId}`).catch(() => {});
  } catch {}
  try {
    const todayStr = getTodayDateStr();
    const notifId = `focus_habit_${habitId}_${todayStr}`;
    await notifee.cancelNotification(notifId).catch(() => {});
  } catch {}
  try { await notifee.cancelNotification(`timer_complete_${habitId}`); } catch {}
}

export async function stopSessionNotification(
  habitId: number,
  habitName: string,
  sessionMins: number,
  totalMinsToday: number
) {
  try {
    await initNotificationChannels();
    const notificationId = getNotificationId(habitId);

    await notifee.cancelNotification(notificationId);
    await notifee.stopForegroundService();

    if (!isFocusNotificationsEnabled()) {
      return;
    }

    await safeDisplayNotification({
      id: notificationId,
      title: habitName,
      body: `logged now: ${sessionMins}m ✓ • logged today: ${totalMinsToday}m ✓`,
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
const ALARM_CHANNEL_ID = 'habit_alarm_channel';
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

function isAlarmEnabled(): boolean {
  try {
    const s = require('@/store/store').useStore.getState();
    if (s._hydrated) return s.alarmEnabled === true;
    if (s.alarmEnabled === true) return true;
  } catch {}
  try {
    const row = (db as any).getFirstSync?.(`SELECT value FROM app_settings WHERE key = ?`, ['alarmEnabled']);
    if (row) return row.value === '1';
  } catch {}
  return false;
}

export async function initReminderChannel() {
  try {
    await notifee.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: 'Habit Reminders',
      importance: AndroidImportance.HIGH,
      sound: 'default',
    });
    await notifee.createChannel({
      id: ALARM_CHANNEL_ID,
      name: 'Habit Alarm',
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
    } catch (_) {}
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

  // ponytail: Android 12+ exact alarm - check permission and log triggers for when app closed
  try {
    const settings: any = await notifee.getNotificationSettings();
    if (settings?.android?.alarm === 0) {
      console.warn('[notifee] exact alarm denied - triggers will not fire when app closed');
      try { await (notifee as any).openAlarmPermissionSettings?.(); } catch {}
    }
  } catch {}
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
      const useAlarm = isAlarmEnabled();
      await notifee.createTriggerNotification(
        {
          id: `habit_reminder_${habitId}_day_${dayOfWeek}`,
          title: `Reminder: ${habitName}`,
          subtitle: useAlarm ? 'Alarm • tap to act' : undefined,
          data: { habitId: String(habitId) },
          android: {
            channelId: useAlarm ? ALARM_CHANNEL_ID : REMINDER_CHANNEL_ID,
            smallIcon: 'ic_launcher',
            color: Colors.primary,
            showTimestamp: true,
            pressAction: {
              id: 'default',
            },
            actions,
            ...(useAlarm ? { fullScreenAction: { id: 'default' } as any, category: 'alarm' as any } : {}),
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
    await notifee.createTriggerNotification(
      {
        id: WEEKLY_ID,
        title: 'Weekly overview 📊',
        body: 'Your week in review — completions, streaks & missed habits are ready.',
        data: { type: 'weekly_overview' },
        android: {
          channelId: WEEKLY_CHANNEL_ID,
          smallIcon: 'ic_launcher',
          showTimestamp: true,
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
  snoozeMinutes: number = 15,
  fallbackTitle?: string
) {
  try {
    let habit: Habit | null = null;
    try {
      habit = await getHabitById(habitId);
    } catch (e) {
      console.warn('[notifee] getHabitById failed in reschedule (headless DB may be locked)', e);
    }

    if (notificationId) {
      try { await notifee.cancelNotification(notificationId); } catch {}
    }

    await initReminderChannel();

    // ponytail: when app is closed (headless), DB may be locked — fallback to generic actions/title
    const actions = habit ? getReminderActions(habit) : [
      { title: 'Mark Completed', pressAction: { id: 'mark_completed' } },
      { title: 'Reschedule', pressAction: { id: 'reschedule' } },
    ];
    const titleName = habit?.name ?? fallbackTitle ?? 'Habit';
    const snoozeTime = Date.now() + snoozeMinutes * 60 * 1000;
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: snoozeTime,
    };

    const useAlarmReschedule = isAlarmEnabled();
    await notifee.createTriggerNotification(
      {
        id: `habit_reminder_${habitId}_rescheduled_${snoozeTime}`,
        title: `Reminder: ${titleName}`,
        subtitle: useAlarmReschedule ? 'Alarm • snoozed' : undefined,
        data: { habitId: String(habitId) },
        android: {
          channelId: useAlarmReschedule ? ALARM_CHANNEL_ID : REMINDER_CHANNEL_ID,
          smallIcon: 'ic_launcher',
          color: Colors.primary,
          showTimestamp: true,
          pressAction: {
            id: 'default',
          },
          actions,
          ...(useAlarmReschedule ? { fullScreenAction: { id: 'default' } as any, category: 'alarm' as any } : {}),
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
