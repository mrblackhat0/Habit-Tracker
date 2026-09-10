import { router, Stack } from 'expo-router';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, DataColors } from '@/constants/Colors';
import { getLogsByHabitIdAndMonth, Habit, } from '@/db/habits';
import { useState, useEffect } from 'react';
import { MonthNav } from '@/components/MonthNav';
import { useHabitStore } from '@/store/habitStore';

export default function MonthlyLogs({ habit }: { habit: Habit }) {
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [logs, setLogs] = useState<any[] | null>(null);
  const habitsVersion = useHabitStore((s) => s.habits);

  useEffect(() => {
    if (habit) getLogsByHabitIdAndMonth(habit.id, viewDate.year, viewDate.month).then(setLogs);
  }, [habit?.id, viewDate.year, viewDate.month, habitsVersion]);

  if (!habit) {
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center px-4">
        <Stack.Screen options={{ title: 'Habit Detail', headerBackTitle: 'Back' }} />
        <Text className="text-text text-lg mb-4">Habit not found</Text>
        <Pressable
          onPress={() => router.back()}
          className="bg-primary px-4 py-2 rounded-xl"
        >
          <Text className="text-white font-semibold">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const createdAtDateStr = habit.createdAt.slice(0, 10); // e.g. '2026-08-13'
  const createdYear = Number(createdAtDateStr.slice(0, 4));
  const createdMonth = Number(createdAtDateStr.slice(5, 7));

  function goToPrevMonth() {
    setViewDate(({ year, month }) =>
      month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
    );
  }

  function goToNextMonth() {
    setViewDate(({ year, month }) =>
      month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
    );
  }



  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40, marginTop: 16 }}>
      {/* Habit Card Header */}

      <MonthNav
        year={viewDate.year}
        month={viewDate.month}
        createdYear={createdYear}
        createdMonth={createdMonth}
        onPrev={goToPrevMonth}
        onNext={goToNextMonth}
        onPickerChange={(y, mIdx) => setViewDate({ year: y, month: mIdx + 1 })}
      />

      {/* History / Logs Section */}
      <Text className="text-textMuted text-xs font-semibold tracking-wider uppercase mb-3 px-1">
        Recent Activity
      </Text>
      {logs?.length === 0 ? (
        <View className="bg-surface border border-border rounded-2xl p-6 items-center">
          <Text className="text-textMuted text-sm">No completions logged yet.</Text>
        </View>
      ) : (
        <View className="bg-surface border border-border rounded-2xl p-4 gap-3">
          {logs?.map((log) => (
            <View
              key={log.id}
              className="flex-row items-center justify-between py-2 border-b border-border/50 last:border-b-0"
            >
              <View className="flex-row items-center gap-3">
                <Ionicons
                  name={log.completed ? 'checkmark-circle' : 'close-circle'}
                  size={20}
                  color={log.completed ? DataColors.positive : Colors.secondary}
                />
                <Text className="text-text text-sm font-medium">{log.date}</Text>
              </View>
              <Text className="text-xs text-textMuted">
                {!habit.goalMinutes && !habit.goalQty && (log.completed ? 'Completed' : 'Skipped')}
                {habit.goalMinutes ? ` ${log.loggedMinutes} / ${habit.goalMinutes} m` : null}
                {habit.goalQty ? ` ${log.loggedQty} / ${habit.goalQty} ${habit.unit}` : null}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

