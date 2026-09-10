import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { getLogsForHabit, Habit } from '@/db/habits';
import { useHabitStore } from '@/store/habitStore';

function ProgressThisWeek({ habit }: { habit: Habit }) {
  const [weekDays, setWeekDays] = useState<{ dateStr: string; completed: boolean }[]>([]);
  const habitsVersion = useHabitStore((s) => s.habits);

  useEffect(() => {
    getLogsForHabit(habit.id).then((logs) => {
      const today = new Date();
      const currentDayOfWeek = today.getDay();
      const sunday = new Date(today);
      sunday.setDate(today.getDate() - currentDayOfWeek);
      const result = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(sunday);
        d.setDate(sunday.getDate() + i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const log = logs.find((l) => l.date === dateStr);
        result.push({ dateStr, completed: log?.completed ?? false });
      }
      setWeekDays(result);
    });
  }, [habit.id, habitsVersion]);

  const completedCount = weekDays.filter((d) => d.completed).length;

  return (
    <View className="mb-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <View className="mb-1 flex-row items-center justify-between">
        <Text className="text-base font-bold text-text">Progress</Text>
        <Text className="text-xs font-medium text-textMuted">This Week</Text>
      </View>
      <Text className="mb-3 text-xs font-medium text-textMuted">{completedCount}/7 days</Text>

      {/* 7 segmented bars */}
      <View className="flex-row justify-between gap-1.5">
        {weekDays.map((day, idx) => (
          <View
            key={idx}
            className={`h-2.5 flex-1 rounded-full ${day.completed ? 'bg-positive' : 'bg-gray-500'}`}
          />
        ))}
      </View>
    </View>
  );
}

export default React.memo(ProgressThisWeek, (prev, next) => prev.habit.id === next.habit.id);
