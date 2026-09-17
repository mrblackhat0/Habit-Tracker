import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { toTitleCase } from '@/utils/utils';
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { getIconColor } from '@/constants/Icons';
import { Habit } from '@/db/habits';
import { parseOccurrence, isScheduledDay } from '@/utils/dates';
import { Colors } from '@/constants/Colors';

export interface MonthlyHabitItem extends Habit {
  completedDates: string[];
}

interface MonthlyhabitTrackerProps {
  habits: MonthlyHabitItem[];
  year: number;
  monthIndex: number;
  daysInMonth: number;
  isDataLoaded?: boolean;
  skeletonHabitCount?: number;
}

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function MonthlyHabitTracker({
  habits,
  year,
  monthIndex,
  daysInMonth,
  isDataLoaded = true,
  skeletonHabitCount,
}: MonthlyhabitTrackerProps) {
  const month = String(monthIndex + 1).padStart(2, '0');
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);
  const rows = useMemo(
    () => habits.map((t) => ({ ...t, completedSet: new Set(t.completedDates || []) })),
    [habits]
  );

  const weeks = useMemo(() => {
    const result: { weekNumber: number; days: number[] }[] = [];
    for (let i = 0; i < daysInMonth; i += 7) {
      const weekDays = days.slice(i, Math.min(i + 7, daysInMonth));
      result.push({
        weekNumber: Math.floor(i / 7) + 1,
        days: weekDays,
      });
    }
    return result;
  }, [days, daysInMonth]);

  const stats = useMemo(() => {
    return rows.map((h) => {
      const schedDays = parseOccurrence(h.occurrence);
      let scheduled = 0;
      let completed = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = `${year}-${month}-${String(d).padStart(2, '0')}`;
        if (isScheduledDay(ds, schedDays)) {
          scheduled++;
          if (h.completedSet.has(ds)) completed++;
        }
      }
      const remaining = Math.max(0, scheduled - completed);
      const rate = scheduled ? Math.round((completed / scheduled) * 100) : 0;
      return { scheduled, completed, remaining, rate };
    });
  }, [rows, year, month, daysInMonth]);

  const overall = useMemo(() => {
    let scheduled = 0;
    let completed = 0;
    for (const s of stats) {
      scheduled += s.scheduled;
      completed += s.completed;
    }
    const rate = scheduled ? Math.round((completed / scheduled) * 100) : 0;
    return { scheduled, completed, rate };
  }, [stats]);

  const [ready, setReady] = useState(false);
  const [headerHeight, setHeaderHeight] = useState<number>(56);
  const scrollViewRef = useRef<ScrollView>(null);
  const weekOffsets = useRef<number[]>([]);
  const hasAnimatedScrollRef = useRef(false);

  // Calculate pixel offset for a week
  const getWeekOffset = useCallback(
    (weekIdx: number) => {
      if (weekOffsets.current[weekIdx] !== undefined) {
        return weekOffsets.current[weekIdx];
      }
      let x = 0;
      for (let i = 0; i < weekIdx; i++) {
        const dCount = weeks[i]?.days.length || 7;
        const weekWidth = dCount * 20 + Math.max(0, dCount - 1) * 8;
        const dividerWidth = 16 + 1.5; // mx-2 (8+8) + w-[1.5px]
        x += weekWidth + dividerWidth;
      }
      return x;
    },
    [weeks]
  );

  const scrollToCurrentWeek = useCallback(
    (animated = true) => {
      if (!scrollViewRef.current) return;
      const now = new Date();
      const isCurrentMonth = now.getFullYear() === year && now.getMonth() === monthIndex;
      const isPastMonth =
        year < now.getFullYear() || (year === now.getFullYear() && monthIndex < now.getMonth());

      let targetWeekIdx = 0;

      if (isCurrentMonth) {
        const currentDay = now.getDate();
        const weekIdx = weeks.findIndex((w) => w.days.includes(currentDay));
        if (weekIdx > 0) {
          targetWeekIdx = weekIdx;
        }
      } else if (isPastMonth) {
        const hasData = overall.completed > 0;
        if (hasData && weeks.length > 0) {
          targetWeekIdx = weeks.length - 1;
        }
      }

      if (targetWeekIdx > 0) {
        const targetX = getWeekOffset(targetWeekIdx);
        scrollViewRef.current.scrollTo({ x: targetX, animated });
      } else {
        scrollViewRef.current.scrollTo({ x: 0, animated });
      }
    },
    [year, monthIndex, weeks, overall.completed, getWeekOffset]
  );

  // Reset scroll tracker on month change
  useEffect(() => {
    hasAnimatedScrollRef.current = false;
  }, [year, monthIndex]);

  // Smooth scroll to current week once when rendered
  useEffect(() => {
    if (ready) {
      const timer = setTimeout(() => {
        if (!hasAnimatedScrollRef.current) {
          hasAnimatedScrollRef.current = true;
          scrollToCurrentWeek(true);
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [ready, scrollToCurrentWeek]);

  // Gate directly on isDataLoaded — no artificial timeout stacked on top.
  // One rAF lets layout settle before paint; that's it.
  useEffect(() => {
    if (!isDataLoaded) {
      setReady(false);
      return;
    }
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, [isDataLoaded]);

  if (!ready || !isDataLoaded) {
    return <ActivityIndicator size={'large'} color={Colors.primary} />;
  }

  if (habits.length === 0 || overall.scheduled === 0) {
    return (
      <View className="my-6 items-center rounded-2xl border border-dashed border-border/70 bg-surface/50 px-4 py-12">
        <Ionicons name="calendar-outline" size={36} color="#94A3B8" />
        <Text className="mt-3 text-center text-sm font-medium text-secondary">
          No habits scheduled for this month
        </Text>
        <Text className="mt-1 text-center text-xs text-textMuted">
          Select another month or create habits to see your monthly tracker
        </Text>
      </View>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(280)} className="w-full bg-transparent">
      <View className="w-full flex-row">
        {/* Fixed Left Column: Habit Names */}
        <View className="mr-3 w-32">
          {/* Header */}
          <View style={{ height: headerHeight, justifyContent: 'flex-end' }} className="mb-2">
            <View className="w-32 flex-row items-center gap-1.5 self-end rounded-xl border border-border bg-surface px-3 py-2">
              <Ionicons name="list" size={12} color="#94A3B8" />
              <Text className="text-xs font-bold text-text">Habits</Text>
              <Text className="text-[10px] font-semibold text-textMuted">• {habits.length}</Text>
            </View>
          </View>

          {/* Habit Names List */}
          <View style={{ paddingBottom: 24, gap: 2 }}>
            {rows.map((habit) => (
              <View
                key={habit.id}
                className="w-32 flex-row items-center py-0.5"
                style={{ height: 24 }}>
                <View className="mr-2">
                  <Ionicons name={habit.icon as any} size={16} color={getIconColor(habit.icon)} />
                </View>
                <Text numberOfLines={1} className="flex-1 text-sm font-semibold text-textMuted">
                  {toTitleCase(habit.name)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Scrollable Right Column: Weeks & Boxes */}
        <ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          contentContainerStyle={{ paddingRight: 16 }}
          className="flex-1"
          onContentSizeChange={(w) => {
            if (w > 0 && !hasAnimatedScrollRef.current) {
              const timer = setTimeout(() => {
                if (!hasAnimatedScrollRef.current) {
                  hasAnimatedScrollRef.current = true;
                  scrollToCurrentWeek(true);
                }
              }, 150);
            }
          }}>
          <View>
            {/* Header */}
            <View
              className="mb-2 flex-row items-end"
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                if (h > 0 && Math.abs(h - headerHeight) > 0.5) {
                  setHeaderHeight(h);
                }
              }}>
              <View className="flex-row items-end">
                {weeks.map((weekGroup, weekIdx) => (
                  <View
                    key={weekGroup.weekNumber}
                    className="flex-row items-end"
                    onLayout={(e) => {
                      weekOffsets.current[weekIdx] = e.nativeEvent.layout.x;
                    }}>
                    <View className="items-center">
                      <Text className="mb-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-primary">
                        Week {weekGroup.weekNumber}
                      </Text>

                      <View className="mb-1 flex-row gap-2">
                        {weekGroup.days.map((day) => {
                          const dateString = `${year}-${month}-${String(day).padStart(2, '0')}`;
                          const dayName = DAY_NAMES[new Date(`${dateString}T12:00:00`).getDay()];
                          return (
                            <Text
                              key={day}
                              className="w-5 text-center text-[11px] font-medium text-textMuted">
                              {dayName}
                            </Text>
                          );
                        })}
                      </View>

                      <View className="flex-row gap-2">
                        {weekGroup.days.map((day) => (
                          <Text
                            key={day}
                            className="w-5 text-center text-[12px] font-bold text-text">
                            {day}
                          </Text>
                        ))}
                      </View>
                    </View>

                    {weekIdx < weeks.length - 1 && (
                      <View className="mx-2 h-full w-[1.5px] self-stretch rounded-full bg-white opacity-60" />
                    )}
                  </View>
                ))}
                <View className="mx-2 h-full w-[1.5px] self-stretch rounded-full bg-white opacity-60" />
                <View className="flex-row items-end gap-1 self-end pb-1">
                  <View className="h-10 w-6 items-center justify-center">
                    <Text
                      numberOfLines={1}
                      style={{ transform: [{ rotate: '-90deg' }], width: 40 }}
                      className="text-center text-[10px] font-bold uppercase tracking-wider text-textMuted">
                      Done
                    </Text>
                  </View>
                  <View className="h-10 w-6 items-center justify-center">
                    <Text
                      numberOfLines={1}
                      style={{ transform: [{ rotate: '-90deg' }], width: 40 }}
                      className="text-center text-[10px] font-bold uppercase tracking-wider text-textMuted">
                      Sched
                    </Text>
                  </View>
                  <View className="h-10 w-6 items-center justify-center">
                    <Text
                      numberOfLines={1}
                      style={{ transform: [{ rotate: '-90deg' }], width: 40 }}
                      className="text-center text-[10px] font-bold uppercase tracking-wider text-textMuted">
                      Left
                    </Text>
                  </View>
                  <View className="w-28 items-center gap-1">
                    <Text className="text-center text-[10px] font-bold uppercase tracking-wider text-textMuted">
                      Progress
                    </Text>
                    <View className="h-1.5 w-24 overflow-hidden rounded-full bg-border">
                      <View
                        style={{ width: `${overall.rate}%` }}
                        className="h-full rounded-full bg-positive"
                      />
                    </View>
                    <Text className="text-[10px] font-bold text-positive">{overall.rate}%</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Habit Rows of Boxes */}
            <View style={{ paddingBottom: 24, gap: 2 }}>
              {rows.map((habit, index) => {
                const s = stats[index];
                return (
                  <View
                    key={habit.id}
                    className="flex-row items-center py-0.5"
                    style={{ height: 24 }}>
                    <View className="flex-row items-center">
                      {weeks.map((weekGroup, weekIdx) => (
                        <View key={weekGroup.weekNumber} className="flex-row items-center">
                          <View className="flex-row gap-2">
                            {weekGroup.days.map((day) => {
                              const dateString = `${year}-${month}-${String(day).padStart(2, '0')}`;
                              const isCompleted = habit.completedSet.has(dateString);
                              return (
                                <View
                                  key={day}
                                  className={`h-5 w-5 items-center justify-center rounded-sm ${
                                    isCompleted
                                      ? 'bg-positive'
                                      : 'border border-gray-500 bg-transparent'
                                  }`}>
                                  {isCompleted && (
                                    <Text className="bottom-[1px] left-[0.5px] text-[12px] font-bold text-white">
                                      ✓
                                    </Text>
                                  )}
                                </View>
                              );
                            })}
                          </View>

                          {weekIdx < weeks.length - 1 && (
                            <View className="mx-2 h-5 w-[1.5px] self-center rounded-full bg-border opacity-60" />
                          )}
                        </View>
                      ))}
                      <View className="mx-2 h-5 w-[1.5px] self-center rounded-full bg-border opacity-60" />
                      <View className="flex-row items-center gap-1">
                        <Text className="w-6 text-center text-xs font-semibold text-text">
                          {s.completed}
                        </Text>
                        <Text className="w-6 text-center text-xs font-medium text-textMuted">
                          {s.scheduled}
                        </Text>
                        <Text className="w-6 text-center text-xs font-medium text-warning">
                          {s.remaining}
                        </Text>
                        <View className="w-28 flex-row items-center justify-center gap-2 px-1">
                          <View className="h-1.5 w-16 overflow-hidden rounded-full bg-border">
                            <View
                              style={{ width: `${s.rate}%` }}
                              className="h-full rounded-full bg-positive"
                            />
                          </View>
                          <Text className="w-8 text-center text-sm font-bold text-positive">
                            {s.rate}%
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>
    </Animated.View>
  );
}
