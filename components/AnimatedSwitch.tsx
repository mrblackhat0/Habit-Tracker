import React from 'react';
import { Pressable, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolateColor,
} from 'react-native-reanimated';
import { Colors } from '../constants/Colors';

interface AnimatedSwitchProps {
  value: boolean;
  onValueChange: (val: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

const SPRING = { damping: 18, stiffness: 220, mass: 0.45 } as const;
const TRACK_W = 48;
const TRACK_H = 28;
const THUMB = 22;
const PAD = 3;

export default function AnimatedSwitch({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
}: AnimatedSwitchProps) {
  const progress = useSharedValue(value ? 1 : 0);

  // assign outside useEffect so Tabs re-mount (where useEffect timing differs) still animates — mirrors working habit/[id] path
  progress.value = withSpring(value ? 1 : 0, SPRING);

  const trackStyle = useAnimatedStyle<ViewStyle>(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['#2A2A35', Colors.primary]),
    borderColor: interpolateColor(progress.value, [0, 1], ['#2A2A3599', Colors.primary]),
  }));

  const thumbStyle = useAnimatedStyle<ViewStyle>(() => ({
    transform: [{ translateX: progress.value * (TRACK_W - THUMB - PAD * 2) }],
    backgroundColor: interpolateColor(progress.value, [0, 1], ['#94A3B8', '#FFFFFF']),
  }));

  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      disabled={disabled}
      hitSlop={12}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      style={{ minHeight: 44, minWidth: 56, justifyContent: 'center', alignItems: 'center', opacity: disabled ? 0.5 : 1 }}
    >
      <Animated.View
        style={[
          trackStyle,
          {
            width: TRACK_W,
            height: TRACK_H,
            borderRadius: TRACK_H / 2,
            padding: PAD,
            borderWidth: 1,
            justifyContent: 'center',
          },
        ]}
      >
        <Animated.View
          style={[
            thumbStyle,
            {
              width: THUMB,
              height: THUMB,
              borderRadius: THUMB / 2,
              shadowColor: '#000',
              shadowOpacity: 0.18,
              shadowRadius: 2,
              shadowOffset: { width: 0, height: 1 },
              elevation: 2,
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}
