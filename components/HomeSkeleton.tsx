import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { HabitCardListSkeleton } from './HabitCardSkeleton';

function Pulse({ children }: { children: React.ReactNode }) {
  const opacity = useSharedValue(0.45);
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export const GreetingHeaderSkeleton = () => (
  <View className="mb-4 mt-4 flex-row items-center gap-3 px-1">
    <Pulse>
      <View className="h-14 w-14 rounded-full bg-border" />
    </Pulse>
    <View className="flex-1 gap-2">
      <Pulse>
        <View className="h-5 w-48 rounded bg-border" />
      </Pulse>
      <Pulse>
        <View className="h-3 w-36 rounded bg-border/70" />
      </Pulse>
    </View>
  </View>
);

export const ProgressSkeleton = () => (
  <Pulse>
    <View className="rounded-2xl border border-border bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <View className="gap-2">
          <View className="h-4 w-32 rounded bg-border" />
          <View className="h-3 w-24 rounded bg-border/70" />
        </View>
        <View className="h-14 w-14 rounded-full border-4 border-border" />
      </View>
    </View>
  </Pulse>
);

export const WeekStripSkeleton = () => {
  const opacity = useSharedValue(0.45);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <View className="mb-4 flex-row justify-between gap-1.5">
      {Array.from({ length: 7 }).map((_, i) => (
        <Animated.View key={i} style={[style, { flex: 1 }]}>
          <View className="h-14 w-full rounded-xl bg-border/60" />
        </Animated.View>
      ))}
    </View>
  );
};

export default function HomeSkeleton() {
  return (
    <View className="flex-1" style={{ gap: 16 }}>
      {/* Greeting header */}
      {/* <GreetingHeaderSkeleton /> */}

      {/* Today's Progress */}
      <ProgressSkeleton />

      {/* Week strip */}
      <WeekStripSkeleton />

      {/* Habit cards */}
      <HabitCardListSkeleton count={8} />
    </View>
  );
}
