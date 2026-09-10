import { View, Text } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import { toTitleCase } from '@/utils/utils';
import { Ionicons } from '@expo/vector-icons';
import { getIconColor } from '@/constants/Icons';
import { Habit } from '@/db/habits';

function AnimatedBar({ rate, delay = 0 }: { rate: number; delay?: number }) {
  const pct = Math.round(rate * 100);
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withDelay(delay, withTiming(pct, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [pct, delay]);

  const style = useAnimatedStyle(() => ({ width: `${width.value}%` as any }));

  return <Animated.View style={style} className="h-full rounded-full bg-primary" />;
}

export interface TopHabitEntry {
  habit: Habit;
  completed: number;
  scheduled: number;
  rate: number;
}

export default function TopHabitsCard({ entries }: { entries: TopHabitEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <Animated.View entering={FadeIn.duration(320).delay(80)} className="mt-4 rounded-2xl border border-border bg-surface p-5">
      <View className="mb-4 flex-row items-center justify-center gap-2">
        <Ionicons name="trophy" size={20} color="#EAB308" />
        <Text className="text-lg font-bold text-text">Top 5 This Month</Text>
      </View>
      {entries.map((e, idx) => (
        <Animated.View
          key={e.habit.id}
          entering={FadeIn.duration(280).delay(idx * 60)}
          className={`flex-row items-center gap-3 py-3 ${idx < entries.length - 1 ? 'border-b border-border/50' : ''}`}>
          <View
            className="h-10 w-10 items-center justify-center rounded-xl border border-border"
            style={{ backgroundColor: `${getIconColor(e.habit.icon)}20` }}>
            <Ionicons name={e.habit.icon as any} size={20} color={getIconColor(e.habit.icon)} />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text numberOfLines={1} className="text-base font-bold text-text">
                {toTitleCase(e.habit.name)}
              </Text>
              <Text className="text-sm font-medium text-secondary">
                {e.completed}/{e.scheduled}
              </Text>
            </View>
            <View className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full border border-border/50 bg-background">
              <AnimatedBar rate={e.rate} delay={idx * 120} />
            </View>
          </View>
          <Text className="w-12 text-right text-base font-bold text-primary">{Math.round(e.rate * 100)}%</Text>
        </Animated.View>
      ))}
    </Animated.View>
  );
}
