import React, { useState, useEffect, useCallback } from 'react';
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

interface HabitActionSheetProps {
  visible: boolean;
  habit: HabitCardItem | null;
  onClose: () => void;
  onEdit: (habit: HabitCardItem) => void;
  onDelete: (habit: HabitCardItem) => void;
  onArchive?: (habit: HabitCardItem) => void;
}

export const HabitActionSheet: React.FC<HabitActionSheetProps> = ({
  visible,
  habit,
  onClose,
  onEdit,
  onDelete,
  onArchive,
}) => {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
      setConfirmingDelete(false);
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

  return (
    <Modal visible={isMounted} transparent animationType="none" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View style={backdropStyle} className="flex-1 justify-end bg-black/60">
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <Animated.View
              style={sheetStyle}
              className="rounded-t-3xl border-t border-border bg-surface px-6 pb-8 pt-4 shadow-2xl">
              {/* Drag handle pill */}
              <View className="mb-4 h-1 w-10 self-center rounded-full bg-border" />

              {/* Habit Header */}
              <View className="mb-6 flex-row items-center border-b border-border pb-4">
                <View
                  className="mr-3 h-10 w-10 items-center justify-center rounded-xl border border-border"
                  style={{ backgroundColor: `${getIconColor(habit.icon)}20` }}>
                  <Ionicons name={habit.icon as any} size={20} color={getIconColor(habit.icon)} />
                </View>
                <View className="flex-1">
                  <Text className="text-lg font-bold text-text" numberOfLines={1}>
                    {toTitleCase(habit.name)}
                  </Text>
                  <Text className="text-xs capitalize text-textMuted">
                    {habit.progressType} • {habit.occurrence}
                  </Text>
                </View>
              </View>

              {!confirmingDelete ? (
                /* Action Options */
                <View className="gap-3">
                  {/* Archive */}
                  <Pressable
                    onPress={() => {
                      if (onArchive) onArchive(habit);
                      handleClose();
                    }}
                    className="flex-row items-center rounded-2xl border border-secondary/30 bg-secondary/5 p-4 active:opacity-80">
                    <Ionicons
                      name="archive-outline"
                      size={20}
                      color={Colors.secondary}
                      className="mr-3"
                    />
                    <Text className="ml-3 text-base font-semibold text-secondary">
                      {habit.archived ? 'Unarchive Habit' : 'Archive Habit'}
                    </Text>
                  </Pressable>

                  {/* Edit */}
                  <Pressable
                    onPress={() => {
                      onEdit(habit);
                      handleClose();
                    }}
                    className="flex-row items-center rounded-2xl border border-primary/30 bg-primary/5 p-4 active:opacity-80">
                    <Ionicons
                      name="create-outline"
                      size={20}
                      color={Colors.primary}
                      className="mr-3"
                    />
                    <Text className="ml-3 text-base font-semibold text-primary">Edit Habit</Text>
                  </Pressable>

                  {/* Delete */}
                  <Pressable
                    onPress={() => setConfirmingDelete(true)}
                    className="flex-row items-center rounded-2xl border border-danger/30 bg-danger/5 p-4 active:opacity-80">
                    <Ionicons
                      name="trash-outline"
                      size={20}
                      color={DataColors.danger}
                      className="mr-3"
                    />
                    <Text className="ml-3 text-base font-semibold text-danger">Delete Habit</Text>
                  </Pressable>
                </View>
              ) : (
                /* Inline Delete Confirmation */
                <View className="gap-4">
                  <View className="items-center py-2">
                    <Ionicons name="warning-outline" size={36} color={DataColors.danger} />
                    <Text className="mt-2 text-lg font-bold text-text">Delete this habit?</Text>
                    <Text className="mt-1 px-4 text-center text-xs text-textMuted">
                      This will permanently remove &quot;{toTitleCase(habit.name)}&quot; and all
                      associated log history.
                    </Text>
                  </View>

                  <View className="mt-2 flex-row gap-3">
                    <Pressable
                      onPress={() => setConfirmingDelete(false)}
                      className="flex-1 items-center rounded-xl border border-secondary/10 bg-secondary/5 py-3.5">
                      <Text className="text-sm font-semibold text-secondary">Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        onDelete(habit);
                        handleClose();
                      }}
                      className="flex-1 items-center rounded-xl border border-danger/30 bg-danger/5 py-3.5">
                      <Text className="text-sm font-bold text-danger">Confirm Delete</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default HabitActionSheet;
