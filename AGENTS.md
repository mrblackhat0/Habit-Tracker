# AGENTS.md — Habit-Tracker-v2

## 🔔 Termux Notification Requirement
- **Rule**: Send a system notification using the Termux API (`termux-notification`) with a fixed ID (`--id "opencode"`) in these cases ONLY:
  1. Upon task completion (always)
  2. Before asking for permission to use any tool or bash command that is **not allowed** (`permission: ask`) — send the notification *before* the permission request. Do **not** send notifications for actions whose permissions are already `allow` locally or globally (per `opencode.json`).
- **Command**:
  ```bash
  termux-notification --id "opencode" --title "Opencode Assistant" --content "<Message details>"
  ```

## Stack
- Expo SDK 57 / React 19.2 / RN 0.86 / expo-router v57 (file-based routing, `typedRoutes: true`) / NativeWind + Tailwind 3.4 / expo-sqlite WAL / Zustand / Notifee 9.1 / Reanimated 4.5.
- Entry: `index.js` → `expo-router/entry`. Root layout `app/_layout.tsx` wraps `SQLiteProvider` + `initDb()`.

## Commands
```bash
npm run start          # expo start
npm run android        # expo run:android (requires prebuild)
npm run ios            # expo run:ios
npm run prebuild       # expo prebuild — regenerates android/ios
npm run lint           # eslint + prettier check (no fix)
npm run format         # eslint --fix + prettier --write
npx tsc --noEmit       # typecheck (strict: true)
npx expo export -p android --no-bytecode  # production bundle check
```
- No test runner configured. Verification is `tsc --noEmit` + `npm run lint` + bundle export.

## Path Alias & TS
- `@/*` → `./*` (see `tsconfig.json:6`). `expo-router` + `tsconfigPaths` enabled, so prefer `@/` imports.
- `extends: expo/tsconfig.base`, `strict: true`. Includes `.expo/types`, `expo-env.d.ts`, `nativewind-env.d.ts`.

## Routing & Structure
- `app/(tabs)/` — Today (`index.tsx`), Analytics, Calendar, Settings. `app/habit/[id].tsx` + `app/habit/[id]/goal.tsx`, `app/addHabit.tsx`, `app/onboarding.tsx`, `app/archived.tsx`.
- `db/` — `schema.ts` (`initDb`), `habits.ts`, `focus.ts` (active_session singleton, daily_totals). `store/` — `habitStore.ts`, `focusStore.ts`, `store.ts` (onboarding hydration). `services/` — `notificationService.ts`, `notifeeBackground.js` (must stay imported in `_layout.tsx` before use), `weeklyOverview.ts`.
- `components/` — 29 UI components (FlashList, Reanimated, SVG rings).
- `plugins/with-notification-icon.js` — `withDangerousMod` copies `assets/notification-icon/android/mipmap-*/ic_notification.png` → `android/app/src/main/res/{mipmap,drawable}-*/`. Requires prebuild to take effect.

## Styling
- `global.css` (`@tailwind base/components/utilities`) injected via `babel.config.js` (`nativewind/babel`, `jsxImportSource: nativewind`) and `metro.config.js` `withNativeWind(config, {input: './global.css'})`.
- `tailwind.config.js` content: `app/**/*.{js,ts,tsx}` + `components/**/*.{js,ts,tsx}` only — styles outside those globs are purged. Theme colors: `background #0D0D12`, `primary #6366F1`, `heatmap level0-4`.
- `prettier-plugin-tailwindcss` + `tailwindAttributes: ['className']`. `printWidth 100`, `singleQuote true`.

## Metro & Babel Gotchas
- `metro.config.js:14-24` — blockList only `.db/.sqlite` + iOS pods, NOT whole `node_modules` (previous breakage: `expo-router/entry` not found). `watcher.useWatchman: false`, `healthCheck.enabled: true`, `ignoredPaths: [node_modules]`.
- `babel.config.js:5` — `react-native-worklets/plugin` must stay first in plugins array.

## Database
- WAL mode, FKs on. Tables: `habits`, `habit_logs` (UNIQUE habitId+date), `daily_totals`, `active_session` (id=1 singleton, mode timer/stopwatch, status running/paused), `app_settings`. ALTER TABLE migrations use try/catch — don't replace with unconditional DDL.
- Schema columns added via migrations: `reminder`, `strictMode`, `archived` on `habits`. If you add a new column, follow the same try/catch `ALTER TABLE` pattern in `db/schema.ts`.
- `app.json` plugin `expo-sqlite` required.

## Notifications & Permissions (`app.json:57-68`)
- Android permissions: `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE*`, `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`. Changing them requires prebuild.
- `userInterfaceStyle: dark`, `orientation: portrait`, scheme `habit-tracker`.

## EAS
- `eas.json` — `development`/`preview` → `apk` internal, `production` autoIncrement. `projectId 56244fad-ca8c-464c-8ccf-e07da9123992`. `cli >=22.0.0`, `appVersionSource: remote`.

## Conventions
- ESLint: `eslint-config-expo/flat`, ignores `dist/*`, disables `react-hooks/immutability|set-state-in-effect|purity`.
- No `opencode.json`, no CI workflows, no pre-commit hooks. No `.cursor`/`.github` instruction files to reconcile.
- **Notification sync rule**: Any code that inserts/updates habits via raw SQL (bypassing `habitStore.addHabit`/`updateHabit`) must also call `syncHabitReminder()` from `notificationService.ts` for habits with `reminder: true` and a non-null `time`. The import flow (`settings.tsx`) is the primary example.
