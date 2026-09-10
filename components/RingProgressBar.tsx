import { useEffect, useState, useRef } from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withTiming, Easing } from 'react-native-reanimated';

type RingProgressProps = {
  percent: number;
  size?: number;
  strokeWidth?: number;
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function RingProgress({ percent, size = 50, strokeWidth = 6 }: RingProgressProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent || 0)));
  const RING_SIZE = size;
  const STROKE_WIDTH = strokeWidth;
  const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const progress = useSharedValue(0);
  const [displayPercent, setDisplayPercent] = useState(0);
  const displayRef = useRef(0);

  useEffect(() => {
    // animate progress value smoothly on UI thread
    progress.value = withTiming(clamped, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });

    // text count-up animation on JS thread
    const start = displayRef.current;
    if (start === clamped) {
      setDisplayPercent(clamped);
      return;
    }
    const startTime = Date.now();
    const duration = 800;
    let raf: number | null = null;
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3); // cubicOut
      const val = Math.round(start + (clamped - start) * eased);
      setDisplayPercent(val);
      displayRef.current = val;
      if (t < 1) {
        raf = requestAnimationFrame(tick) as unknown as number;
      } else {
        setDisplayPercent(clamped);
        displayRef.current = clamped;
      }
    };
    raf = requestAnimationFrame(tick) as unknown as number;
    return () => {
      if (raf) cancelAnimationFrame(raf as any);
    };
  }, [clamped, progress]);

  const animatedCircleProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value / 100),
  }));

  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE }} className="items-center justify-center">
      <Svg width={RING_SIZE} height={RING_SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE_WIDTH}
          stroke="rgba(255,255,255,0.08)"
          fill="none"
        />
        <AnimatedCircle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE_WIDTH}
          stroke="#6366f1"
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeLinecap="round"
          animatedProps={animatedCircleProps}
        />
      </Svg>
      <View className="absolute items-center justify-center">
        <Text className="text-sm font-bold text-primary">{displayPercent}%</Text>
      </View>
    </View>
  );
}

export default RingProgress;
