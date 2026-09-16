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
import { Colors, DataColors } from '@/constants/Colors';
import { getIconColor } from '@/constants/Icons';
import { HabitCardItem } from './HabitCard';

interface UncompleteConfirmModalProps {
  visible: boolean;
  habit: HabitCardItem | null;
  onClose: () => void;
  onConfirm: (habit: HabitCardItem) => void;
  onReset: (habit: HabitCardItem) => void;
}

export const UncompleteConfirmModal: React.FC<UncompleteConfirmModalProps> = ({
  visible,
  habit,
  onClose,
  onConfirm,
  onReset,
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

  if (!isMounted || !habit) return null;

  let progressText = '';
  if (habit.progressType === 'duration' && habit.goalMinutes) {
    progressText = `${Math.floor(habit.loggedMinutes ?? 0)} / ${habit.goalMinutes} mins`;
  } else if (habit.progressType === 'quantity' && habit.goalQty) {
    progressText = `${habit.loggedQty ?? 0} / ${habit.goalQty} ${habit.unit || ''}`;
  }

  const isReset =
    habit.progressType === 'duration'
      ? (habit.loggedMinutes ?? 0) >= (habit.goalMinutes ?? Infinity)
      : habit.progressType === 'quantity'
        ? (habit.loggedQty ?? 0) >= (habit.goalQty ?? Infinity)
        : false; // check-off type doesn't use this reset logic

  return (
    <Modal visible={isMounted} transparent animationType="none" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View style={backdropStyle} className="flex-1 justify-end bg-black/60">
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <Animated.View
              style={sheetStyle}
              className="items-center rounded-t-3xl border-t border-border bg-surface px-6 pb-8 pt-4 shadow-2xl">
              <View className="mb-4 h-1 w-10 self-center rounded-full bg-border" />
              <View className="mb-4 items-center">
                <Ionicons name="refresh-circle-outline" size={40} color={DataColors.danger} />
                <Text className="mt-2 text-xl font-bold text-text">Reset Progress?</Text>
              </View>
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
                    <Text className="mt-0.5 text-xs font-semibold text-danger">
                      Completed • {progressText}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Text className="mb-6 px-2 text-center text-xs leading-5 text-textMuted">
                This habit is marked as completed. Uncompleting will {isReset?'reset your logged progress to 0.':'just mark this habit as pending'}. Do you want to continue?
              </Text>
              <View className="w-full flex-row gap-3">
                <Pressable
                  onPress={handleClose}
                  className="flex-1 items-center rounded-2xl border border-secondary/10 bg-secondary/5 py-3.5 active:opacity-80">
                  <Text className="text-sm font-semibold text-secondary">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    isReset ? onReset(habit) : onConfirm(habit);
                    handleClose();
                  }}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl border ${isReset ? 'border-danger/30 bg-danger/5' : 'border-primary/30 bg-primary/5'} py-3.5 active:opacity-90`}>
                  <Ionicons name="refresh" size={18} color={isReset?'#f43f5e':Colors.primary} />
                  <Text className={`text-sm font-bold ${isReset ? 'text-danger' : 'text-primary'}`}>
                    {isReset ? 'Reset & Uncomplete' : 'Mark Uncomplete'}
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default UncompleteConfirmModal;
