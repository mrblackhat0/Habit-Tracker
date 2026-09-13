import React, { useEffect, useState, useCallback } from 'react';
import { toTitleCase } from '@/utils/utils';
import { View, Text, Modal, Pressable, TouchableWithoutFeedback } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { DataColors } from '@/constants/Colors';
import { getIconColor } from '@/constants/Icons';
import { HabitCardItem } from './HabitCard';

interface CompletionConfirmModalProps {
  visible: boolean;
  habit: HabitCardItem | null;
  onClose: () => void;
  onConfirm: (habit: HabitCardItem) => void;
}

export const CompletionConfirmModal: React.FC<CompletionConfirmModalProps> = ({
  visible,
  habit,
  onClose,
  onConfirm,
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

  if (!isMounted || !habit) return null;

  let progressText = '';
  if (habit.progressType === 'duration' && habit.goalMinutes) {
    progressText = `${Math.floor(habit.loggedMinutes ?? 0)} / ${habit.goalMinutes} mins`;
  } else if (habit.progressType === 'quantity' && habit.goalQty) {
    progressText = `${habit.loggedQty ?? 0} / ${habit.goalQty} ${habit.unit || ''}`;
  }

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

              {/* Warning Header */}
              <View className="mb-4 items-center">
                <Ionicons name="alert-circle-outline" size={40} color={DataColors.warning} />
                <Text className="mt-2 text-xl font-bold text-text">Goal Not Reached</Text>
              </View>

              {/* Habit Summary Card */}
              <View className="mb-4 w-full flex-row items-center rounded-2xl border border-border bg-background p-4">
                <View
                  className="mr-3 h-10 w-10 items-center justify-center rounded-xl border border-border"
                  style={{ backgroundColor: `${getIconColor(habit.icon)}20` }}>
                  <Ionicons name={habit.icon as any} size={20} color={getIconColor(habit.icon)} />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-text" numberOfLines={1}>
                    {toTitleCase(habit.name)}
                  </Text>
                  {progressText ? (
                    <Text className="mt-0.5 text-xs font-semibold text-warning">
                      Logged {progressText}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Detailed prompt text */}
              <Text className="mb-6 px-2 text-center text-xs leading-5 text-textMuted">
                You haven&apos;t reached your daily goal yet. Would you like to mark this habit as
                complete anyway?
              </Text>

              {/* Action Buttons */}
              <View className="w-full flex-row gap-3">
                <Pressable
                  onPress={handleClose}
                  className="flex-1 items-center rounded-2xl border border-secondary/10 bg-secondary/5 py-3.5 active:opacity-80">
                  <Text className="text-sm font-semibold text-secondary">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    onConfirm(habit);
                    handleClose();
                  }}
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-primary py-3.5 active:opacity-90">
                  <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                  <Text className="text-sm font-bold text-white">Mark Complete</Text>
                </Pressable>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default CompletionConfirmModal;
