import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';

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

export default function HabitCardSkeleton() {
  return (
    <View className="mb-3 rounded-2xl border border-border bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <View className="mr-3 flex-1 flex-row items-center">
          <Pulse>
            <View className="mr-3 h-12 w-12 rounded-xl bg-border" />
          </Pulse>
          <View className="flex-1 gap-2">
            <View className="flex-row items-center gap-2">
              <Pulse>
                <View className="h-4 w-32 rounded bg-border" />
              </Pulse>
              <Pulse>
                <View className="h-3 w-16 rounded bg-border/60" />
              </Pulse>
            </View>
            <View className="flex-row items-center gap-3">
              <Pulse>
                <View className="h-3 w-16 rounded bg-border/60" />
              </Pulse>
              <Pulse>
                <View className="h-3 w-20 rounded bg-border/60" />
              </Pulse>
              <Pulse>
                <View className="h-3 w-3 rounded-full bg-border/60" />
              </Pulse>
            </View>
          </View>
        </View>
        <Pulse>
          <View className="h-9 w-9 rounded-full bg-border" />
        </Pulse>
      </View>
    </View>
  );
}

export function HabitCardListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <HabitCardSkeleton key={i} />
      ))}
    </View>
  );
}
