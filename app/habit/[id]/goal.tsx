import { View, Text, Pressable, BackHandler } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useHabitStore } from '@/store/habitStore';
import Focus from '@/components/Focus';
import QuantityGoalTracker from '@/components/QuantityGoalTracker';

export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const habitId = Number(id);
  const habit = useHabitStore((state) => state.habits.find((h) => h.id === habitId));

  // ponytail: when launched from killed state directly to goal, no back stack -> back should go details -> home
  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/habit/[id]', params: { id: String(habitId) } });
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!router.canGoBack()) {
        handleBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [habitId]);

  if (!habit) {
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
          title: 'Goal',
          headerBackTitle: 'Back',
          headerLeft: () => (
            <Pressable onPress={handleBack} hitSlop={8} style={{ paddingRight: 12 }}>
              <Ionicons name="chevron-back" size={24} color={Colors.text} />
            </Pressable>
          ),
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
