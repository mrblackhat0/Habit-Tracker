import { View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { useEffect } from 'react';

function Pulse({ children }: { children: React.ReactNode }) {
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export default function MonthlyPieChartSkeleton() {
  return (
    <View className="mt-4 rounded-2xl border border-border bg-surface p-5 items-center">
      <Pulse>
        <View className="mb-4 h-4 w-32 rounded bg-border/60" />
      </Pulse>
      <Pulse>
        <View className="h-36 w-36 rounded-full border-8 border-border/50 bg-border/20" />
      </Pulse>
      <View className="mt-4 flex-row gap-4">
        <View className="flex-row items-center gap-2">
          <Pulse>
            <View className="h-3 w-3 rounded-full bg-border/60" />
          </Pulse>
          <Pulse>
            <View className="h-3 w-20 rounded bg-border/50" />
          </Pulse>
        </View>
        <View className="flex-row items-center gap-2">
          <Pulse>
            <View className="h-3 w-3 rounded-full bg-border/40" />
          </Pulse>
          <Pulse>
            <View className="h-3 w-20 rounded bg-border/40" />
          </Pulse>
        </View>
      </View>
      <Pulse>
        <View className="mt-2 h-3 w-48 rounded bg-border/30" />
      </Pulse>
    </View>
  );
}
