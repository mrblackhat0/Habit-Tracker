import '@/global.css';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router, Stack, ThemeProvider, useSegments } from 'expo-router';
import { StatusBar, View } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { Colors, CustomDarkTheme } from '@/constants/Colors';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { enableFreeze } from 'react-native-screens';
import { dbReady } from '@/db/database';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { AppState } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import { useFocusStore } from '@/store/focusStore';
import { useStore } from '@/store/store';
import { useHabitStore } from '@/store/habitStore';
import { handleMarkCompletedAction, handleStartTimerAction, initNotificationChannels } from '@/services/notificationService';
import { completeTimerFromTrigger } from '@/services/sessionActions';
import { getHabitById } from '@/db/habits';
import BootScreen from '@/components/BootScreen';

enableFreeze(false);
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});
SplashScreen.preventAutoHideAsync();

function NavigationGate() {
  const segments = useSegments();
  const hydrated = useStore((s) => s._hydrated);
  const hasCompletedOnboarding = useStore((s) => s.hasCompletedOnboarding);

  useEffect(() => {
    if (!hydrated) return;
    const inOnboarding = segments[0] === 'onboarding';
    if (!hasCompletedOnboarding && !inOnboarding) {
      router.replace('/onboarding');
    }
  }, [hydrated, hasCompletedOnboarding, segments]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
  });

  const hydrated = useStore((s) => s._hydrated);
  const hasCompletedOnboarding = useStore((s) => s.hasCompletedOnboarding);
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    SplashScreen.hideAsync().catch((e) => { if (__DEV__) console.warn('[Startup] SplashScreen', e); });
  }, []);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(Colors.background).catch((e) => console.warn('[Startup] SystemUI', e));
    if ((fontsLoaded || fontError) && hydrated) {
      setAppReady(true);
    }
    notifee.getInitialNotification().then(async (initial) => {
      const actionId = initial?.pressAction?.id;
      const habitId = initial?.notification?.data?.habitId;
      if (actionId === 'reschedule' && habitId) {
        if (__DEV__) console.log('[InitialNotification] reschedule action, habitId:', habitId);
        router.navigate({
          pathname: '/habit/[id]',
          params: { id: habitId.toString(), reschedule: '1' },
        });
      } else if (actionId === 'default' && habitId) {
        if (__DEV__) console.log('[InitialNotification] default press, habitId:', habitId);
        try {
          const habit = await getHabitById(Number(habitId));
          if (habit && habit.progressType !== 'check') {
            // build stack: home -> details -> goal so back goes goal->details->home
            router.replace('/(tabs)');
            router.navigate({ pathname: '/habit/[id]/goal', params: { id: habitId.toString() } });
          } else {
            router.navigate({ pathname: '/habit/[id]', params: { id: habitId.toString() } });
          }
        } catch (e) {
          if (__DEV__) console.warn('[Startup] getInitialNotification habit lookup', e);
          router.navigate({ pathname: '/habit/[id]', params: { id: habitId.toString() } });
        }
      }
    });
  }, [fontsLoaded, fontError, hydrated]);

  useEffect(() => {
    // Sequenced startup: nothing queries before the single connection is ready.
    dbReady
      .then(() => useStore.getState().hydrate())
      .then(() => useFocusStore.getState().loadActiveSession())
      .catch((e) => console.warn('[Startup] dbReady chain', e));
    // Warm notification channels in background so first timer start is instant
    initNotificationChannels().catch((e) => console.warn('[Startup] initNotificationChannels', e));

    // Background timer watchdog — fires even when app is backgrounded via foreground service
    // (JS timers are throttled in background, so we poll every 1s; trigger handles exact alarm)
    const bgInterval = setInterval(() => {
      try {
        const { getActiveSession } = require('@/db/focus');
        const s: any = getActiveSession();
        if (!s || s.mode !== 'timer' || !s.targetGoalMs) return;
        let elapsed = s.accumulatedMs;
        if (s.status === 'running') elapsed += Date.now() - s.startedAt;
        if (elapsed >= s.targetGoalMs) {
          // Timer hit zero while backgrounded — complete same as foreground
          useFocusStore.getState().loadActiveSession();
        }
      } catch (e) { console.warn('[Startup] bgInterval', e); }
    }, 1000);

    // Reactive AppState listener (§5) - sync store when returning to foreground
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        useFocusStore.getState().loadActiveSession();
        useHabitStore.getState().loadHabits();
      }
    });

    // Notifee notification action events (Pause, Resume, Stop, Mark Completed, Reschedule, Start, +1)
    const unsubscribeNotifee = notifee.onForegroundEvent(({ type, detail }) => {
      if (
        type === EventType.DELIVERED &&
        (detail.notification as any)?.data?.type === 'timer_complete'
      ) {
        if (__DEV__) console.log('[Foreground] delivered timer_complete');
        completeTimerFromTrigger().then(() => {
          useFocusStore.getState().loadActiveSession();
        });
        return;
      }
      if (type === EventType.ACTION_PRESS && detail.pressAction?.id) {
        const actionId = detail.pressAction.id;
        if (actionId === 'pause') {
          if (__DEV__) console.log('[Foreground] action: pause');
          useFocusStore.getState().pauseSession();
        } else if (actionId === 'resume') {
          if (__DEV__) console.log('[Foreground] action: resume');
          useFocusStore.getState().resumeSession();
        } else if (actionId === 'stop') {
          if (__DEV__) console.log('[Foreground] action: stop');
          useFocusStore.getState().stopSession();
        } else if (actionId === 'mark_completed') {
          const habitId = detail.notification?.data?.habitId;
          if (__DEV__) console.log('[Foreground] action: mark_completed, habitId:', habitId);
          if (habitId) {
            handleMarkCompletedAction(
              parseInt(habitId as string, 10),
              detail.notification?.id
            ).then(() => {
              useHabitStore.getState().loadHabits();
            });
          }
        } else if (actionId === 'reschedule') {
          const habitId = detail.notification?.data?.habitId;
          if (__DEV__) console.log('[Foreground] action: reschedule, habitId:', habitId);
          if (habitId) {
            if (detail.notification?.id)
              notifee.cancelNotification(detail.notification.id).catch(() => {});
            router.navigate({
              pathname: '/habit/[id]',
              params: { id: String(habitId), reschedule: '1' },
            });
          }
        } else if (actionId === 'start_timer') {
          const habitId = detail.notification?.data?.habitId;
          if (__DEV__) console.log('[Foreground] action: start_timer, habitId:', habitId);
          if (habitId) {
            handleStartTimerAction(parseInt(habitId as string, 10), detail.notification?.id).then(
              () => {
                useFocusStore.getState().loadActiveSession();
                useHabitStore.getState().loadHabits();
              }
            );
          }
        }
      } else if (type === EventType.PRESS && detail.pressAction?.id === 'default') {
        const habitId = detail.notification?.data?.habitId;
        if (__DEV__) console.log('[Foreground] default press, habitId:', habitId);
        if (habitId) {
          (async () => {
            try {
              const habit = await getHabitById(Number(habitId));
              if (habit && habit.progressType !== 'check') {
                router.navigate({
                  pathname: '/habit/[id]/goal',
                  params: { id: habitId.toString() },
                });
              } else {
                router.navigate({ pathname: '/habit/[id]', params: { id: habitId.toString() } });
              }
            } catch (e) {
              if (__DEV__) console.warn('[Foreground] default press habit lookup', e);
              router.navigate({ pathname: '/habit/[id]', params: { id: habitId.toString() } });
            }
          })();
        }
      }
    });

    return () => {
      clearInterval(bgInterval);
      subscription.remove();
      unsubscribeNotifee();
    };
  }, []);

  if (!appReady || !hydrated) return <BootScreen />; // splash stays visible, nothing renders underneath

  return (
    <SafeAreaProvider>
      <ThemeProvider value={CustomDarkTheme}>
        <StatusBar translucent barStyle="light-content" backgroundColor={Colors.background} />
        <NavigationGate />
        <Stack
          initialRouteName={hasCompletedOnboarding ? '(tabs)' : 'onboarding'}
          screenOptions={{
            headerStyle: { backgroundColor: Colors.background },
            headerTintColor: Colors.text,
            contentStyle: { backgroundColor: Colors.background },
            animation: 'slide_from_right',
          }}>
          <Stack.Screen
            name="onboarding"
            options={{ headerShown: false, gestureEnabled: false, animation: 'none' }}
          />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="addHabit" options={{ headerShown: true }} />
          <Stack.Screen name="habit/[id]" options={{ headerShown: true }} />
          <Stack.Screen
            name="habit/[id]/goal"
            options={{ headerShown: true, headerBackTitle: 'Back' }}
          />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
