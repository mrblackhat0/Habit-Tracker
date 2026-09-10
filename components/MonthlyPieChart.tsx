import { View, Text } from 'react-native';
import { useEffect } from 'react';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withTiming, Easing, FadeIn } from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  completed: number;
  scheduled: number;
  size?: number;
  strokeWidth?: number;
}

export default function MonthlyPieChart({ completed, scheduled, size = 148, strokeWidth = 16 }: Props) {
  const rate = scheduled ? completed / scheduled : 0;
  const pct = Math.round(rate * 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(rate, { duration: 400, easing: Easing.out(Easing.cubic) });
  }, [rate]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const remaining = Math.max(0, scheduled - completed);

  return (
    <Animated.View entering={FadeIn.duration(200)} className="mt-4 rounded-2xl border border-border bg-surface p-5 items-center">
      <Text className="text-base font-bold text-text mb-4">Monthly Overview</Text>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#27272a"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#10b981"
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={`${circumference} ${circumference}`}
            animatedProps={animatedProps}
            strokeLinecap="round"
          />
        </Svg>
        <View className="absolute items-center">
          <Text className="text-2xl font-extrabold text-text">{pct}%</Text>
          <Text className="text-xs font-medium text-textMuted">
            {completed}/{scheduled}
          </Text>
        </View>
      </View>
      <View className="mt-4 flex-row gap-4">
        <View className="flex-row items-center gap-2">
          <View className="h-3 w-3 rounded-full bg-positive" />
          <Text className="text-xs font-semibold text-text">Completed {completed}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <View className="h-3 w-3 rounded-full bg-border" />
          <Text className="text-xs font-semibold text-textMuted">Remaining {remaining}</Text>
        </View>
      </View>
      <Text className="mt-2 text-xs text-textMuted text-center">
        {scheduled ? `${remaining} habits left in ${pct < 100 ? 'this month' : 'perfect month!'}` : 'No scheduled habits this month'}
      </Text>
    </Animated.View>
  );
}
