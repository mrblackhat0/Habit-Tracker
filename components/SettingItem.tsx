import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

type RightKind = 'switch' | 'chevron' | 'value' | 'custom';

interface SettingItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  subtitle?: string;
  rightKind?: RightKind;
  rightValue?: string;
  accessibilityLabel?: string;
  onPress?: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
  testID?: string;
}

export default function SettingItem({
  icon,
  iconColor,
  title,
  subtitle,
  rightKind = 'chevron',
  rightValue,
  accessibilityLabel,
  onPress,
  disabled,
  children,
  testID,
}: SettingItemProps) {
  const isPressable = Boolean(onPress) && !disabled;

  const renderRight = () => {
    if (children) return <>{children}</>;
    if (rightKind === 'switch') return null; // caller passes AnimatedSwitch as children
    if (rightKind === 'value' && rightValue) {
      return (
        <View className="flex-row items-center gap-1.5">
          <Text className="text-xs font-semibold text-secondary" numberOfLines={1}>
            {rightValue}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.secondary} />
        </View>
      );
    }
    if (rightKind === 'chevron') {
      return <Ionicons name="chevron-forward" size={16} color={Colors.secondary} />;
    }
    return null;
  };

  const content = (
    <View className="flex-row items-center px-3.5 py-3.5">
      <View
        className="mr-3 h-10 w-10 items-center justify-center rounded-xl border border-border"
        style={{ backgroundColor: `${iconColor}14` }}
        accessibilityElementsHidden
      >
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View className="flex-1 pr-3">
        <Text className="text-[15px] font-semibold leading-5 text-text" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-0.5 text-xs leading-4 text-secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {renderRight()}
    </View>
  );

  if (isPressable) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityHint={subtitle}
        hitSlop={4}
        testID={testID}
        className="active:opacity-70"
        style={{ minHeight: 56 }}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View accessibilityLabel={accessibilityLabel ?? title} testID={testID} style={{ minHeight: 56 }}>
      {content}
    </View>
  );
}

export function SettingDivider() {
  return <View className="ml-[58px] h-[1px] bg-border/60" />;
}
