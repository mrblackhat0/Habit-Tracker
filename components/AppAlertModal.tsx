import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Modal, Pressable, TouchableWithoutFeedback } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors, DataColors } from '@/constants/Colors';

type AlertType = 'info' | 'success' | 'warning' | 'error' | 'danger';

interface AppAlertModalProps {
  visible: boolean;
  title: string;
  message?: string;
  type?: AlertType;
  primaryText?: string;
  secondaryText?: string;
  onClose: () => void;
  onPrimary?: () => void;
  destructive?: boolean;
}

const typeConfig: Record<
  AlertType,
  { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
> = {
  info: { icon: 'information-circle-outline', color: Colors.primary, bg: `${Colors.primary}15` },
  success: {
    icon: 'checkmark-circle-outline',
    color: DataColors.positive,
    bg: `${DataColors.positive}15`,
  },
  warning: { icon: 'warning-outline', color: DataColors.warning, bg: `${DataColors.warning}15` },
  error: { icon: 'alert-circle-outline', color: DataColors.danger, bg: `${DataColors.danger}15` },
  danger: { icon: 'trash-outline', color: DataColors.danger, bg: `${DataColors.danger}15` },
};

export const AppAlertModal: React.FC<AppAlertModalProps> = ({
  visible,
  title,
  message,
  type = 'info',
  primaryText = 'OK',
  secondaryText,
  onClose,
  onPrimary,
  destructive = false,
}) => {
  const [isMounted, setIsMounted] = useState(visible);
  const backdropOpacity = useSharedValue(0);
  const sheetTranslateY = useSharedValue(400);

  const handleClose = useCallback(() => {
    backdropOpacity.value = withTiming(0, { duration: 200 });
    sheetTranslateY.value = withTiming(400, { duration: 200 }, (finished) => {
      if (finished) {
        runOnJS(setIsMounted)(false);
        runOnJS(onClose)();
      }
    });
  }, [onClose, backdropOpacity, sheetTranslateY]);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      backdropOpacity.value = withTiming(1, { duration: 250 });
      sheetTranslateY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.8 });
    } else if (isMounted) {
      backdropOpacity.value = withTiming(0, { duration: 200 });
      sheetTranslateY.value = withTiming(400, { duration: 200 }, (finished) => {
        if (finished) runOnJS(setIsMounted)(false);
      });
    }
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  if (!isMounted) return null;

  const cfg = typeConfig[type];

  return (
    <Modal visible={isMounted} transparent animationType="none" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View style={backdropStyle} className="flex-1 justify-end bg-black/60">
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <Animated.View
              style={sheetStyle}
              className="items-center rounded-t-3xl border-t border-border bg-surface px-6 pb-8 pt-4 shadow-2xl">
              <View className="mb-8 h-1 w-10 self-center rounded-full bg-border" />
              <View className="mb-4 items-center">
                <View
                  className="h-12 w-12 items-center justify-center rounded-2xl border border-border"
                  style={{ backgroundColor: cfg.bg }}>
                  <Ionicons name={cfg.icon} size={28} color={cfg.color} />
                </View>
                <Text className="mt-3 text-center text-xl font-bold text-text">{title}</Text>
                {message ? (
                  <Text className="mt-2 px-2 text-center text-xs leading-5 text-textMuted">
                    {message}
                  </Text>
                ) : null}
              </View>

              <View className="mt-4 w-full flex-row gap-3">
                {secondaryText ? (
                  <Pressable
                    onPress={handleClose}
                    className="flex-1 items-center rounded-2xl border border-border bg-background py-3.5 active:opacity-80">
                    <Text className="text-sm font-semibold text-text">{secondaryText}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => {
                    if (onPrimary) onPrimary();
                    handleClose();
                  }}
                  className={`flex-1 items-center justify-center rounded-2xl py-3.5 active:opacity-90 ${destructive ? 'bg-danger' : 'bg-primary'}`}>
                  <Text className="text-sm font-bold text-white">{primaryText}</Text>
                </Pressable>
              </View>
              {!secondaryText ? (
                <Pressable
                  onPress={handleClose}
                  className="mt-3 w-full items-center py-2 active:opacity-70">
                  <Text className="text-xs font-semibold text-textMuted">Dismiss</Text>
                </Pressable>
              ) : null}
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default AppAlertModal;
