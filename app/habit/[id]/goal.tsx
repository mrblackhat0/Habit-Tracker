import { View, Text, Pressable, BackHandler, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useHabitStore } from '@/store/habitStore';
import Focus from '@/components/Focus';
import QuantityGoalTracker from '@/components/QuantityGoalTracker';
import { toTitleCase } from '@/utils/utils';

export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const habitId = Number(id);
  const habit = useHabitStore((state) => state.habits.find((h) => h.id === habitId));
  const habitsLoaded = useHabitStore((state) => state._habitsLoaded);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!router.canGoBack()) {
        router.replace({ pathname: '/(tabs)' });
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [habitId]);

  if (!habit) {
    if (!habitsLoaded) {
      return (
        <View className="flex-1 items-center justify-center bg-background px-4">
          <Stack.Screen options={{ title: 'Goal', headerBackTitle: 'Back' }} />
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text className="mt-3 text-xs font-medium text-textMuted">Loading habit…</Text>
        </View>
      );
    }
    return (
      <View className="flex-1 items-center justify-center bg-background px-4">
        <Stack.Screen options={{ title: 'Goal', headerBackTitle: 'Back' }} />
        <Text className="mb-4 text-lg text-text">Habit not found</Text>
        <Pressable onPress={() => router.back()} className="rounded-xl bg-primary px-4 py-2">
          <Text className="font-semibold text-white">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 border-t border-border bg-background px-4 pt-2">
      <Stack.Screen
        options={{
          title: `Goal - ${toTitleCase(habit.name)} (${habit.goalMinutes || habit.goalQty} ${habit.unit || 'min'})`,
          headerBackTitle: 'Back',
        }}
      />

      <>
        {habit.progressType === 'duration' && <Focus habit={habit} />}
        {habit.progressType === 'quantity' && <QuantityGoalTracker habit={habit} />}
        {habit.progressType === 'check' && (
          <View className="flex-1 items-center justify-center py-12">
            <Ionicons name="checkmark-done-circle-outline" size={48} color={Colors.secondary} />
            <Text className="mt-3 text-center text-base text-secondary">
              Check-off habits do not have a duration or quantity goal.
            </Text>
          </View>
        )}
      </>
    </View>
  );
}
