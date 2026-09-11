import { create } from 'zustand';
import * as Haptics from 'expo-haptics';
import { db } from '@/db/habits';

export type StartOfWeek = 'Sun' | 'Mon';

export interface AppState {
  darkMode?: boolean;
  userName: string;
  profileImageUri: string | null;
  hapticsEnabled: boolean;
  startOfWeek: StartOfWeek;
  weeklyOverviewEnabled: boolean; // Sunday 07:00 weekly summary
  focusNotificationsEnabled: boolean; // timer/stopwatch foreground service
  hasCompletedOnboarding: boolean;
  _hydrated: boolean;
  setUserName: (name: string) => void;
  setProfileImageUri: (uri: string | null) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setStartOfWeek: (day: StartOfWeek) => void;
  setWeeklyOverview: (enabled: boolean) => void;
  setFocusNotifications: (enabled: boolean) => void;
  completeOnboarding: (name: string, profileUri?: string | null) => Promise<void>;
  resetOnboarding: () => Promise<void>;
  hydrate: () => Promise<void>;
  triggerHaptic: (style?: 'light' | 'medium' | 'heavy') => Promise<void>;
}

async function persistSetting(key: string, value: string) {
  try {
    await db.runAsync(
      `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value]
    );
  } catch {}
}

async function loadSetting(key: string): Promise<string | null> {
  try {
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM app_settings WHERE key = ?`,
      [key]
    );
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export const useStore = create<AppState>((set, get) => ({
  darkMode: true,
  userName: 'Rebel',
  profileImageUri: null,
  hapticsEnabled: true,
  startOfWeek: 'Sun',
  weeklyOverviewEnabled: false,
  focusNotificationsEnabled: true,
  hasCompletedOnboarding: false,
  _hydrated: false,

  setUserName: (name: string) => {
    const clean = name.trim().slice(0, 24) || 'Rebel';
    set({ userName: clean });
    persistSetting('userName', clean);
  },

  setProfileImageUri: (uri: string | null) => {
    set({ profileImageUri: uri });
    if (uri) persistSetting('profileImageUri', uri);
    else {
      // remove key
      import('@/db/habits').then(({ db }) =>
        db.runAsync(`DELETE FROM app_settings WHERE key = ?`, ['profileImageUri']).catch(() => {})
      );
    }
  },

  setHapticsEnabled: (enabled: boolean) => {
    set({ hapticsEnabled: enabled });
    persistSetting('hapticsEnabled', enabled ? '1' : '0');
    if (enabled) Haptics.selectionAsync().catch(() => {});
  },

  setStartOfWeek: (day: StartOfWeek) => {
    set({ startOfWeek: day });
    persistSetting('startOfWeek', day);
  },

  setWeeklyOverview: (enabled: boolean) => {
    set({ weeklyOverviewEnabled: enabled });
    persistSetting('weeklyOverviewEnabled', enabled ? '1' : '0');
    import('@/services/weeklyOverview')
      .then(({ scheduleWeeklyOverview }) => scheduleWeeklyOverview(enabled))
      .catch(() => {});
  },

  setFocusNotifications: (enabled: boolean) => {
    set({ focusNotificationsEnabled: enabled });
    persistSetting('focusNotificationsEnabled', enabled ? '1' : '0');
    if (!enabled) {
      // cancel any ongoing focus notification
      import('@notifee/react-native')
        .then(({ default: notifee }) => {
          notifee.cancelAllNotifications().catch(() => {});
          // stop foreground service if any
          (notifee as any).stopForegroundService?.().catch(() => {});
        })
        .catch(() => {});
    } else {
      // re-show if session is active — fetch fresh from DB (covers headless) then update
      (async () => {
        try {
          const { getActiveSession } = await import('@/db/focus');
          const { getHabitById } = await import('@/db/habits');
          const { updateSessionNotification } = await import('@/services/notificationService');
          const s = getActiveSession() ?? (await import('@/store/focusStore')).useFocusStore.getState().activeSession;
          if (!s) return;
          const h: any = await getHabitById(s.habitId);
          if (h) await updateSessionNotification(s, h);
        } catch {}
      })();
    }
  },

  completeOnboarding: async (name: string, profileUri?: string | null) => {
    const clean = name.trim().slice(0, 24);
    set({
      userName: clean,
      profileImageUri: profileUri !== undefined ? profileUri : get().profileImageUri,
      hasCompletedOnboarding: true,
    });
    await persistSetting('userName', clean);
    if (profileUri !== undefined) {
      if (profileUri) {
        await persistSetting('profileImageUri', profileUri);
      } else {
        const { db } = await import('@/db/habits');
        await db
          .runAsync(`DELETE FROM app_settings WHERE key = ?`, ['profileImageUri'])
          .catch(() => {});
      }
    }
    await persistSetting('hasCompletedOnboarding', '1');
  },

  resetOnboarding: async () => {
    set({ hasCompletedOnboarding: false });
    await persistSetting('hasCompletedOnboarding', '0');
  },

  hydrate: async () => {
    if (get()._hydrated) return;
    try {
      const [userName, haptics, sow, weeklyEnabled, focusNotif, profileUri, onboarded] =
        await Promise.all([
          loadSetting('userName'),
          loadSetting('hapticsEnabled'),
          loadSetting('startOfWeek'),
          loadSetting('weeklyOverviewEnabled'),
          loadSetting('focusNotificationsEnabled'),
          loadSetting('profileImageUri'),
          loadSetting('hasCompletedOnboarding'),
        ]);
      // migration: fallback to old dailyReminderEnabled if weekly key missing
      let weekly = weeklyEnabled === '1';
      if (weeklyEnabled == null) {
        const legacy = await loadSetting('dailyReminderEnabled');
        if (legacy === '1') weekly = true;
      }
      set({
        userName: userName ?? 'Rebel',
        profileImageUri: profileUri ?? null,
        hapticsEnabled: haptics == null ? true : haptics === '1',
        startOfWeek: sow === 'Mon' || sow === 'Sun' ? sow : 'Sun',
        weeklyOverviewEnabled: weekly,
        focusNotificationsEnabled: focusNotif == null ? true : focusNotif === '1',
        hasCompletedOnboarding: onboarded === '1',
        _hydrated: true,
      });
    } catch {
      set({ _hydrated: true });
    }
  },

  triggerHaptic: async (style = 'light') => {
    if (!get().hapticsEnabled) return;
    try {
      if (style === 'heavy') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      else if (style === 'medium') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      else await Haptics.selectionAsync();
    } catch {}
  },
}));

// auto-hydrate on import (non-blocking)
useStore.getState().hydrate();
