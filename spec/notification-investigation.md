# Notification System Investigation

## 1. `useFocusStore.loadActiveSession()`

**File:** `store/focusStore.ts:42-53`

```typescript
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
```

It does NOT complete/finish sessions itself. It reads from DB via `getActiveSession()`, sets store state, then calls `checkStaleSession()`. The completion logic lives in `checkStaleSession()`:

**File:** `store/focusStore.ts:148-188`

```typescript
checkStaleSession: () => {
    const current = getActiveSession();
    // ...
    if (current.mode === 'timer' && current.targetGoalMs && current.targetGoalMs > 0) {
      let currentElapsedMs = current.accumulatedMs;
      if (current.status === 'running') {
        currentElapsedMs += Date.now() - current.startedAt;
      }
      if (currentElapsedMs >= current.targetGoalMs) {
        get().stopSession('completed');   // <-- THIS completes the session
        return;
      }
    }
    // ... stale prompt logic for paused sessions
  },
```

**Verdict:** `loadActiveSession` -> reads DB -> `checkStaleSession` -> if elapsed >= target, calls `stopSession('completed')`. So yes, it CAN complete a session as a side-effect.

---

## 2. Timer completion chain

The chain is: **`bgInterval` watchdog** OR **`TRIGGER_NOTIFICATION_CREATED` background event** -> `loadActiveSession` -> `checkStaleSession` -> `stopSession('completed')`.

**Path A — bgInterval watchdog (foreground/background via setInterval):**

- `app/_layout.tsx:155-167` — polls every 1s
- If `elapsed >= targetGoalMs` -> calls `useFocusStore.getState().loadActiveSession()`
- `loadActiveSession` -> `checkStaleSession` -> `stopSession('completed')`
- `stopSession` calls `resolveActiveSession()` (DB) + `stopSessionNotification()` (shows final notification)

**Path B — TRIGGER_NOTIFICATION_CREATED (background event):**

- `services/notifeeBackground.js:29-49` — fires when notifee delivers the scheduled trigger
- Calls `resolveActiveSession()` directly (NOT `stopSession`)
- Does NOT call `stopSessionNotification()` — the trigger notification IS the final one

**Path C — TRIGGER_NOTIFICATION_CREATED (foreground event):**

- `app/_layout.tsx:179-185` — fires when trigger fires while app is in foreground
- Calls `loadActiveSession()` -> `checkStaleSession` -> `stopSession('completed')`
- `stopSession` shows final notification via `stopSessionNotification`

**The trigger itself is created by:** `notificationService.ts:246-268` (`scheduleTimerCompletion`), called from:

- `focusStore.ts:68` — on `startSession`
- `focusStore.ts:102` — on `resumeSession`

---

## 3. `notifee.onBackgroundEvent` full handler

**File:** `services/notifeeBackground.js:21-146` — registered at module top-level (line 21).

### Actions handled:

| actionId | Lines | What it does |
|----------|-------|-------------|
| (none) `TRIGGER_NOTIFICATION_CREATED` | 29-49 | Timer completion: calls `resolveActiveSession()` (DB only) |
| `default` (PRESS) | 50-70 | Opens app, navigates to habit detail/goal |
| `pause` | 76-82 | Pauses session, updates notification |
| `resume` | 83-89 | Resumes session, updates notification |
| `stop` | 90-105 | Resolves session, shows stop notification |
| `mark_completed` | 106-111 | Calls `handleMarkCompletedAction` |
| `reschedule` | 112-122 | Cancels notification, calls `router.navigate` directly |
| `start_timer` | 136-141 | Calls `handleStartTimerAction` |

### For `reschedule` specifically (lines 112-122):

```javascript
} else if (actionId === 'reschedule') {
      const habitId = detail.notification?.data?.habitId;
      console.log('[Background] action: reschedule, habitId:', habitId);
      if (habitId) {
        if (detail.notification?.id)
          notifee.cancelNotification(detail.notification.id).catch(() => {});
        router.navigate({
          pathname: '/habit/[id]',
          params: { id: String(habitId), reschedule: '1' },
        });
      }
```

**It does NOT write `pending_reschedule_habit_id` to `app_settings`.** The DB-based approach is commented out (lines 123-135). It calls `router.navigate` directly from the background handler.

---

## 4. `notifee.getInitialNotification()`

**File:** `app/_layout.tsx:64-91`

```typescript
notifee.getInitialNotification().then(async (initial) => {
      const actionId = initial?.pressAction?.id;
      const habitId = initial?.notification?.data?.habitId;
      if (actionId === 'reschedule' && habitId) {
        console.log('[InitialNotification] reschedule action, habitId:', habitId);
        router.navigate({
          pathname: '/habit/[id]',
          params: { id: habitId.toString(), reschedule: '1' },
        });
      } else if (actionId === 'default' && habitId) {
        console.log('[InitialNotification] default press, habitId:', habitId);
        // ... navigates to habit detail or goal
      }
    });
```

For `pressAction.id === 'reschedule'`: navigates directly to `/habit/[id]` with `reschedule: '1'` — does NOT go through `setRescheduleHabitId`.

---

## 5. Consumers of `rescheduleHabitId` state and `reschedule: '1'` param

### Consumer 1 — `rescheduleHabitId` state:

- **Set:** `_layout.tsx:119` (`setRescheduleHabitId(row.value)`) — from `pending_reschedule_habit_id` DB row
- **Consumed:** `_layout.tsx:94-101` — **COMMENTED OUT** (`// useEffect(() => {`)

```typescript
// useEffect(() => {
//   if (!appReady || !rescheduleHabitId) return;
//   router.navigate({
//     pathname: '/habit/[id]',
//     params: { id: rescheduleHabitId, reschedule: '1' },
//   });
//   setRescheduleHabitId(null);
// }, [appReady, rescheduleHabitId]);
```

### Consumer 2 — `reschedule: '1'` route param:

- **File:** `app/habit/[id].tsx:28,66-77`

```typescript
const { id, reschedule } = useLocalSearchParams<{ id: string; reschedule?: string }>();

useEffect(() => {
    if (reschedule === '1' && habit) {
      requestNotificationPermission().catch(() => {});
      const t = setTimeout(() => {
        setShowTimePicker(true);
        router.setParams({ reschedule: undefined } as any);
      }, 350);
      return () => clearTimeout(t);
    }
  }, [reschedule, habit?.id]);
```

### Redundancy:

`rescheduleHabitId` state consumer is **dead code** (commented out). It was the deferred navigation layer that waited for `appReady`. Now only the `getInitialNotification` path and the foreground event path navigate directly, relying on the `[id].tsx` useEffect to open the time picker. The `setRescheduleHabitId` call at line 119 sets state that nothing reads.

---

## 6. Circular imports

### `@/db/habits` imports:

**File:** `db/habits.ts:1-9`

```typescript
import { parseOccurrence, isScheduledDay, getTodayDateStr, getPrevDateStr, getNextScheduledDateStr } from '../utils/dates';
import { db } from './database';
export { db };
```

Imports only from `utils/dates` and `db/database`. **No circular imports.** Does NOT import from stores, notificationService, or _layout.

### `@/services/notificationService` imports:

**File:** `services/notificationService.ts:1-13`

```typescript
import notifee, { AndroidImportance, TriggerType, RepeatFrequency, TimestampTrigger, AlarmType } from '@notifee/react-native';
import { ActiveSession, seedDailyTotal, setDailyTotal } from '@/db/focus';
import { Habit, getLogsForHabit, getHabitById, logCompletion, db } from '@/db/habits';
import { Colors } from '@/constants/Colors';
import { getTodayDateStr } from '@/utils/dates';
import { formatDuration } from '@/utils/utils';
import { useStore } from '@/store/store';
```

Imports from `@notifee/react-native`, `@/db/focus`, `@/db/habits`, `@/constants/Colors`, `@/utils/dates`, `@/utils/utils`, `@/store/store`. **No circular imports back to _layout or focusStore.**

### `@/db/focus` imports:

**File:** `db/focus.ts:1`

```typescript
import { db, logCompletion } from './habits';
```

Only imports from `./habits`.

**No circular imports detected** in the db/habits <-> db/focus <-> services/notificationService chain. However, `notificationService.ts` imports `useStore` from `@/store/store` (the zustand store), which is a cross-layer dependency (service -> store).

---

## 7. `syncHabitReminder()` signature and error handling

**File:** `services/notificationService.ts:449-567`

```typescript
export async function syncHabitReminder(
  habitId: number,
  habitName: string,
  timeStr: string | null,
  occurrence: string,
  reminderEnabled: boolean = true
)
```

**Error handling:** No throw, no return value, no failure signal. Returns `undefined` (implicit). Silent early returns on bad input (lines 458, 471, 474, 487). Individual trigger creation failures are caught with `console.warn` (line 562-564) and skipped. Callers use `.catch(() => {})` (e.g. `_layout.tsx:135`, `habitStore.ts:59`).

### `reminder_migration_v1_done` written at:

- `app/_layout.tsx:141-143` — the one-time migration in `dbReady` chain
- **No other writes found** — only in `_layout.tsx`.

---

## 8. `getActiveSession()` in `@/db/focus`

**File:** `db/focus.ts:77-95`

```typescript
export function getActiveSession(): ActiveSession | null {
  ensureFocusDb();
  try {
    const row = db.getFirstSync<any>(`SELECT * FROM active_session WHERE id = 1`);
    if (!row) return null;
    return {
      id: 1,
      habitId: row.habitId,
      mode: row.mode,
      status: row.status,
      startedAt: row.startedAt,
      accumulatedMs: row.accumulatedMs,
      pausedAt: row.pausedAt ?? null,
      targetGoalMs: row.targetGoalMs ?? null,
    };
  } catch {
    return null;
  }
}
```

**Sync** (`db.getFirstSync`). Queries `SELECT * FROM active_session WHERE id = 1` (singleton row, id always 1).

---

## 9. Grep results

### `TRIGGER_NOTIFICATION_CREATED`:

| File | Line |
|------|------|
| `services/notifeeBackground.js` | 30 |
| `app/_layout.tsx` | 180 |

### `timer_complete`:

| File | Line | Context |
|------|------|---------|
| `services/notifeeBackground.js` | 31 | data.type check |
| `services/notifeeBackground.js` | 33 | console.log |
| `services/notifeeBackground.js` | 47 | console.warn |
| `services/notificationService.ts` | 253 | data.type in trigger payload |
| `services/notificationService.ts` | 279 | cancelTriggerNotification |
| `services/notificationService.ts` | 287 | cancelNotification |
| `app/_layout.tsx` | 181 | data.type check |
| `app/_layout.tsx` | 183 | console.log |

### `bgInterval`:

| File | Line |
|------|------|
| `app/_layout.tsx` | 155 | `const bgInterval = setInterval(...)` |
| `app/_layout.tsx` | 257 | `clearInterval(bgInterval)` |

### `app_settings`:

| File | Line | Context |
|------|------|---------|
| `db/schema.ts` | 56 | CREATE TABLE |
| `store/store.ts` | 33 | persistSetting INSERT |
| `store/store.ts` | 42 | loadSetting SELECT |
| `store/store.ts` | 75 | DELETE profileImageUri |
| `store/store.ts` | 145 | DELETE profileImageUri |
| `app/_layout.tsx` | 113 | SELECT pending_reschedule |
| `app/_layout.tsx` | 118 | DELETE pending_reschedule |
| `app/_layout.tsx` | 126 | SELECT migration flag |
| `app/_layout.tsx` | 141 | INSERT migration flag |
| `services/notifeeBackground.js` | 131 | commented out INSERT |
| `services/notificationService.ts` | 24 | SELECT focusNotificationsEnabled |
| `services/notificationService.ts` | 611 | SELECT notifee_mark_completed_last |
| `services/notificationService.ts` | 624 | INSERT notifee_mark_completed_last |
| `app/(tabs)/settings.tsx` | 164 | SELECT * for export |
| `app/(tabs)/settings.tsx` | 401 | INSERT for import |

---

## 10. Every `actions:` array with pressAction objects

### 1. Foreground timer running — `updateSessionNotification`

**File:** `services/notificationService.ts:160-169`

```typescript
actions: [
  { title: 'Pause', pressAction: { id: 'pause' } },
  { title: 'Stop', pressAction: { id: 'stop' } },
]
```

No `launchActivity`.

### 2. Foreground timer paused — `updateSessionNotification`

**File:** `services/notificationService.ts:195-204`

```typescript
actions: [
  { title: 'Resume', pressAction: { id: 'resume' } },
  { title: 'Stop', pressAction: { id: 'stop' } },
]
```

No `launchActivity`.

### 3. Timer completion trigger — `scheduleTimerCompletion`

**File:** `services/notificationService.ts:246-268`

No actions array defined — no action buttons on completion notification.

### 4. Stop/session-complete notification — `stopSessionNotification`

**File:** `services/notificationService.ts:314-329`

No actions array defined — no action buttons.

### 5. Habit reminder — `getReminderActions`

**File:** `services/notificationService.ts:425-447`

```typescript
// For duration habits:
{ title: 'Start', pressAction: { id: 'start_timer' } }                    // NO launchActivity
{ title: 'Mark Completed', pressAction: { id: 'mark_completed' } }        // NO launchActivity
{ title: 'Reschedule', pressAction: { id: 'reschedule', launchActivity: 'default' } }  // HAS launchActivity
```

### 6. Habit reminder (fallback when habit not found)

**File:** `services/notificationService.ts:504-507`

```typescript
{ title: 'Mark Completed', pressAction: { id: 'mark_completed' } }        // NO launchActivity
{ title: 'Reschedule', pressAction: { id: 'reschedule', launchActivity: 'default' } }  // HAS launchActivity
```

### 7. Reminder trigger notification — where actions are passed

**File:** `services/notificationService.ts:543-561`

```typescript
android: {
  channelId: REMINDER_CHANNEL_ID,
  smallIcon: 'ic_launcher',
  color: Colors.primary,
  showTimestamp: true,
  pressAction: { id: 'default' },
  actions,   // from getReminderActions or fallback
}
```

### Summary

Only the `reschedule` action button has `launchActivity: 'default'`. All other action buttons (Pause, Stop, Resume, Start, Mark Completed) do NOT have `launchActivity`. The `pressAction: { id: 'default' }` on the notification body itself also does NOT have `launchActivity` — it relies on notifee's default behavior to open the app.
