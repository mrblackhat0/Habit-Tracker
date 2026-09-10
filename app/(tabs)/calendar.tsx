import { useState, useMemo, useEffect } from 'react';
import { Text, View, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHabitStore } from '@/store/habitStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getHabitsForDate, getMonthDayStatuses, DateHabitItem } from '@/db/habits';
import { parseOccurrence, isScheduledDay, getTodayDateStr } from '@/utils/dates';
import { getIconColor } from '@/constants/Icons';
import { formatTime, toTitleCase } from '@/utils/utils';
import { Colors, DataColors } from '@/constants/Colors';
import { MonthNav } from '@/components/MonthNav';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const habits = useHabitStore((s) => s.habits);
  const [displayDate, setDisplayDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const todayStr = useMemo(() => getTodayDateStr(), []);
  const [selected, setSelected] = useState<string>(todayStr);

  const [dayStatuses, setDayStatuses] = useState<Map<string, 'all' | 'partial' | 'none'>>(
    new Map()
  );
  const [selectedDayHabits, setSelectedDayHabits] = useState<DateHabitItem[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);

  const year = displayDate.getFullYear();
  const month = displayDate.getMonth();
  const daysInMonth = useMemo(() => new Date(year, month + 1, 0).getDate(), [year, month]);
  const firstDay = useMemo(() => new Date(year, month, 1).getDay(), [year, month]);

  const cells = useMemo(() => {
    const prevMonthDays = new Date(year, month, 0).getDate();
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    const arr: { day: number; isCurrent: boolean; dateStr: string }[] = [];
    for (let i = 0; i < firstDay; i++) {
      const day = prevMonthDays - firstDay + 1 + i;
      const ds = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      arr.push({ day, isCurrent: false, dateStr: ds });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      arr.push({ day: d, isCurrent: true, dateStr: ds });
    }
    let nextDay = 1;
    while (arr.length % 7 !== 0) {
      const ds = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
      arr.push({ day: nextDay, isCurrent: false, dateStr: ds });
      nextDay++;
    }
    return arr;
  }, [firstDay, daysInMonth, year, month]);

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

  useEffect(() => {
    getMonthDayStatuses(year, month, habits).then(setDayStatuses);
  }, [year, month, habits]);

  useEffect(() => {
    if (!selected) {
      setSelectedDayHabits([]);
      return;
    }
    setLoadingDay(true);
    getHabitsForDate(selected)
      .then((items) => {
        const scheduled = items.filter((h) => {
          if (h.createdAt.slice(0, 10) > selected) return false;
          return isScheduledDay(selected, parseOccurrence(h.occurrence));
        });
        setSelectedDayHabits(scheduled);
      })
      .finally(() => setLoadingDay(false));
  }, [selected, habits]);

  const completedCount = selectedDayHabits.filter((h) => h.done).length;
  const totalScheduled = selectedDayHabits.length;
  const percent = totalScheduled > 0 ? Math.round((completedCount / totalScheduled) * 100) : 0;
  const isFutureSelectedDay = selected > todayStr;
  const isTodaySelected = selected === todayStr;

  const pendingHabits = useMemo(
    () => selectedDayHabits.filter((h) => !h.done),
    [selectedDayHabits]
  );
  const completedHabits = useMemo(
    () => selectedDayHabits.filter((h) => h.done),
    [selectedDayHabits]
  );

  return (
    <View style={{ paddingTop: insets.top }} className="flex-1 bg-background px-4">
      {/* Header */}
      <View className="my-4 flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-bold text-text">Calendar</Text>
          <Text className="mt-0.5 text-sm text-secondary">Browse months and habit history</Text>
        </View>
        <View className="flex-row items-center justify-between">
          {selected !== todayStr && (
            <Pressable
              onPress={() => {
                setSelected(todayStr);
                const now = new Date();
                setDisplayDate(new Date(now.getFullYear(), now.getMonth(), 1));
              }}
              className="flex-row items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 active:opacity-75">
              <Ionicons name="today-outline" size={14} color={Colors.primary} />
              <Text className="text-xs font-semibold text-primary">Today</Text>
            </Pressable>
          )}
        </View>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Month Calendar Card */}
        <View className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <MonthNav
            year={year}
            monthIndex={month}
            onPrev={goToPrevMonth}
            onNext={goToNextMonth}
            onPickerChange={(y, mIdx) => setDisplayDate(new Date(y, mIdx, 1))}
            embedded
          />

          {/* Weekdays */}
          <View className="mb-2 flex-row">
            {WEEKDAYS.map((w) => (
              <View key={w} className="flex-1 items-center py-1">
                <Text className="text-xs font-semibold text-secondary">{w}</Text>
              </View>
            ))}
          </View>

          {/* Days grid */}
          <View className="flex-row flex-wrap">
            {cells.map((cell: any, idx) => {
              const { day, isCurrent, dateStr: ds } = cell;
              const isToday = ds === todayStr;
              const isSelected = ds === selected;
              return (
                <View key={`${ds}-${idx}`} className="w-[14.28%] items-center py-1">
                  <Pressable
                    onPress={() => {
                      setSelected(ds);
                      if (!isCurrent) {
                        const [y, m] = ds.split('-').map(Number);
                        setDisplayDate(new Date(y, m - 1, 1));
                      }
                    }}
                    className={`h-8 w-8 items-center justify-center rounded-full ${
                      isSelected
                        ? 'bg-primary'
                        : isToday
                          ? 'border border-primary bg-primary/20'
                          : ''
                    }`}>
                    <Text
                      className={`text-sm ${
                        isSelected
                          ? 'font-bold text-white'
                          : isToday
                            ? 'font-bold text-primary'
                            : isCurrent
                              ? 'font-medium text-text'
                              : 'font-medium text-textMuted opacity-60'
                      }`}>
                      {day}
                    </Text>
                  </Pressable>
                  {isCurrent && dayStatuses.has(ds) && (
                    <View
                      className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                        dayStatuses.get(ds) === 'all'
                          ? 'bg-positive'
                          : dayStatuses.get(ds) === 'partial'
                            ? 'bg-warning'
                            : 'bg-danger'
                      }`}
                    />
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Day Detail Section */}
        {selected && (
          <View className="mt-4">
            {/* Summary Banner */}
            <View className="mb-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="text-sm font-bold text-text">
                  {isFutureSelectedDay
                    ? `${totalScheduled} habit${totalScheduled === 1 ? '' : 's'} scheduled`
                    : `${completedCount} of ${totalScheduled} habit${totalScheduled === 1 ? '' : 's'} completed`}
                </Text>
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="calendar" size={12} color={Colors.secondary} />
                  <Text className="text-xs font-medium text-secondary">
                    {new Date(selected + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                </View>
              </View>

              {!isFutureSelectedDay && totalScheduled > 0 ? (
                <View className="flex-row items-center gap-3">
                  <View className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                    <View
                      className="h-full rounded-full bg-positive transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </View>
                  <Text className="text-xl font-extrabold text-primary">{percent}%</Text>
                </View>
              ) : (
                <View className="flex-row items-center gap-1.5">
                  <Ionicons
                    name={isFutureSelectedDay ? 'time-outline' : 'checkmark-done-circle-outline'}
                    size={13}
                    color={Colors.secondary}
                  />
                  <Text className="text-xs text-secondary">
                    {isFutureSelectedDay
                      ? 'Upcoming scheduled tasks for this date'
                      : totalScheduled === 0
                        ? 'Rest day — no habits scheduled'
                        : 'Review your activity'}
                  </Text>
                </View>
              )}
            </View>

            {/* Loading */}
            {loadingDay ? (
              <View className="items-center py-8">
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text className="mt-2 text-xs text-secondary">Loading habits…</Text>
              </View>
            ) : (
              <>
                {/* Habit cards for selected day — pending on top, completed at bottom */}
                {pendingHabits.length > 0 && (
                  <View className="mb-2 flex-row items-center">
                    <View className="h-[1px] flex-1 bg-border" />
                    <Text className="mx-3 text-xs font-semibold uppercase tracking-wider text-secondary">
                      {isFutureSelectedDay ? 'Scheduled' : isTodaySelected ? 'Pending' : 'Missed'}
                    </Text>
                    <View className="h-[1px] flex-1 bg-border" />
                  </View>
                )}
                {pendingHabits.map((habit) => {
                  const isDone = Boolean(habit.done);
                  const isFuture = isFutureSelectedDay;
                  const isMissed = !isFuture && !isDone && !isTodaySelected;
                  const isTodayPending = isTodaySelected && !isDone;
                  return (
                    <View
                      key={habit.id}
                      className="mb-2.5 flex-row items-center rounded-2xl border border-border bg-surface p-3.5 shadow-sm">
                      <View
                        className="mr-3 h-11 w-11 items-center justify-center rounded-xl border border-border"
                        style={{ backgroundColor: `${getIconColor(habit.icon)}15` }}>
                        <Ionicons
                          name={habit.icon as any}
                          size={22}
                          color={getIconColor(habit.icon)}
                        />
                      </View>
                      <View className="flex-1 pr-2">
                        <Text
                          className={`text-sm font-semibold ${isDone ? 'text-secondary line-through' : 'text-text'}`}>
                          {toTitleCase(habit.name)}
                        </Text>
                        <View className="mt-0.5 flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
                          {habit.time && (
                            <View className="flex-row items-center gap-1">
                              <Ionicons name="time-outline" size={11} color={Colors.secondary} />
                              <Text className="text-xs text-secondary">
                                {formatTime(habit.time)}
                              </Text>
                            </View>
                          )}
                          {habit.progressType === 'duration' && habit.goalMinutes ? (
                            <Text className="text-xs text-secondary">
                              {habit.loggedMinutes}/{habit.goalMinutes} min
                            </Text>
                          ) : null}
                          {habit.progressType === 'quantity' && habit.goalQty ? (
                            <Text className="text-xs text-secondary">
                              {habit.loggedQty}/{habit.goalQty} {habit.unit || ''}
                            </Text>
                          ) : null}
                          {isMissed && (
                            <Text className="text-[11px] font-medium text-danger">Missed</Text>
                          )}
                          {isTodayPending && (
                            <Text className="text-[11px] font-medium text-warning">
                              Pending today
                            </Text>
                          )}
                          {isFuture && (
                            <Text className="text-[11px] font-medium text-secondary">
                              Scheduled
                            </Text>
                          )}
                        </View>
                      </View>
                      <View
                        className={`h-8 w-8 items-center justify-center rounded-full border ${
                          isMissed
                            ? 'border-danger/60 bg-danger/10'
                            : 'border-border bg-background/50'
                        }`}>
                        {isMissed && <Ionicons name="close" size={16} color={DataColors.danger} />}
                      </View>
                    </View>
                  );
                })}
                {completedHabits.length > 0 && (
                  <View className="mb-2 mt-1 flex-row items-center">
                    <View className="h-[1px] flex-1 bg-border" />
                    <Text className="mx-3 text-xs font-semibold uppercase tracking-wider text-secondary">
                      Completed
                    </Text>
                    <View className="h-[1px] flex-1 bg-border" />
                  </View>
                )}
                {completedHabits.map((habit) => {
                  const isDone = true;
                  return (
                    <View
                      key={habit.id}
                      className="mb-2.5 flex-row items-center rounded-2xl border border-border bg-surface p-3.5 shadow-sm">
                      <View
                        className="mr-3 h-11 w-11 items-center justify-center rounded-xl border border-border"
                        style={{ backgroundColor: `${getIconColor(habit.icon)}15` }}>
                        <Ionicons
                          name={habit.icon as any}
                          size={22}
                          color={getIconColor(habit.icon)}
                        />
                      </View>
                      <View className="flex-1 pr-2">
                        <Text className="text-sm font-semibold text-secondary line-through">
                          {toTitleCase(habit.name)}
                        </Text>
                        <View className="mt-0.5 flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
                          {habit.time && (
                            <View className="flex-row items-center gap-1">
                              <Ionicons name="time-outline" size={11} color={Colors.secondary} />
                              <Text className="text-xs text-secondary">
                                {formatTime(habit.time)}
                              </Text>
                            </View>
                          )}
                          {habit.progressType === 'duration' && habit.goalMinutes ? (
                            <Text className="text-xs text-secondary">
                              {habit.loggedMinutes}/{habit.goalMinutes} min
                            </Text>
                          ) : null}
                          {habit.progressType === 'quantity' && habit.goalQty ? (
                            <Text className="text-xs text-secondary">
                              {habit.loggedQty}/{habit.goalQty} {habit.unit || ''}
                            </Text>
                          ) : null}
                          <Text className="text-[11px] font-medium text-positive">Completed</Text>
                        </View>
                      </View>
                      <View className="h-8 w-8 items-center justify-center rounded-full border border-positive bg-positive">
                        <Ionicons name="checkmark" size={18} color="white" />
                      </View>
                    </View>
                  );
                })}

                {/* Empty state */}
                {selectedDayHabits.length === 0 && (
                  <View className="items-center rounded-2xl border border-dashed border-border/70 bg-surface/50 py-10">
                    <Ionicons name="calendar-outline" size={36} color={Colors.secondary} />
                    <Text className="mt-2 text-sm font-medium text-secondary">
                      No habits scheduled for this day
                    </Text>
                    <Text className="mt-0.5 text-xs text-textMuted">
                      Select another day or adjust your habit schedules
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>


    </View>
  );
}
