# Fix: `mark_completed` and `reschedule` fail on a truly killed app

## Symptom

On a fully killed app: the **habit reminder notification itself often never
appears**, and on the occasions it does, its `Mark Completed` and
`Reschedule` actions do nothing. `Pause` / `Resume` / `Stop` actions on the
**focus session** notification still work after the app is closed — see
below for why that's not a fair comparison. The previous full-screen,
lock-screen-ringing alarm feature has been removed; the reminder notification
below (`syncHabitReminder`, a standard trigger notification) is now the only
delivery mechanism, so there's no separate alarm layer left to account for.

## Why "it works for Pause/Resume/Stop" is misleading

Pause/Resume/Stop only ever fire while a focus session's foreground
notification (`asForegroundService: true`) is showing. A live foreground
service keeps the host process alive — swiping the app from recents in that
state is **not** a real process kill. Reminder notifications have no
foreground service, so they are the only true cold-kill (`HeadlessJsTaskService`)
path in this app, and it exposes three separate issues — including one
that's a platform restriction, not a bug you introduced.

## Root cause 0 — reminders never opted into AlarmManager, and repeating alarms are inexact anyway (this is why the notification itself doesn't fire, separate from the action-button bug)

`syncHabitReminder` schedules each reminder with:

```js
const trigger: TimestampTrigger = {
  type: TriggerType.TIMESTAMP,
  timestamp,
  repeatFrequency: RepeatFrequency.WEEKLY,
};
```

Two stacked platform facts, both confirmed against notifee's docs:

1. **By default, notifee trigger notifications run on Android's WorkManager, not AlarmManager** — you only get AlarmManager (and its Doze-surviving `setExactAndAllowWhileIdle`) by explicitly passing `alarmManager: { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE }` on the trigger. This trigger never does, so it's running on WorkManager, which gives no timing guarantee and is exactly what OEM battery managers defer first once the app isn't running.
2. As of Android API 19, **all repeating alarms are inexact** regardless — there is no "exact repeating" API on Android. Even adding `alarmManager` while keeping `repeatFrequency` wouldn't make this exact.

The code already has exact-alarm-permission-check logic (`notifee.getNotificationSettings()` / `openAlarmPermissionSettings`) — but since the trigger itself never requests AlarmManager, that check has never been protecting anything.

**Fix:** drop `repeatFrequency`; instead pre-book several individual one-shot `alarmManager`-backed triggers per weekday (e.g. the next 8 weeks), each with a unique id. This avoids needing a runtime reschedule-on-fire step that would depend on Root Cause 1's shaky DB connection to look up the habit again.

## Root cause 1 — wrong DB readiness gate

`services/notifeeBackground.js` gates every background event on:

```js
const { dbReady } = require('@/db/database');
await dbReady;
```

But `handleMarkCompletedAction` (in `services/notificationService.ts`) reads
`db`, `getHabitById`, `getLogsForHabit`, `logCompletion` from
**`@/db/habits`**, a separate module. If `@/db/habits` still opens or relies
on any connection that isn't the same singleton gated by `@/db/database`'s
`dbReady` (this app has a documented history of a dual-SQLite-connection
race between a module-level connection and a `SQLiteProvider`-bound one),
then awaiting `@/db/database`'s `dbReady` does not guarantee `@/db/habits`'s
connection is usable in a cold headless process. The call silently fails and
is swallowed by the outer `catch (e) { console.warn(...) }` in
`notifeeBackground.js` — which is invisible once the process is dead anyway.

Pause/Resume/Stop don't hit this because they go through `@/db/focus`, not
`@/db/habits`.

## Root cause 2 — navigation call with no navigation container

The `reschedule` branch in `notifeeBackground.js` calls:

```js
router.navigate({ pathname: '/habit/[id]', params: { id: habitId, reschedule: '1' } });
```

On a true kill, Android runs the background event in a `HeadlessJsTaskService`
— no Activity, no mounted `_layout.tsx`, no `NavigationContainer`. `expo-router`'s
`router` has nothing to act on. This is a no-op, not a crash, so there's
nothing to see in logs.

## Required changes

### 1. Switch habit reminders to pre-booked one-shot exact alarms

- Add `AlarmType` to the notifee import and pass
  `alarmManager: { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE }` on every
  reminder trigger — without it, the trigger runs on WorkManager (the
  notifee default), which has no timing guarantee.
- Remove `repeatFrequency: RepeatFrequency.WEEKLY` — Android has no exact
  repeating alarm API, so this was always inexact regardless of
  `alarmManager`.
- In `syncHabitReminder`, for each selected weekday, schedule the next
  `REMINDER_WEEKS_AHEAD` (e.g. 8) occurrences as individual one-shot
  triggers with unique ids (`habit_reminder_{habitId}_day_{dayOfWeek}_{n}`),
  and update `cancelHabitReminders` to cancel all of them. This avoids a
  runtime reschedule-on-fire step that would otherwise depend on Root
  Cause 1's DB connection.
- Existing installs already have old-style triggers scheduled — code
  changes alone won't retroactively fix them; re-run
  `cancelHabitReminders` + `syncHabitReminder` for every habit with a
  reminder once (e.g. via a one-time migration flag on app start).

### 2. Collapse to one DB connection/gate

- Audit `db/habits.ts`'s `db` export. Confirm it is the _same_ singleton
  connection exported by `db/database.ts`, gated by the _same_ `dbReady`
  promise — not a second connection opened independently or bound to a
  mounted `SQLiteProvider`.
- If `db/habits.ts` currently opens its own connection or depends on React
  context, refactor it to import the shared connection from `db/database.ts`
  instead. There should be exactly one `dbReady` in the whole app.
- Remove the now-redundant `require('@/db/database')` / `await dbReady` gate
  duplicated inside `notifeeBackground.js` once `db/habits.ts` guarantees
  readiness itself — or keep a single explicit gate at the top of
  `onBackgroundEvent`, but make sure it's the _one_ gate every DB-touching
  module actually depends on.

### 3. Make `mark_completed` observable when it fails

- In `handleMarkCompletedAction`, replace the swallowed
  `console.warn('Failed to handle mark_completed action:', e)` with a write
  to a persistent log (a DB table row or file), since `console.warn` output
  from a killed-and-restarted headless process is unrecoverable. This is
  needed to confirm the fix, not just to hope it worked.

### 4. Fix `reschedule` — no direct navigation from the background handler

- Do not call `router.navigate(...)` inside `notifeeBackground.js`.
- On `reschedule` ACTION_PRESS: cancel the notification (keep this part),
  and instead persist a pending-intent record (e.g. `{ habitId, action:
'reschedule' }`) to the DB or a lightweight key-value store.
- In `app/_layout.tsx`, extend the existing cold-start check (the same
  pattern already used for `notifee.getInitialNotification()` /
  `pressAction.id === 'default'`) to also check for a pending reschedule
  record on mount, consume it, and navigate then — when a real
  `NavigationContainer` actually exists.

### 5. Correct the test methodology

- Do not validate "killed app" behavior by swiping away while a focus
  session is active — the foreground service keeps the process alive and
  will produce false positives.
- Validation test: schedule a habit reminder only (no active focus
  session), force-stop the app from Android's App Info screen (not just
  swipe from recents) to guarantee a true cold state, then wait for the
  reminder trigger to actually fire and press `Mark Completed` /
  `Reschedule` on it.

## Acceptance criteria

- [ ] Habit reminders are scheduled as one-shot exact alarms and
      self-reschedule on fire; no `repeatFrequency` is used for reminders.
- [ ] After a force-stop test, the reminder notification itself appears at
      the scheduled time without the app being opened first.
- [ ] `db/habits.ts` and `db/database.ts` share one connection and one
      `dbReady` promise; no independent/React-bound connection remains.
- [ ] After the same force-stop test, pressing `Mark Completed` on the
      reminder notification writes the completion to the DB and the
      persistent log confirms which step ran.
- [ ] After the same test, pressing `Reschedule` cancels the notification
      immediately and, on next app open, navigates to the correct habit
      detail screen with `reschedule=1`.
- [ ] Pause/Resume/Stop continue to work unchanged (regression check).

## Out of scope

- The full-screen, lock-screen-ringing alarm feature — confirmed removed;
  not part of this fix.
- OEM battery-optimization / autostart whitelisting (Xiaomi/Oppo/Vivo) —
  separate, user-facing onboarding concern, not a code fix.
- Exact-alarm permission handling — already implemented in `syncHabitReminder`.
