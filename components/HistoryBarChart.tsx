import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getLogsForHabit, Habit } from '@/db/habits';
import React, { useMemo, useState } from 'react';
import { useHabitStore } from '@/store/habitStore';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import MonthlyLogs from '@/components/MonthlyLogs';
import { getTodayDateStr } from '@/utils/dates';

function formatCompactLogged(habit: Habit, raw: number): { display: string; a11y: string } {
  if (habit.progressType === 'duration') {
    const whole = Math.floor(raw);
    return { display: `${whole}m`, a11y: `${whole} minutes` };
  }
  if (habit.progressType === 'quantity') {
    const u = (habit.unit ?? '').trim();
    if (!u) return { display: `${raw}`, a11y: `${raw}` };
    const lower = u.toLowerCase();
    const MAP: Record<string, string> = {
      glasses: 'gls',
      glass: 'gls',
      pieces: 'pcs',
      piece: 'pcs',
      pcs: 'pcs',
      pages: 'pgs',
      page: 'pg',
      cups: 'cup',
      cup: 'cup',
      liters: 'L',
      liter: 'L',
      l: 'L',
      ml: 'ml',
      kg: 'kg',
      g: 'g',
      reps: 'reps',
      times: '×',
    };
    let abbr = MAP[lower] ?? (u.length <= 4 ? u : u.slice(0, 3));
    // keep original casing for short units like L, ml
    if (!MAP[lower] && u.length > 4) abbr = abbr.toLowerCase();
    return { display: `${raw} ${abbr}`, a11y: `${raw} ${u}` };
  }
  return { display: raw ? '✓' : '0', a11y: raw ? 'completed' : 'not completed' };
}

function HistoryBarChart({ habit }: { habit: Habit }) {
  const [showAllLogsModal, setShowAllLogsModal] = useState(false);
  const todayStr = useMemo(() => getTodayDateStr(), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const habitsVersion = useHabitStore((s) => s.habits);

  React.useEffect(() => {
    setIsLoading(true);
    getLogsForHabit(habit.id).then((l) => {
      setLogs(l);
      setIsLoading(false);
    });
  }, [habit.id, habitsVersion]);

  const days = useMemo(() => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const result: Array<{
      dayName: string;
      dateStr: string;
      ratio: number;
      completed: boolean;
      isToday: boolean;
      isYesterday: boolean;
      logged: string;
      loggedA11y: string;
    }> = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const log = logs.find((l) => l.date === dateStr);

      let ratio = 0;
      if (log) {
        if (habit.progressType === 'duration' && habit.goalMinutes) {
          ratio = Math.min(1, (log.loggedMinutes ?? 0) / habit.goalMinutes);
        } else if (habit.progressType === 'quantity' && habit.goalQty) {
          ratio = Math.min(1, (log.loggedQty ?? 0) / habit.goalQty);
        } else if (log.completed) {
          ratio = 1;
        }
      }

      const raw = log ? (log.loggedMinutes ?? log.loggedQty ?? 0) : 0;
      // for check without log, keep 0; for duration/quantity with no log, show 0 (+ unit handled)
      const { display, a11y } = log
        ? formatCompactLogged(habit, raw)
        : habit.progressType === 'duration'
          ? { display: '0m', a11y: '0 minutes' }
          : habit.progressType === 'quantity'
            ? formatCompactLogged(habit, 0)
            : { display: '0', a11y: '0' };

      result.push({
        dayName: dayNames[d.getDay()],
        dateStr,
        ratio,
        completed: log?.completed ?? false,
        isToday: dateStr === todayStr,
        isYesterday: dateStr === yesterdayStr,
        logged: display,
        loggedA11y: a11y,
      });
    }
    return result;
  }, [habit, todayStr, yesterdayStr, logs]);

  return (
    <View className="mb-6 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <View className="mb-6 flex-row items-center justify-between">
        <Text className="text-lg font-bold text-text">History</Text>
        <Pressable onPress={() => setShowAllLogsModal(true)}>
          <Text className="text-xs font-semibold text-textMuted">View all</Text>
        </Pressable>
      </View>

      {/* Bar Chart Container */}
      <View className="h-40 flex-row items-end justify-between gap-3 px-2">
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-xs text-textMuted">Loading…</Text>
          </View>
        ) : (
          days.map((item) => {
            const heightPercent = Math.round(item.ratio * 90);
            const isToday = item.isToday;

            let barStyleClass = 'bg-border';
            if (isToday) {
              barStyleClass =
                item.ratio > 0
                  ? 'bg-primary/95 shadow-sm shadow-primary/40'
                  : 'bg-primary/75 border border-primary/40';
            } else if (item.ratio > 0) {
              barStyleClass = 'bg-positive/75 shadow-sm shadow-positive/30';
            }

            return (
              <View key={item.dateStr} className="mx-0.5 flex-1 items-center">
                {/* text needs room for descenders (g/y/p/q) — separate from bar's overflow */}
                <View className="h-36 w-full justify-end p-1">
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                    allowFontScaling={false}
                    accessibilityLabel={item.loggedA11y}
                    className={`mb-1.5 text-center text-[10px] leading-[12px] ${
                      isToday ? 'font-bold text-primary' : 'font-semibold text-muted'
                    }`}
                    style={{ width: '100%', includeFontPadding: true } as any}>
                    {item.logged}
                  </Text>
                  <View
                    style={{ height: `${heightPercent}%`, minHeight: 2 }}
                    className={`flex w-full overflow-hidden rounded ${barStyleClass}`}
                  />
                </View>
                <Text
                  className={`mt-2 text-[10px] uppercase ${
                    isToday ? 'font-bold text-primary' : 'font-semibold text-muted'
                  }`}>
                  {isToday ? 'Today' : (item as any).isYesterday ? "Y'Day" : item.dayName}
                </Text>
              </View>
            );
          })
        )}
      </View>

      {/* Modal for "View All" (Monthly Logs) */}
      <Modal visible={showAllLogsModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-background px-4 pt-2">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-xl font-bold text-text">Activity History</Text>
            <Pressable onPress={() => setShowAllLogsModal(false)} className="p-2">
              <Ionicons name="chevron-down" size={24} color={Colors.text} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <MonthlyLogs habit={habit} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

export default React.memo(
  HistoryBarChart,
  (prev, next) =>
    prev.habit.id === next.habit.id &&
    prev.habit.goalMinutes === next.habit.goalMinutes &&
    prev.habit.goalQty === next.habit.goalQty
);
