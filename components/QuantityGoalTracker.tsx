import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Habit, getLogsForHabit, logCompletion } from '@/db/habits';
import { getTodayDateStr } from '@/utils/dates';
import { useHabitStore } from '@/store/habitStore';

interface QuantityGoalTrackerProps {
  habit: Habit;
}

function QuantityGoalTracker({ habit }: QuantityGoalTrackerProps) {
  const goalQty = habit.goalQty ?? 1;
  const unit = habit.unit || 'units';

  const todayStr = useMemo(() => getTodayDateStr(), []);
  const [loggedQty, setLoggedQty] = useState<number>(0);

  useEffect(() => {
    getLogsForHabit(habit.id).then((logs) => {
      const todayLog = logs.find((l) => l.date === todayStr);
      setLoggedQty(todayLog?.loggedQty ?? 0);
    });
  }, [habit.id, todayStr]);

  const updateQuantity = (newQty: number) => {
    const qty = Math.max(0, newQty);
    setLoggedQty(qty);
    const completed = qty >= goalQty;

    logCompletion({
      habitId: habit.id,
      date: todayStr,
      loggedQty: qty,
      completed,
    });
    useHabitStore.getState().loadHabits();
  };

  const progressPercent = Math.min(100, Math.round((loggedQty / goalQty) * 100));

  return (
    <View className="flex-1 bg-background pt-2 pb-8">
      {/* Target Goal Banner */}
      <View className="bg-surface border border-border rounded-3xl p-8 items-center justify-center my-4 shadow-sm">
        <Text className="text-textMuted text-xs font-semibold uppercase tracking-wider mb-2">
          Daily Goal Progress
        </Text>
        <Text className="text-5xl font-black text-text tracking-tight my-2">
          {loggedQty} / {goalQty}
        </Text>
        <Text className="text-sm text-textMuted font-medium mb-4 capitalize">
          {unit}
        </Text>

        {/* Progress Bar */}
        <View className="w-full h-3 rounded-full bg-background overflow-hidden border border-border/60 mb-2">
          <View
            className="h-full bg-primary rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </View>

        <Text className="text-xs text-positive font-bold mt-2">
          {progressPercent}% completed {progressPercent >= 100 ? '🎉' : ''}
        </Text>

        {/* Counter Adjust Buttons */}
        <View className="flex-row items-center justify-center gap-6 mt-8">
          <Pressable
            onPress={() => updateQuantity(loggedQty - 1)}
            disabled={loggedQty <= 0}
            className={`w-14 h-14 rounded-2xl items-center justify-center border ${
              loggedQty <= 0
                ? 'bg-surface border-border opacity-40'
                : 'bg-surface border-border active:opacity-80'
            }`}
          >
            <Ionicons name="remove" size={28} color={Colors.text} />
          </Pressable>

          <Text className="text-3xl font-bold text-text w-16 text-center">{loggedQty}</Text>

          <Pressable
            onPress={() => updateQuantity(loggedQty + 1)}
            className="w-14 h-14 rounded-2xl bg-primary items-center justify-center active:opacity-90 shadow-lg shadow-primary/30"
          >
            <Ionicons name="add" size={28} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* Preset Increment Buttons */}
        <View className="flex-row gap-3 mt-6">
          {[1, 2, 5].map((inc) => (
            <Pressable
              key={inc}
              onPress={() => updateQuantity(loggedQty + inc)}
              className="px-4 py-2 rounded-xl bg-background border border-border active:opacity-80"
            >
              <Text className="text-xs font-bold text-text">+ {inc}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

export default React.memo(QuantityGoalTracker, (prev, next) => prev.habit.id === next.habit.id && prev.habit.goalQty === next.habit.goalQty);
