import { useEffect, useMemo, useState, useTransition } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MonthlyHabitsTracker, { MonthlyHabitItem } from '@/components/MonthlyHabitsTracker';
import MonthlyPieChart from '@/components/MonthlyPieChart';
import MonthlyPieChartSkeleton from '@/components/MonthlyPieChartSkeleton';
import TopHabitsCard, { TopHabitEntry } from '@/components/TopHabitsCard';
import TopHabitsCardSkeleton from '@/components/TopHabitsCardSkeleton';
import { MonthNav } from '@/components/MonthNav';
import { Colors } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHabitStore } from '@/store/habitStore';
import { getAllHabitsMonthlyCompletion } from '@/db/habits';
import { parseOccurrence, isScheduledDay } from '@/utils/dates';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export default function AnalyticsScreen() {
  const habits = useHabitStore((state) => state.habits);
  const loadHabits = useHabitStore((state) => state.loadHabits);

  const [displayDate, setDisplayDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(() => useHabitStore.getState().habits.length === 0);

  const year = displayDate.getFullYear();
  const monthIndex = displayDate.getMonth();
  const daysInMonth = useMemo(
    () => new Date(year, monthIndex + 1, 0).getDate(),
    [year, monthIndex]
  );

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && monthIndex === now.getMonth();
  const isFutureMonth =
    year > now.getFullYear() || (year === now.getFullYear() && monthIndex > now.getMonth());



  // Not wrapped in startTransition on purpose — date flips immediately,
  // and the skeleton gate below (isMonthDataLoaded) covers the loading gap.
  const goToPrevMonth = () => {
    setDisplayDate((prev) => {
      const pYear = prev.getMonth() === 0 ? prev.getFullYear() - 1 : prev.getFullYear();
      const pMonth = prev.getMonth() === 0 ? 11 : prev.getMonth() - 1;
      return new Date(pYear, pMonth, 1);
    });
  };

  const goToNextMonth = () => {
    setDisplayDate((prev) => {
      const nYear = prev.getMonth() === 11 ? prev.getFullYear() + 1 : prev.getFullYear();
      const nMonth = prev.getMonth() === 11 ? 0 : prev.getMonth() + 1;
      return new Date(nYear, nMonth, 1);
    });
  };

  const goToCurrentMonth = () => {
    const d = new Date();
    d.setDate(1);
    startTransition(() => setDisplayDate(d));
  };

  useEffect(() => {
    if (habits.length === 0) {
      setIsLoading(true);
      loadHabits().finally(() => setIsLoading(false));
    }
  }, [loadHabits, habits.length]);

  const [loadedMonthKey, setLoadedMonthKey] = useState<string | null>(null);
  const [monthlyCompletionMap, setMonthlyCompletionMap] = useState<Map<number, Set<string>>>(
    new Map()
  );

  const currentMonthKey = `${year}-${monthIndex}`;
  const isMonthDataLoaded = loadedMonthKey === currentMonthKey;

  useEffect(() => {
    const key = `${year}-${monthIndex}`;
    getAllHabitsMonthlyCompletion(year, monthIndex).then((data) => {
      setMonthlyCompletionMap(data);
      setLoadedMonthKey(key);
    });
  }, [year, monthIndex, habits]);

  const habitsWithLogs: MonthlyHabitItem[] = useMemo(() => {
    return habits.map((h) => {
      const completedSet = monthlyCompletionMap.get(h.id);
      const completedDates = completedSet ? Array.from(completedSet) : [];
      return {
        ...h,
        completedDates,
      };
    });
  }, [habits, monthlyCompletionMap]);

  const visiblehabits = useMemo(() => {
    const viewedMonthEnd = new Date(year, monthIndex + 1, 0);
    return habitsWithLogs.filter((t) => new Date(t.createdAt) <= viewedMonthEnd);
  }, [habitsWithLogs, year, monthIndex]);

  // Bails out immediately when this month's data hasn't arrived yet —
  // avoids running the O(habits × days) loop against stale/wrong data
  // on the render right after a month switch, which was eating click-to-paint time.
  const pieStats = useMemo(() => {
    if (!isMonthDataLoaded) return { scheduled: 0, completed: 0 };
    let scheduled = 0;
    let completed = 0;
    for (const h of visiblehabits) {
      const schedDays = parseOccurrence(h.occurrence);
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (isScheduledDay(ds, schedDays)) {
          scheduled++;
          if (h.completedDates.includes(ds)) completed++;
        }
      }
    }
    return { scheduled, completed };
  }, [visiblehabits, year, monthIndex, daysInMonth, isMonthDataLoaded]);

  const topHabits: TopHabitEntry[] = useMemo(() => {
    if (isFutureMonth || !isMonthDataLoaded) return [];
    const entries: TopHabitEntry[] = visiblehabits.map((h) => {
      const schedDays = parseOccurrence(h.occurrence);
      let scheduled = 0;
      let completed = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (isScheduledDay(ds, schedDays)) {
          scheduled++;
          if (h.completedDates.includes(ds)) completed++;
        }
      }
      const rate = scheduled ? completed / scheduled : 0;
      return { habit: h, completed, scheduled, rate };
    });
    return entries
      .filter((e) => e.scheduled > 0)
      .sort((a, b) => b.rate - a.rate || b.completed - a.completed)
      .slice(0, 5);
  }, [visiblehabits, year, monthIndex, daysInMonth, isFutureMonth, isMonthDataLoaded]);

  const totalHabitsForSkeleton = useMemo(() => {
    if (visiblehabits.length > 0) return visiblehabits.length;
    if (habits.length > 0) return habits.length;
    return 5;
  }, [visiblehabits.length, habits.length]);

  // Single gate covering FlatList tracker + pie chart + top habits card
  const showAnalyticsSkeleton = isPending || !isMonthDataLoaded;

  const insets = useSafeAreaInsets();

  return (
    <View style={{ paddingTop: insets.top }} className="flex-1 bg-background px-4">
      {/* Header */}
      <View className="mt-4 flex-row items-center justify-between pb-3">
        <View>
          <Text className="text-2xl font-bold text-text">Analytics</Text>
          <Text className="mt-0.5 text-xs text-secondary">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
        </View>
        {!isCurrentMonth && (
          <Pressable
            onPress={goToCurrentMonth}
            className="flex-row items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 active:opacity-75">
            <Ionicons name="today-outline" size={14} color={Colors.primary} />
            <Text className="text-xs font-semibold text-primary">This Month</Text>
          </Pressable>
        )}
      </View>

      {/* Month Navigator — unified MonthNav with same picker modal as calendar */}
      {!isLoading && habits.length > 0 && (
        <MonthNav
          year={year}
          monthIndex={monthIndex}
          onPrev={goToPrevMonth}
          onNext={goToNextMonth}
          onPickerChange={(y, mIdx) => startTransition(() => setDisplayDate(new Date(y, mIdx, 1)))}
        />
      )}

      {isLoading ? (
        <View className="flex-1 items-center justify-center py-16">
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text className="mt-3 text-xs font-medium text-textMuted">Loading analytics…</Text>
        </View>
      ) : habits.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8 py-16">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full border border-border bg-surface">
            <Ionicons name="analytics-outline" size={28} color={Colors.secondary} />
          </View>
          <Text className="text-center text-base font-bold text-text">No habits yet</Text>
          <Text className="mt-2 text-center text-sm leading-5 text-textMuted">
            Create your first habit to see your progress and analytics here.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: 24 }}>
          {isFutureMonth ? (
            <View className="mb-4 items-center rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-10">
              <Ionicons name="calendar-outline" size={36} color={Colors.secondary} />
              <Text className="mt-3 text-sm font-semibold text-text">No data for future month</Text>
              <Text className="mt-1 text-center text-xs leading-5 text-secondary">
                Monthly overview for {MONTH_NAMES[monthIndex]} {year} isn&apos;t available yet. Check back when the month begins.
              </Text>
            </View>
          ) : (
            <>
              <MonthlyHabitsTracker
                habits={visiblehabits}
                year={year}
                monthIndex={monthIndex}
                daysInMonth={daysInMonth}
                isDataLoaded={!showAnalyticsSkeleton}
                skeletonHabitCount={totalHabitsForSkeleton}
              />
              {showAnalyticsSkeleton ? (
                <>
                  <MonthlyPieChartSkeleton key={`pie-skeleton-${currentMonthKey}`} />
                  <TopHabitsCardSkeleton key={`top-skeleton-${currentMonthKey}`} />
                </>
              ) : (
                <>
                  {pieStats.scheduled > 0 && (
                    <MonthlyPieChart
                      key={`pie-chart-${currentMonthKey}`}
                      completed={pieStats.completed}
                      scheduled={pieStats.scheduled}
                    />
                  )}
                  {pieStats.scheduled > 0 && (
                    <TopHabitsCard key={`top-habits-${currentMonthKey}`} entries={topHabits} />
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}


    </View>
  );
}
