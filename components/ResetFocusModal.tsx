import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, Modal, TouchableWithoutFeedback } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { hapticImpact, hapticNotification } from '@/utils/haptics';
import { formatDuration } from '@/utils/utils';
import { Colors, DataColors } from '../constants/Colors';

interface ResetFocusModalProps {
  visible: boolean;
  habitName: string;
  todayLoggedMs: number;
  currentMode: 'timer' | 'stopwatch';
  onClose: () => void;
  onResetUi: () => void;
  onClearDb: () => void;
}

export default function ResetFocusModal({
  visible,
  habitName,
  todayLoggedMs,
  currentMode,
  onClose,
  onResetUi,
  onClearDb,
}: ResetFocusModalProps) {
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
        if (finished) {
          runOnJS(setIsMounted)(false);
        }
      });
    }
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  if (!isMounted) return null;

  return (
    <Modal visible={isMounted} transparent animationType="none" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View style={backdropStyle} className="flex-1 justify-end bg-black/60">
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <Animated.View
              style={sheetStyle}
              className="items-center rounded-t-3xl border-t border-border bg-surface px-6 pb-8 pt-4 shadow-2xl">
              {/* Drag handle pill */}
              <View className="mb-4 h-1 w-10 self-center rounded-full bg-border" />

              {/* Header */}
              <View className="mb-4 items-center">
                <Ionicons name="refresh-circle-outline" size={40} color={DataColors.info} />
                <Text className="mt-2 text-xl font-bold text-text">Reset Session Options</Text>
                <Text className="mt-0.5 text-xs text-textMuted">
                  &quot;{habitName}&quot; • {formatDuration(todayLoggedMs)} logged today
                </Text>
              </View>

              {/* Options */}
              <View className="mb-4 w-full gap-3">
                {/* Option 1: Reset UI Only */}
                <Pressable
                  onPress={() => {
                    hapticImpact();
                    onResetUi();
                    handleClose();
                  }}
                  className="flex-row items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3 active:opacity-80">
                  <View className="h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
                    <Ionicons name="reload-outline" size={20} color={Colors.primary} />
                  </View>
                  <View className="">
                    <Text className="text-base font-bold text-primary">
                      Reset {currentMode === 'timer' ? 'Timer' : 'Stopwatch'}
                    </Text>
                    <Text className="text-xs leading-4 text-textMuted">
                      Restarts from the beginning — your {formatDuration(todayLoggedMs)} history stays saved.
                    </Text>
                  </View>
                </Pressable>

                {/* Option 2: Clear Logged Minutes */}
                <Pressable
                  onPress={() => {
                    hapticNotification(Haptics.NotificationFeedbackType.Warning);
                    onClearDb();
                    handleClose();
                  }}
                  className="flex-row items-center gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-3 active:opacity-80">
                  <View className="h-10 w-10 items-center justify-center rounded-xl border border-danger/30 bg-danger/10">
                    <Ionicons name="trash-outline" size={20} color={DataColors.danger} />
                  </View>
                  <View className="">
                    <Text className="text-base font-bold text-danger">Reset Logged Minutes</Text>
                    <Text className="text-xs leading-4 text-textMuted">
                      Wipes today&apos;s {formatDuration(todayLoggedMs)} from your history and restarts fresh.
                    </Text>
                  </View>
                </Pressable>
              </View>

              {/* Cancel Button */}
              <Pressable
                onPress={handleClose}
                className="w-full items-center rounded-2xl border border-border bg-secondary/5 py-3.5 active:opacity-80">
                <Text className="text-sm font-semibold text-secondary">Cancel</Text>
              </Pressable>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
