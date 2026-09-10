import React, { useEffect } from 'react';
import { View, ScrollView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

function Pulse({ children }: { children: React.ReactNode }) {
  const opacity = useSharedValue(0.4);
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.85, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export default function MonthlyHabitsTrackerSkeleton({
  daysInMonth = 30,
  habitCount = 5,
}: {
  daysInMonth?: number;
  habitCount?: number;
}) {
  const weeksCount = Math.ceil(daysInMonth / 7);
  const rowCount = Math.max(1, habitCount || 5);

  return (
    <View className="w-full flex-1 bg-transparent py-2">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Header Skeleton */}
          <View className="mb-2 flex-row items-end">
            <View className="mr-3 w-32 flex-row items-center gap-1.5 self-end rounded-xl border border-border bg-surface px-3 py-2">
              <Pulse>
                <View className="h-4 w-20 rounded bg-border" />
              </Pulse>
            </View>
            <View className="flex-row items-end">
              {Array.from({ length: weeksCount }).map((_, weekIdx) => (
                <View key={weekIdx} className="flex-row items-end">
                  <View className="items-center">
                    <Pulse>
                      <View className="mb-1.5 h-3 w-12 rounded bg-border/60" />
                    </Pulse>
                    {/* Day Names Row */}
                    <View className="mb-1 flex-row gap-2">
                      {Array.from({ length: 7 }).map((_, dIdx) => (
                        <Pulse key={dIdx}>
                          <View className="h-3 w-5 rounded bg-border/40" />
                        </Pulse>
                      ))}
                    </View>
                    {/* Day Numbers Row */}
                    <View className="flex-row gap-2">
                      {Array.from({ length: 7 }).map((_, dIdx) => (
                        <Pulse key={dIdx}>
                          <View className="h-3.5 w-5 rounded bg-border/50" />
                        </Pulse>
                      ))}
                    </View>
                  </View>
                  {weekIdx < weeksCount - 1 && (
                    <View className="mx-2 h-full w-[1.5px] self-stretch rounded-full bg-border/30" />
                  )}
                </View>
              ))}
              <View className="mx-2 h-full w-[1.5px] self-stretch rounded-full bg-border/30" />
              <View className="flex-row items-end gap-2 self-end pb-1 pl-1">
                <Pulse>
                  <View className="h-8 w-6 rounded bg-border/40" />
                </Pulse>
                <Pulse>
                  <View className="h-8 w-6 rounded bg-border/40" />
                </Pulse>
                <Pulse>
                  <View className="h-8 w-24 rounded bg-border/40" />
                </Pulse>
              </View>
            </View>
          </View>

          {/* Rows Skeleton */}
          <View className="gap-2.5 pt-1">
            {Array.from({ length: rowCount }).map((_, rowIdx) => (
              <View key={rowIdx} className="flex-row items-center py-1">
                <View className="mr-3 w-32 flex-row items-center gap-2">
                  <Pulse>
                    <View className="h-5 w-5 rounded-lg bg-border" />
                  </Pulse>
                  <Pulse>
                    <View className="h-3.5 w-20 rounded bg-border/60" />
                  </Pulse>
                </View>
                <View className="flex-row items-center">
                  {Array.from({ length: weeksCount }).map((_, weekIdx) => (
                    <View key={weekIdx} className="flex-row items-center">
                      <View className="flex-row gap-2">
                        {Array.from({ length: 7 }).map((_, dIdx) => (
                          <Pulse key={dIdx}>
                            <View className="h-5 w-5 rounded-full bg-border/30" />
                          </Pulse>
                        ))}
                      </View>
                      {weekIdx < weeksCount - 1 && (
                        <View className="mx-2 h-5 w-[1.5px] rounded-full bg-border/30" />
                      )}
                    </View>
                  ))}
                  <View className="mx-2 h-5 w-[1.5px] rounded-full bg-border/30" />
                  <View className="flex-row items-center gap-2 pl-1">
                    <Pulse>
                      <View className="h-4 w-6 rounded bg-border/40" />
                    </Pulse>
                    <Pulse>
                      <View className="h-4 w-6 rounded bg-border/40" />
                    </Pulse>
                    <Pulse>
                      <View className="h-4 w-24 rounded-full bg-border/40" />
                    </Pulse>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
