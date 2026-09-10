// components/SegmentedToggle.tsx
import { useEffect } from 'react';
import { View, Pressable, LayoutChangeEvent, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolateColor,
  SharedValue,
} from 'react-native-reanimated';
import { Colors } from '../constants/Colors';

interface Props<T extends string> {
  options: T[];
  value: T;
  onChange: (val: T) => void;
  height?: number;
  fullWidth?: boolean;
}

const V_PADDING = 4;
const ACTIVE_TEXT = Colors.text;
const INACTIVE_TEXT = Colors.secondary;
const SPRING = { damping: 18, stiffness: 180, mass: 0.6 };

export default function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  height = 48,
  fullWidth = true,
}: Props<T>) {
  const activeIndex = Math.max(0, options.indexOf(value));

  const segmentWidth = useSharedValue(0);
  const progress = useSharedValue(activeIndex);

  // Toggle-driven movement — the ONLY thing that should touch progress on activeIndex change
  useEffect(() => {
    progress.value = withSpring(activeIndex, SPRING);
  }, [activeIndex, progress]);

  const onContainerLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    const seg = (w - V_PADDING * 2) / options.length;
    if (seg > 0) segmentWidth.value = seg;
  };

  const handlePress = (option: T) => onChange(option);

  const indicatorStyle = useAnimatedStyle<ViewStyle>(() => ({
    width: `${100 / options.length}%`,
    // percentage-based position, no measurement wait — paints correctly on first frame
    transform: [{ translateX: `${progress.value * 100}%` }],
  }));

  return (
    <View
      className="flex-row bg-surface border border-border rounded-2xl mb-6 self-stretch"
      style={{ height, padding: V_PADDING }}
      onLayout={onContainerLayout}
    >
      <Animated.View
        className="rounded-xl"
        style={[
          indicatorStyle,
          { position: 'absolute', top: V_PADDING, bottom: V_PADDING, left: V_PADDING, backgroundColor: Colors.primary },
        ]}
      />
      {options.map((option, index) => (
        <ToggleSegment
          key={option}
          option={option}
          index={index}
          options={options}
          progress={progress}
          onPress={() => handlePress(option)}
        />
      ))}
    </View>
  );
}

function ToggleSegment<T extends string>({
  option,
  index,
  options,
  progress,
  onPress,
}: {
  option: T;
  index: number;
  options: T[];
  progress: SharedValue<number>;
  onPress: () => void;
}) {
  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      options.map((_, i) => i),
      options.map((_, i) => (i === index ? ACTIVE_TEXT : INACTIVE_TEXT))
    ),
  }));

  return (
    <Pressable onPress={onPress} className="flex-1 items-center justify-center z-10">
      <Animated.Text className="text-sm font-bold" style={textStyle}>
        {option.charAt(0).toUpperCase() + option.slice(1)}
      </Animated.Text>
    </Pressable>
  );
}
