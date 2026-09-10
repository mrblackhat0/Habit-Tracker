import React, { useEffect, useState, useCallback } from 'react';
import { toTitleCase } from '@/utils/utils';
import { View, Text, Modal, Pressable, TouchableWithoutFeedback } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { DataColors } from '@/constants/Colors';
import { getIconColor } from '@/constants/Icons';
import { HabitCardItem } from './HabitCard';

interface UncompleteConfirmModalProps {
  visible: boolean;
  habit: HabitCardItem | null;
  onClose: () => void;
  onConfirm: (habit: HabitCardItem) => void;
}

export const UncompleteConfirmModal: React.FC<UncompleteConfirmModalProps> = ({ visible, habit, onClose, onConfirm }) => {
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
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetTranslateY.value }] }));

  if (!isMounted || !habit) return null;

  let progressText = '';
  if (habit.progressType === 'duration' && habit.goalMinutes) {
    progressText = `${habit.loggedMinutes ?? 0} / ${habit.goalMinutes} mins`;
  } else if (habit.progressType === 'quantity' && habit.goalQty) {
    progressText = `${habit.loggedQty ?? 0} / ${habit.goalQty} ${habit.unit || ''}`;
  }

  return (
    <Modal visible={isMounted} transparent animationType="none" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View style={backdropStyle} className="flex-1 bg-black/60 justify-end">
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <Animated.View style={sheetStyle} className="bg-surface border-t border-border rounded-t-3xl px-6 pt-4 pb-8 shadow-2xl items-center">
              <View className="w-10 h-1 bg-border rounded-full self-center mb-4" />
              <View className="items-center mb-4">
                <Ionicons name="refresh-circle-outline" size={40} color={DataColors.danger} />
                <Text className="text-text text-xl font-bold mt-2">Reset Progress?</Text>
              </View>
              <View className="w-full flex-row items-center bg-background border border-border rounded-2xl p-4 mb-4">
                <View className="w-10 h-10 rounded-xl items-center justify-center border border-border mr-3" style={{ backgroundColor: `${getIconColor(habit.icon)}20` }}>
                  <Ionicons name={habit.icon as any} size={20} color={getIconColor(habit.icon)} />
                </View>
                <View className="flex-1">
                  <Text className="text-text font-bold text-base" numberOfLines={1}>{toTitleCase(habit.name)}</Text>
                  {progressText ? <Text className="text-danger text-xs font-semibold mt-0.5">Completed • {progressText}</Text> : null}
                </View>
              </View>
              <Text className="text-textMuted text-xs text-center px-2 leading-5 mb-6">
                This habit is marked as completed. Uncompleting will reset your logged progress to 0. Do you want to continue?
              </Text>
              <View className="flex-row gap-3 w-full">
                <Pressable onPress={handleClose} className="flex-1 bg-background border border-border py-3.5 rounded-2xl items-center active:opacity-80">
                  <Text className="text-text font-semibold text-sm">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    onConfirm(habit);
                    handleClose();
                  }}
                  className="flex-1 bg-danger py-3.5 rounded-2xl items-center flex-row justify-center gap-1.5 active:opacity-90">
                  <Ionicons name="refresh" size={18} color="#FFFFFF" />
                  <Text className="text-white font-bold text-sm">Reset & Uncomplete</Text>
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
