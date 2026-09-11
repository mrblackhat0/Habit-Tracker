import '@/global.css';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router, Stack, ThemeProvider, useSegments } from 'expo-router';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { Colors, CustomDarkTheme } from '@/constants/Colors';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { enableFreeze } from 'react-native-screens';
import { initDb } from '@/db/schema';
import { SQLiteProvider } from 'expo-sqlite';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { AppState } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import { useFocusStore } from '@/store/focusStore';
import { useStore } from '@/store/store';
import '@/services/notifeeBackground.js';

enableFreeze(false);
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});
SplashScreen.preventAutoHideAsync();

import { useHabitStore } from '@/store/habitStore';
import {
  handleMarkCompletedAction,
  handleRescheduleAction,
  handleStartTimerAction,
  handlePlusOneAction,
} from '@/services/notificationService';

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
    SystemUI.setBackgroundColorAsync(Colors.background).catch(() => {});
    if ((fontsLoaded || fontError) && hydrated) {
      setAppReady(true);
      if (hasCompletedOnboarding) {
        SplashScreen.hideAsync().catch(() => {});
      } else {
        setTimeout(() => {
          SplashScreen.hideAsync().catch(() => {});
        }, 1500);
      }
    }
    notifee.getInitialNotification().then(async (initial) => {
      if (initial?.pressAction?.id === 'default') {
        const habitId = initial.notification.data?.habitId;
        if (habitId) {
          try {
            const { getHabitById } = await import('@/db/habits');
            const habit = await getHabitById(Number(habitId));
            if (habit && habit.progressType !== 'check') {
              // build stack: home -> details -> goal so back goes goal->details->home
              router.dismissAll?.();
              router.replace('/(tabs)');
              setTimeout(() => {
                router.push({ pathname: '/habit/[id]', params: { id: habitId.toString() } });
                setTimeout(() => router.push({ pathname: '/habit/[id]/goal', params: { id: habitId.toString() } }), 150);
              }, 100);
            } else {
              router.navigate({ pathname: '/habit/[id]', params: { id: habitId.toString() } });
            }
          } catch {
            router.navigate({ pathname: '/habit/[id]', params: { id: habitId.toString() } });
          }
        }
      }
    });
  }, [fontsLoaded, fontError, hydrated]);

  useEffect(() => {
    // Warm notification channels in background so first timer start is instant
    import('@/services/notificationService')
      .then((m) => m.initNotificationChannels().catch(() => {}))
      .catch(() => {});
    // Load focus session state and check stale session on startup
    useFocusStore.getState().loadActiveSession();

    // Reactive AppState listener (§5) - sync store when returning to foreground
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        useFocusStore.getState().loadActiveSession();
        useHabitStore.getState().loadHabits();
      }
    });

    // Notifee notification action events (Pause, Resume, Stop, Mark Completed, Reschedule, Start, +1)
    const unsubscribeNotifee = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.ACTION_PRESS && detail.pressAction?.id) {
        const actionId = detail.pressAction.id;
        if (actionId === 'pause') {
          useFocusStore.getState().pauseSession();
        } else if (actionId === 'resume') {
          useFocusStore.getState().resumeSession();
        } else if (actionId === 'stop') {
          useFocusStore.getState().stopSession();
        } else if (actionId === 'mark_completed') {
          const habitId = detail.notification?.data?.habitId;
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
          if (habitId) {
            handleStartTimerAction(parseInt(habitId as string, 10), detail.notification?.id).then(
              () => {
                useFocusStore.getState().loadActiveSession();
                useHabitStore.getState().loadHabits();
              }
            );
          }
        } else if (actionId === 'plus_one') {
          const habitId = detail.notification?.data?.habitId;
          if (habitId) {
            handlePlusOneAction(parseInt(habitId as string, 10), detail.notification?.id).then(
              () => {
                useHabitStore.getState().loadHabits();
              }
            );
          }
        }
      } else if (type === EventType.PRESS && detail.pressAction?.id === 'default') {
        const habitId = detail.notification?.data?.habitId;
        if (habitId) {
          (async () => {
            try {
              const { getHabitById } = await import('@/db/habits');
              const habit = await getHabitById(Number(habitId));
              if (habit && habit.progressType !== 'check') {
                router.push({ pathname: '/habit/[id]', params: { id: habitId.toString() } });
                setTimeout(() => router.push({ pathname: '/habit/[id]/goal', params: { id: habitId.toString() } }), 80);
              } else {
                router.navigate({ pathname: '/habit/[id]', params: { id: habitId.toString() } });
              }
            } catch {
              router.navigate({ pathname: '/habit/[id]', params: { id: habitId.toString() } });
            }
          })();
        }
      }
    });

    return () => {
      subscription.remove();
      unsubscribeNotifee();
    };
  }, []);

  if (!appReady || !hydrated)
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size={'large'} color="#10b981" />
      </View>
    ); // splash stays visible, nothing renders underneath

  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="habits.db" onInit={initDb}>
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
            <Stack.Screen name="habit/[id]/goal" options={{ headerShown: true, headerBackTitle: 'Back' }} />
          </Stack>
        </ThemeProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
