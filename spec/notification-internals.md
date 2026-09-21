# Notification Internals — Read-Only Investigation

## 1. updateSessionNotification — full notification objects

### Running (`notificationService.ts:144–171`):

```typescript
await safeDisplayNotification({
  id: notificationId,                                          // "focus_habit_{id}_{todayStr}"
  title: habit.name,
  body: undefined,
  subtitle: undefined,
  data: { habitId: String(habit.id) },
  android: {
    channelId,                                                // TIMER_CHANNEL_ID or STOPWATCH_CHANNEL_ID
    asForegroundService: true,
    ongoing: true,
    color: Colors.primary,
    smallIcon: 'ic_launcher',
    showChronometer: true,
    chronometerDirection: session.mode === 'timer' ? 'down' : 'up',
    timestamp,                                                // timer: now + ceil(remaining/1000)*1000; stopwatch: now - totalElapsedMs
    pressAction: { id: 'default' },
    actions: [
      { title: 'Pause', pressAction: { id: 'pause' } },
      { title: 'Stop',  pressAction: { id: 'stop' } },
    ],
  },
});
```

No `timeoutAfter`, no `autoCancel`.

### Paused (`notificationService.ts:181–206`):

```typescript
await safeDisplayNotification({
  id: notificationId,                                          // same "focus_habit_{id}_{todayStr}"
  title: habit.name,
  body,                                                       // "Paused — X left of Y" (timer) or "Paused — X elapsed" (stopwatch)
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
      { title: 'Resume', pressAction: { id: 'resume' } },
      { title: 'Stop',   pressAction: { id: 'stop' } },
    ],
  },
});
```

No `chronometerDirection`, no `timestamp`, no `timeoutAfter`, no `autoCancel`.

---

## 2. scheduleTimerCompletion — full trigger + notification object

### Trigger (`notificationService.ts:242–245`):

```typescript
const trigger: TimestampTrigger = {
  type: TriggerType.TIMESTAMP,
  timestamp: now + remaining + 1000,
};
```

### Notification (`notificationService.ts:247–268`):

```typescript
await notifee.createTriggerNotification(
  {
    id: notifId,                                              // "focus_habit_{habit.id}_{todayStr}"
    title: habit.name,
    body: `Time's up! ${formatDuration(remaining)} ✓ • today: ${formatDuration(totalMs)}`,
    data: {
      habitId: String(habit.id),
      type: 'timer_complete',
      targetMs: String(session.targetGoalMs),
    },
    android: {
      channelId: TIMER_CHANNEL_ID,
      smallIcon: 'ic_launcher',
      color: Colors.primary,
      pressAction: { id: 'default' },
      ongoing: false,
      autoCancel: true,
      showTimestamp: true,
      showChronometer: false,                                 // explicitly false
    },
  },
  trigger
);
```

`showChronometer: false` — no chronometer on the completion notification.

**Is its `id` equal to the running session notification's `id`? YES.** Both use `focus_habit_{habit.id}_{todayStr}` (line 223 constructs it the same way as `getNotificationId` at line 87–90). The comment on line 224 confirms: "Use same id as stopSessionNotification so trigger and foreground share one notification (no duplicate)".

---

## 3. notifee.registerForegroundService()

**File:** `services/notifeeBackground.js`, **line 19**.

```javascript
notifee.registerForegroundService(() => new Promise(() => {}));
```

The runner is `() => new Promise(() => {})` — a no-op that returns a promise that never resolves. This is the required placeholder to satisfy notifee's foreground service registration. The actual foreground service work (updating the notification with chronometer) is done by calling `notifee.displayNotification()` with `asForegroundService: true` in `updateSessionNotification`. The runner itself does nothing.

---

## 4. What happens to the running session notification when the trigger fires while the app is killed?

**Notification IDs that exist at trigger-fire time:**

- `focus_habit_{id}_{todayStr}` — the **trigger notification** (created by `scheduleTimerCompletion`). This is now a delivered notification in the tray.
- `focus_habit_{id}_{todayStr}` — the **foreground service notification** was previously displayed with the same ID, but when the app is killed the foreground service is destroyed. Android automatically removes the foreground service notification when the process dies.

**What can run without JS (app killed):**

- The trigger fires via Android's AlarmManager -> notifee's headless JS task is spun up -> `notifee.onBackgroundEvent` handler runs.
- The handler calls `resolveActiveSession()` (line 42) to mark the session complete in DB.
- It calls `notifee.cancelTriggerNotification(detail.notification.id)` (line 45) to clean up the trigger.
- **No `cancelNotification` or `displayNotification` call is made** — the trigger notification itself (same ID `focus_habit_{id}_{todayStr}`) **stays visible in the tray** as the final "Time's up!" notification. This is by design (line 41 comment: "trigger's notification is already the final one (same id as stop), don't show duplicate").

**Net result:** When the app is killed and the trigger fires, the user sees the trigger notification (with body `Time's up! X ✓ • today: Y`) in the notification tray. No foreground service notification exists to cancel. The trigger notification is NOT cancelled (only the trigger itself is cleaned up via `cancelTriggerNotification`). The DB session is marked completed.

---

## 5. stopSession and stopSessionNotification — which IDs are cancelled, which are displayed?

### stopSession (`store/focusStore.ts:109–128`):

```typescript
stopSession: (reason?: 'completed') => {
  cancelTimerCompletion(current.habitId);       // cancels trigger + displayed notification
  const result = resolveActiveSession();        // marks DB complete, deletes active_session row
  // ...
  stopSessionNotification(habit.id, habit.name, sessionMs, dailyTotalMs, reason);
}
```

### cancelTimerCompletion (`notificationService.ts:275–290`):

```typescript
// Cancels trigger notification:
notifee.cancelTriggerNotification(`focus_habit_{habitId}_{todayStr}`)  // line 279
notifee.cancelTriggerNotification(`timer_complete_{habitId}`)          // line 280

// Cancels displayed notification:
notifee.cancelNotification(`focus_habit_{habitId}_{todayStr}`)        // line 285
notifee.cancelNotification(`timer_complete_{habitId}`)                // line 288
```

### stopSessionNotification (`notificationService.ts:292–330`):

```typescript
const notificationId = getNotificationId(habitId);   // "focus_habit_{habitId}_{todayStr}"
notifee.cancelNotification(notificationId);           // line 303 — cancel again (redundant after cancelTimerCompletion)
notifee.stopForegroundService();                       // line 304

// Then displays a new one-shot notification:
safeDisplayNotification({
  id: notificationId,                                 // same "focus_habit_{habitId}_{todayStr}"
  title: habitName,
  body: "Time's up! ..." (completed) or "logged now: ..." (manual),
  android: {
    channelId: TIMER_CHANNEL_ID,
    ongoing: false,
    autoCancel: true,
    showTimestamp: true,
    showChronometer: false,
    pressAction: { id: 'default' },
  },
});
```

**Summary:** IDs cancelled: `focus_habit_{id}_{todayStr}` (trigger + displayed) and `timer_complete_{id}` (trigger + displayed). Then a **new** notification is displayed with the **same ID** `focus_habit_{id}_{todayStr}` — so the final visible notification replaces whatever was there before.

---

## 6. Paused notification — timestamp/chronometer config

**File:** `notificationService.ts:181–206`

```typescript
android: {
  asForegroundService: false,
  ongoing: true,
  pressAction: { id: 'default' },
  showTimestamp: true,
  showChronometer: false,
  // NO chronometerDirection
  // NO timestamp (not set — the timestamp field is absent from the android object)
  actions: [
    { title: 'Resume', pressAction: { id: 'resume' } },
    { title: 'Stop',   pressAction: { id: 'stop' } },
  ],
}
```

- **`showChronometer: false`** — countdown/countup is disabled.
- **`showTimestamp: true`** — shows when the notification was posted (not a countdown).
- **No `timestamp` field** — Android defaults to the current time at display.
- **No `chronometerDirection`** — not relevant since chronometer is off.
