import { useLocalSearchParams, router, Stack } from 'expo-router';
import { View, Text, Pressable, ScrollView, Platform, ActivityIndicator, ToastAndroid } from 'react-native';
import { useHabitStore } from '@/store/habitStore';
import { getStreaks } from '@/db/habits';
import { useState, useRef, useEffect, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import Animated, { FadeIn } from 'react-native-reanimated';
import { getIconColor } from '@/constants/Icons';
import { Colors, DataColors } from '@/constants/Colors';
import {formatTime, toTitleCase} from '@/utils/utils';
import MonthlyLogs from '@/components/MonthlyLogs';
import HistoryBarChart from '@/components/HistoryBarChart';
import ProgressThisWeek from '@/components/ProgressThisWeek';
import AnimatedSwitch from '@/components/AnimatedSwitch';
import { requestNotificationPermission } from '@/services/notificationService';

export default function HabitDetailScreen() {
  const { id, reschedule } = useLocalSearchParams<{ id: string; reschedule?: string }>();
  const habitId = Number(id);
  const habit = useHabitStore((state) => state.habits.find((h) => h.id === habitId));
  const updateHabit = useHabitStore((state) => state.updateHabit);
  const toggleCompletion = useHabitStore((state) => state.toggleCompletion);
  const isTodayDone = useHabitStore((state) => state.todayHabits.find((h) => h.id === habitId)?.done ?? false);
  const isNavigatingRef = useRef(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [streaks, setStreaks] = useState({ currentStreak: 0, bestStreak: 0 });
  const [isLoadingData, setIsLoadingData] = useState(true);

  const habitsVersion = useHabitStore((s) => s.habits);
  useEffect(() => {
    if (!habit) return;
    const isFirstLoad = isLoadingData;
    if (isFirstLoad) setIsLoadingData(true);
    getStreaks(habit.id, habit.occurrence)
      .then(setStreaks)
      .finally(() => {
        if (isFirstLoad) setIsLoadingData(false);
      });
  }, [habit?.id, habit?.occurrence, habitsVersion]);

  // open timepicker clock when coming from Reschedule action
  useEffect(() => {
    if (reschedule === '1' && habit) {
      requestNotificationPermission().catch(() => {});
      const t = setTimeout(() => {
        setShowTimePicker(true);
        // clear param after opening so back nav doesn't re-trigger
        // @ts-ignore
        router.setParams({ reschedule: undefined } as any);
      }, 350);
      return () => clearTimeout(t);
    }
  }, [reschedule, habit?.id]);

  if (!habit) {
    return (
      <View className="relative flex-1 items-center justify-center bg-background px-4">
        <Stack.Screen options={{ title: 'Habit Detail', headerBackTitle: 'Back' }} />
        <Text className="mb-4 text-lg text-text">Habit not found</Text>
        <Pressable onPress={() => router.back()} className="rounded-xl bg-primary px-4 py-2">
          <Text className="font-semibold text-white">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const { currentStreak, bestStreak } = streaks;
  const frequencyText = habit.occurrence.split(',').length === 7 ? 'Daily' : habit.occurrence;

  const goalSubtext =
    habit.progressType === 'duration' && habit.goalMinutes
      ? `${habit.goalMinutes} min`
      : habit.progressType === 'quantity' && habit.goalQty
        ? `${habit.goalQty} ${habit.unit || ''}`
        : '';

  const navigateToGoal = () => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    router.push({
      pathname: '/habit/[id]/goal',
      params: { id: habit.id.toString() },
    });
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 250);
  };

  const navigateToEdit = () => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    router.push({
      pathname: '/addHabit',
      params: { habitId: habit.id.toString() },
    });
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 250);
  };

  return (
    <View className="relative flex-1 bg-background px-4">
      <ScrollView
        className="flex-1 border-t border-border"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
        <Stack.Screen options={{ title: toTitleCase(habit.name), headerBackTitle: 'Back' }} />

        {isLoadingData ? (
          <View className="items-center justify-center py-16">
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text className="mt-3 text-xs font-medium text-textMuted">Loading details…</Text>
          </View>
        ) : (
          <Animated.View entering={FadeIn.duration(300)}>
            {/* 1. Icon + Habit Name + Subtitle Card */}
        <View className="mb-4 flex-row items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <View
            className="h-14 w-14 items-center justify-center rounded-2xl border border-border"
            style={{ backgroundColor: `${getIconColor(habit.icon)}25` }}>
            <Ionicons name={habit.icon as any} size={28} color={getIconColor(habit.icon)} />
          </View>
          <View className="flex-1">
            <Text className="text-xl font-bold text-text">{toTitleCase(habit.name)}</Text>
            <Text className="mt-1 text-xs text-textMuted">
              {frequencyText} {goalSubtext ? `• ${goalSubtext}` : ''}
            </Text>
          </View>
        </View>

        {/* 2. Stat Row: Current Streak & Best Streak */}
        <View className="mb-4 flex-row items-center justify-between rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <View className="flex-1 flex-row items-center gap-3 border-r border-border pr-2">
            <Text className="text-2xl">🔥</Text>
            <View>
              <Text className="text-[10px] font-semibold uppercase tracking-wider text-textMuted">
                Current Streak
              </Text>
              <Text className="mt-0.5 text-base font-bold text-text">{currentStreak} days</Text>
            </View>
          </View>

          <View className="flex-1 flex-row items-center gap-3 pl-4">
            <Text className="text-2xl">🏆</Text>
            <View>
              <Text className="text-[10px] font-semibold uppercase tracking-wider text-textMuted">
                Best Streak
              </Text>
              <Text className="mt-0.5 text-base font-bold text-text">{bestStreak} days</Text>
            </View>
          </View>
        </View>

        {/* 3. Progress — This Week */}
        <ProgressThisWeek habit={habit} />

        <View className="mb-4 flex-1 rounded-2xl border border-border bg-surface shadow-sm">
          {/* 4. Reminder Row */}
          <View className="flex-row items-center justify-between p-4 shadow-sm">
            <Pressable
              onPress={() => {
                requestNotificationPermission().catch(() => {});
                if (!habit.time) {
                  const defaultTime = new Date().toISOString();
                  updateHabit(habit.id, { time: defaultTime, reminder: true });
                }
                setShowTimePicker(true);
              }}
              className="justify-b flex-1 flex-row items-center gap-3 pr-3 active:opacity-80">
              <View className="flex-row items-center gap-3">
                <Ionicons
                  name={habit.reminder ? 'notifications' : 'notifications-off-outline'}
                  size={20}
                  color={habit.reminder ? Colors.primary : Colors.secondary}
                />
                <Text className="text-base font-semibold text-text">Reminder</Text>
              </View>
              {habit.time ? (
                <View className="flex-row items-center gap-1.5 rounded-xl border border-border/60 bg-background px-2.5 py-1">
                  <Ionicons name="time-outline" size={14} color={Colors.secondary} />
                  <Text
                    className={`text-xs font-semibold ${
                      habit.reminder ? 'text-text' : 'text-textMuted opacity-70'
                    }`}>
                    {formatTime(habit.time)}
                  </Text>
                </View>
              ) : (
                <Text className="text-xs font-semibold text-textMuted">Set time</Text>
              )}
            </Pressable>

            <AnimatedSwitch
              value={habit.reminder}
              onValueChange={(enabled) => {
                if (enabled) {
                  requestNotificationPermission().catch(() => {});
                  if (!habit.time) {
                    setShowTimePicker(true);
                  } else {
                    updateHabit(habit.id, { reminder: true });
                  }
                } else {
                  setShowTimePicker(false);
                  updateHabit(habit.id, { reminder: false });
                }
              }}
            />
          </View>

          {showTimePicker && (
            <DateTimePicker
              value={
                habit.time && !isNaN(new Date(habit.time).getTime())
                  ? new Date(habit.time)
                  : new Date()
              }
              mode="time"
              is24Hour={false}
              display="clock"
              onValueChange={(_, selectedDate) => {
                setShowTimePicker(Platform.OS === 'ios');
                if (selectedDate) {
                  updateHabit(habit.id, {
                    time: selectedDate.toISOString(),
                    reminder: true,
                  });
                }
              }}
              onDismiss={() => setShowTimePicker(false)}
            />
          )}

          {/* 5. Goal Row (duration/quantity habits only) */}
          {habit.progressType !== 'check' && (
            <>
              {/* Divider */}
              <View className="w-full border-b-[1px] border-[#2A2A35]" />
              <Pressable
                onPress={navigateToGoal}
                className="flex-row items-center justify-between rounded-2xl p-4 shadow-sm active:opacity-80">
                <View className="flex-row items-center gap-3">
                  <Ionicons name="location-outline" size={20} color={DataColors.danger} />
                  <Text className="text-base font-semibold text-text">Goal</Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm font-semibold text-textMuted">
                    {habit.progressType === 'duration'
                      ? `${habit.goalMinutes ?? 0} min per day`
                      : habit.progressType === 'quantity'
                        ? `${habit.goalQty ?? 0} ${habit.unit || ''} per day`
                        : ''}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={Colors.secondary} />
                </View>
              </Pressable>
            </>
          )}
        </View>

        {/* 6. History Bar Chart (Last section on screen) */}
        {habit.progressType === 'check' ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            className="flex-1 bg-background px-4 pt-6">
            <MonthlyLogs habit={habit} />
          </ScrollView>
        ) : (
          <HistoryBarChart habit={habit} />
        )}
          </Animated.View>
        )}

        {/* Edit Habit Button */}
      </ScrollView>
      <View className="mb-8 flex-row gap-3">
        <Pressable
          disabled={isTodayDone}
          onPress={() => {
            if (!isTodayDone) {
              toggleCompletion(habitId);
              ToastAndroid.show('Habit completed', ToastAndroid.SHORT);
            }
          }}
          className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl py-4 shadow-sm ${
            isTodayDone ? 'bg-positive opacity-60 shadow-positive/30' : 'border border-border bg-surface active:opacity-90'
          }`}>
          <Ionicons
            name={isTodayDone ? 'checkmark-circle' : 'checkmark-circle-outline'}
            size={18}
            color={isTodayDone ? 'white' : Colors.primary}
          />
          <Text className={`text-base font-bold ${isTodayDone ? 'text-white' : 'text-text'}`}>
            {isTodayDone ? 'Completed' : 'Mark Completed'}
          </Text>
        </Pressable>
        <Pressable
          onPress={navigateToEdit}
          className="flex-1 items-center rounded-2xl bg-primary py-4 shadow-lg shadow-primary/30 active:opacity-90">
          <Text className="text-base font-bold text-white">Edit Habit</Text>
        </Pressable>
      </View>
    </View>
  );
}
