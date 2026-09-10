import { View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { useEffect } from 'react';

function Pulse({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export default function TopHabitsCardSkeleton() {
  return (
    <View className="mt-4 rounded-2xl border border-border bg-surface p-5">
      <View className="mb-4 flex-row items-center justify-center gap-2">
        <View className="h-5 w-5 rounded bg-border/60" />
        <View className="h-4 w-32 rounded bg-border/60" />
      </View>
      {Array.from({ length: 5 }).map((_, idx) => (
        <View
          key={idx}
          className={`flex-row items-center gap-3 py-3 ${idx < 4 ? 'border-b border-border/50' : ''}`}>
          <Pulse delay={idx * 80}>
            <View className="h-10 w-10 rounded-xl bg-border/50" />
          </Pulse>
          <View className="flex-1 gap-2">
            <View className="flex-row items-center gap-2">
              <Pulse><View className="h-4 w-24 rounded bg-border/50" /></Pulse>
              <Pulse><View className="h-3 w-12 rounded bg-border/50" /></Pulse>
            </View>
            <Pulse><View className="mt-1 h-2.5 w-full rounded-full bg-border/50" /></Pulse>
          </View>
          <Pulse><View className="h-4 w-10 rounded bg-border/50" /></Pulse>
        </View>
      ))}
    </View>
  );
}
