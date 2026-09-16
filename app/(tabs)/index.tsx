import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { View, Text, Pressable, RefreshControl, FlatList, Image } from 'react-native';
import { hapticImpact } from '@/utils/haptics';
import { HabitCard, HabitCardItem } from '@/components/HabitCard';
import { HabitCardListSkeleton } from '@/components/HabitCardSkeleton';
import HomeSkeleton, { GreetingHeaderSkeleton } from '@/components/HomeSkeleton';
import HabitActionSheet from '@/components/HabitActionSheet';
import CompletionConfirmModal from '@/components/CompletionConfirmModal';
import UncompleteConfirmModal from '@/components/UncompleteConfirmModal';
import RingProgress from '@/components/RingProgressBar';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { router, Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHabitStore } from '@/store/habitStore';
import { useStore } from '@/store/store';
import { getTodayDateStr, parseOccurrence, isScheduledDay } from '@/utils/dates';

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return `Good Morning, ${name} 👋`;
  }
  if (hour >= 12 && hour < 17) {
    return `Good Afternoon, ${name} 👋`;
  }
  if (hour >= 17 && hour < 21) {
    return `Good Evening, ${name} 👋`;
  }
  return `Good Night, ${name} 👋`;
}

interface WeekDayItem {
  dayName: string;
  dayNumber: number;
  isToday: boolean;
  dateStr: string;
}

const GreetingComponent = ({ userName }: { userName: string }) => {
  const profileImageUri = useStore((s) => s.profileImageUri);
  return (
    <View className="mb-4 mt-4 flex-row items-center gap-3 px-1">
      {profileImageUri ? (
        <Image
          key={profileImageUri}
          source={{ uri: profileImageUri }}
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            borderWidth: 2,
            borderColor: Colors.border,
          }}
          resizeMode="cover"
          onError={() => useStore.getState().setProfileImageUri(null)}
        />
      ) : (
        <View className="h-14 w-14 items-center justify-center rounded-full border border-primary bg-surface">
          <Ionicons name="person" size={28} color={Colors.primary} />
        </View>
      )}
      <View>
        <Text className="text-xl font-bold text-text">{getGreeting(userName)}</Text>
        <Text className="text-xs text-secondary">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })}
        </Text>
      </View>
    </View>
  );
};

function getWeekDays(): WeekDayItem[] {
  const today = new Date();
  const currentDayOfWeek = today.getDay(); // 0 = Sun, 6 = Sat
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - currentDayOfWeek);

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekDays: WeekDayItem[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const isToday =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();

    weekDays.push({
      dayName: dayNames[i],
      dayNumber: d.getDate(),
      isToday,
      dateStr: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    });
  }

  return weekDays;
}

type ListItem =
  | { type: 'habit'; habit: HabitCardItem }
  | { type: 'all_done_banner'; id: string }
  | { type: 'pending_divider'; id: string }
  | { type: 'divider'; id: string };

export default function Home() {
  const todayHabits = useHabitStore((state) => state.todayHabits);
  const loadHabits = useHabitStore((state) => state.loadHabits);
  const toggleCompletion = useHabitStore((state) => state.toggleCompletion);
  const resetCompletion = useHabitStore((state) => state.resetCompletion);
  const markAsUnComplete = useHabitStore((state) => state.markAsUnComplete);
  const deleteHabit = useHabitStore((state) => state.deleteHabit);
  const archiveHabit = useHabitStore((state) => state.archiveHabit);
  const unarchiveHabit = useHabitStore((state) => state.unarchiveHabit);
  const userName = useStore((state) => state.userName.split(' ')[0] || 'Rebel');
  const hydrated = useStore((state) => state._hydrated);
  const hasCompletedOnboarding = useStore((state) => state.hasCompletedOnboarding);

  useEffect(() => {
    if (hydrated && hasCompletedOnboarding) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [hydrated, hasCompletedOnboarding]);

  const [selectedHabit, setSelectedHabit] = useState<HabitCardItem | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [confirmHabit, setConfirmHabit] = useState<HabitCardItem | null>(null);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [uncompleteHabit, setUncompleteHabit] = useState<HabitCardItem | null>(null);
  const [uncompleteModalVisible, setUncompleteModalVisible] = useState(false);
  const [ready, setReady] = useState(() => useHabitStore.getState().habits.length > 0);
  const [refreshing, setRefreshing] = useState(false);
  const [habitsLoading, setHabitsLoading] = useState(
    () => useHabitStore.getState().habits.length === 0
  );
  const isNavigatingRef = useRef(false);

  const autoCompletePending = useCallback(async () => {
    try {
      const habits = useHabitStore.getState().todayHabits;
      const todayStr = getTodayDateStr();
      const toComplete = habits.filter((h) => {
        if (h.done) return false;
        try {
          if (!isScheduledDay(todayStr, parseOccurrence(h.occurrence))) return false;
        } catch {
          return false;
        }
        if (h.progressType === 'duration' && h.goalMinutes != null) {
          return (h.loggedMinutes ?? 0) >= h.goalMinutes;
        }
        if (h.progressType === 'quantity' && h.goalQty != null) {
          return (h.loggedQty ?? 0) >= h.goalQty;
        }
        return false;
      });
      for (const h of toComplete) {
        try {
          await toggleCompletion(h.id);
        } catch {}
      }
    } catch {}
  }, [toggleCompletion]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadHabits();
      await autoCompletePending();
    } catch {}
    setRefreshing(false);
  }, [loadHabits, autoCompletePending]);

  // Initial load — don't defer via requestIdleCallback (may never fire while skeleton Pulse animates)
  useEffect(() => {
    let cancelled = false;
    const doLoad = async () => {
      if (cancelled) return;
      setHabitsLoading(true);
      try {
        await loadHabits();
        if (!cancelled) await autoCompletePending();
      } catch {}
      if (!cancelled) setHabitsLoading(false);
    };
    doLoad();
    return () => {
      cancelled = true;
    };
  }, [loadHabits, autoCompletePending]);

  const weekDays = useMemo(() => getWeekDays(), []);

  const scheduledTodayHabits = useMemo(() => {
    try {
      const todayStr = getTodayDateStr();
      return todayHabits.filter((h) => {
        try {
          if (!h || !h.occurrence) return false;
          const scheduledDays = parseOccurrence(h.occurrence);
          return isScheduledDay(todayStr, scheduledDays);
        } catch {
          return false;
        }
      });
    } catch {
      return [];
    }
  }, [todayHabits]);

  const completedCount = scheduledTodayHabits.filter((t) => t.done).length;
  const totalCount = scheduledTodayHabits.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const pendingHabits = useMemo(
    () => scheduledTodayHabits.filter((t) => !t.done),
    [scheduledTodayHabits]
  );
  const completedHabits = useMemo(
    () => scheduledTodayHabits.filter((t) => t.done),
    [scheduledTodayHabits]
  );

  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];

    if (scheduledTodayHabits.length > 0 && pendingHabits.length === 0) {
      items.push({
        type: 'all_done_banner',
        id: 'all-done-banner',
      });
    } else if (pendingHabits.length > 0) {
      items.push({
        type: 'pending_divider',
        id: 'pending-divider',
      });
      items.push(...pendingHabits.map((h) => ({ type: 'habit' as const, habit: h })));
    }

    if (completedHabits.length > 0) {
      items.push({
        type: 'divider',
        id: 'completed-divider',
      });
      items.push(
        ...completedHabits.map((h) => ({
          type: 'habit' as const,
          habit: h,
        }))
      );
    }

    return items;
  }, [scheduledTodayHabits.length, pendingHabits, completedHabits]);

  const toggleDone = useCallback(
    (id: number, habit?: HabitCardItem) => {
      if (habit?.done) {
        if (habit.progressType === 'check') {
          // check type: instant toggle, no modal
          toggleCompletion(id);
          return;
        }
        // duration/quantity goal completed → uncomplete needs confirmation + reset
        hapticImpact();
        setUncompleteHabit(habit);
        setUncompleteModalVisible(true);
        return;
      }
      if (habit && !habit.done) {
        const isDurationIncomplete =
          habit.progressType === 'duration' &&
          habit.goalMinutes != null &&
          (habit.loggedMinutes ?? 0) < habit.goalMinutes;

        const isQuantityIncomplete =
          habit.progressType === 'quantity' &&
          habit.goalQty != null &&
          (habit.loggedQty ?? 0) < habit.goalQty;

        if (isDurationIncomplete || isQuantityIncomplete) {
          hapticImpact();
          setConfirmHabit(habit);
          setConfirmModalVisible(true);
          return;
        }
      }

      toggleCompletion(id);
    },
    [toggleCompletion]
  );

  const handleCardPress = useCallback((habit: HabitCardItem) => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    router.push({
      pathname: '/habit/[id]',
      params: { id: habit.id.toString() },
    });
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 250);
  }, []);

  const handleCardLongPress = useCallback((habit: HabitCardItem) => {
    hapticImpact();
    setSelectedHabit(habit);
    setActionSheetVisible(true);
  }, []);

  const handleEditHabit = useCallback((habit: HabitCardItem) => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    router.push({
      pathname: '/addHabit',
      params: { habitId: habit.id.toString() },
    });
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 250);
  }, []);

  const handleDeleteHabit = useCallback(
    (habit: HabitCardItem) => {
      deleteHabit(habit.id);
    },
    [deleteHabit]
  );

  const handleArchiveHabit = useCallback(
    (habit: HabitCardItem) => {
      if (habit.archived) unarchiveHabit(habit.id);
      else archiveHabit(habit.id);
    },
    [archiveHabit, unarchiveHabit]
  );

  const handleAddhabit = useCallback(() => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    router.push('/addHabit');
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 250);
  }, []);

  useEffect(() => {
    // keep HomeSkeleton only for initial app mount, not for pull-to-refresh
    const t = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(t);
  }, []);

  const insets = useSafeAreaInsets();

  if (hydrated && !hasCompletedOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  if (!ready || refreshing || !hydrated) {
    return (
      <View style={{ paddingTop: insets.top }} className="flex-1  bg-background px-4">
        {refreshing ? <GreetingComponent userName={userName} /> : <GreetingHeaderSkeleton />}
        <HomeSkeleton />
      </View>
    );
  }

  return (
    <View style={{ paddingTop: insets.top }} className="flex-1 bg-background px-4">
      {/* Header with Dynamic Greeting & Subtitle - always visible */}
      <GreetingComponent userName={userName} />

      {/* Habits List */}
      <FlatList
        data={listData}
        scrollEnabled={!refreshing && !habitsLoading}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
            progressBackgroundColor={Colors.surface}
          />
        }
        keyExtractor={(item, index) => {
          try {
            if (item.type === 'habit') return `habit-${item.habit?.id ?? index}`;
            return (item as any).id ?? `item-${index}`;
          } catch {
            return `item-${index}`;
          }
        }}
        renderItem={({ item }) => {
          try {
            if (item.type === 'all_done_banner') {
              return (
                <View className="mb-3 flex-row items-center gap-3 rounded-2xl border border-positive/30 bg-surface p-4 shadow-sm">
                  <View className="h-10 w-10 items-center justify-center rounded-xl border border-positive/20 bg-positive/10">
                    <Ionicons name="checkmark-done" size={22} color="#10b981" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-text">
                      All habits completed for today! 🎉
                    </Text>
                    <Text className="mt-0.5 text-xs text-secondary">
                      No pending habits left for today. Keep up the great work!
                    </Text>
                  </View>
                </View>
              );
            }
            if (item.type === 'pending_divider') {
              return (
                <View className="mb-3 flex-row items-center">
                  <View className="h-[1px] flex-1 bg-primary/30" />
                  <Text className="mx-3 text-xs font-bold uppercase tracking-wider text-primary">
                    Pending
                  </Text>
                  <View className="h-[1px] flex-1 bg-primary/30" />
                </View>
              );
            }
            if (item.type === 'divider') {
              return (
                <View className="mb-3 flex-row items-center">
                  <View className="h-[1px] flex-1 bg-positive/30" />
                  <Text className="mx-3 text-xs font-bold uppercase tracking-wider text-positive">
                    Completed
                  </Text>
                  <View className="h-[1px] flex-1 bg-positive/30" />
                </View>
              );
            }
            return (
              <HabitCard
                habit={item.habit}
                onToggleDone={toggleDone}
                onPress={handleCardPress}
                onLongPress={handleCardLongPress}
              />
            );
          } catch {
            return null;
          }
        }}
        ListEmptyComponent={
          habitsLoading ? (
            <View className="pt-2">
              <HabitCardListSkeleton count={8} />
            </View>
          ) : (
            <View className="items-center justify-center px-4 py-12">
              <Ionicons name="calendar-outline" size={44} color={Colors.secondary} />
              <Text className="mt-3 text-center text-sm text-secondary">
                No habits scheduled for today
              </Text>
            </View>
          )
        }
        ListHeaderComponent={
          <>
            {/* Today's Progress Card */}
            <View className="mb-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-lg font-bold text-text">Today&apos;s Progress</Text>
                  <Text className="mt-0.5 text-xs text-secondary">
                    {completedCount} of {totalCount} habits completed
                  </Text>
                </View>
                <RingProgress percent={progressPercent} />
              </View>
            </View>

            {/* Static Sun-Sat Week Strip */}
            <View className="mb-8 flex-row items-center justify-between gap-1.5">
              {weekDays.map((day) => (
                <View
                  key={day.dayName}
                  className={`flex-1 items-center justify-center rounded-xl border py-2 ${
                    day.isToday ? 'border-primary bg-primary' : 'border-border bg-surface'
                  }`}>
                  <Text
                    className={`text-[10px] font-semibold uppercase ${
                      day.isToday ? 'text-white' : 'text-secondary'
                    }`}>
                    {day.dayName}
                  </Text>
                  <Text
                    className={`mt-0.5 text-sm font-bold ${day.isToday ? 'text-white' : 'text-text'}`}>
                    {day.dayNumber}
                  </Text>
                </View>
              ))}
            </View>
          </>
        }

        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 76 }}
      />

      {/* Floating Action Button (FAB) */}
      <Pressable
        onPress={handleAddhabit}
        className="absolute bottom-4 right-6 h-16 w-16 items-center justify-center rounded-full bg-primary shadow-xl shadow-primary/30 transition-all active:scale-95 active:opacity-90"
        style={{
          elevation: 8,
        }}>
        <Ionicons name="add" size={40} color={Colors.text} />
      </Pressable>

      {/* Action Sheet Modal for Long Press */}
      <HabitActionSheet
        visible={actionSheetVisible}
        habit={selectedHabit}
        onClose={() => setActionSheetVisible(false)}
        onEdit={handleEditHabit}
        onDelete={handleDeleteHabit}
        onArchive={handleArchiveHabit}
      />

      {/* Completion Confirmation Modal for Incomplete Goals */}
      <CompletionConfirmModal
        visible={confirmModalVisible}
        habit={confirmHabit}
        onClose={() => setConfirmModalVisible(false)}
        onConfirm={(h) => toggleCompletion(h.id)}
      />

      {/* Uncomplete Confirmation Modal for Completed Goals — resets log */}
      <UncompleteConfirmModal
        visible={uncompleteModalVisible}
        habit={uncompleteHabit}
        onClose={() => setUncompleteModalVisible(false)}
        onReset={(h) => resetCompletion(h.id)}
        onConfirm={(h) => markAsUnComplete(h.id)}
      />
    </View>
  );
}
