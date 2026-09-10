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
}

export const HabitActionSheet: React.FC<HabitActionSheetProps> = ({
  visible,
  habit,
  onClose,
  onEdit,
  onDelete,
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
    <Modal
      visible={isMounted}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View style={backdropStyle} className="flex-1 bg-black/60 justify-end">
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <Animated.View style={sheetStyle} className="bg-surface border-t border-border rounded-t-3xl px-6 pt-4 pb-8 shadow-2xl">
              {/* Drag handle pill */}
              <View className="w-10 h-1 bg-border rounded-full self-center mb-4" />

              {/* Habit Header */}
              <View className="flex-row items-center mb-6 pb-4 border-b border-border">
                <View
                  className="w-10 h-10 rounded-xl items-center justify-center border border-border mr-3"
                  style={{ backgroundColor: `${getIconColor(habit.icon)}20` }}
                >
                  <Ionicons name={habit.icon as any} size={20} color={getIconColor(habit.icon)} />
                </View>
                <View className="flex-1">
                  <Text className="text-text font-bold text-lg" numberOfLines={1}>
                    {toTitleCase(habit.name)}
                  </Text>
                  <Text className="text-textMuted text-xs capitalize">
                    {habit.progressType} • {habit.occurrence}
                  </Text>
                </View>
              </View>

              {!confirmingDelete ? (
                /* Action Options */
                <View className="gap-3">
                  {/* Edit */}
                  <Pressable
                    onPress={() => {
                      onEdit(habit);
                      handleClose();
                    }}
                    className="flex-row items-center bg-background border border-border rounded-2xl p-4 active:opacity-80"
                  >
                    <Ionicons name="create-outline" size={20} color={Colors.text} className="mr-3" />
                    <Text className="text-text text-base font-semibold ml-3">Edit Habit</Text>
                  </Pressable>

                  {/* Delete */}
                  <Pressable
                    onPress={() => setConfirmingDelete(true)}
                    className="flex-row items-center bg-background border border-border rounded-2xl p-4 active:opacity-80"
                  >
                    <Ionicons name="trash-outline" size={20} color={DataColors.danger} className="mr-3" />
                    <Text className="text-danger text-base font-semibold ml-3">Delete Habit</Text>
                  </Pressable>

                  {/* Archive (Disabled / Coming Soon) */}
                  <View className="flex-row items-center justify-between bg-background/50 border border-border/40 rounded-2xl p-4 opacity-50">
                    <View className="flex-row items-center">
                      <Ionicons name="archive-outline" size={20} color={Colors.secondary} />
                      <Text className="text-textMuted text-base font-semibold ml-3">
                        Archive Habit
                      </Text>
                    </View>
                    <View className="bg-surface px-2 py-0.5 rounded-md border border-border">
                      <Text className="text-[10px] text-textMuted font-bold">SOON</Text>
                    </View>
                  </View>
                </View>
              ) : (
                /* Inline Delete Confirmation */
                <View className="gap-4">
                  <View className="items-center py-2">
                    <Ionicons name="warning-outline" size={36} color={DataColors.danger} />
                    <Text className="text-text text-lg font-bold mt-2">Delete this habit?</Text>
                    <Text className="text-textMuted text-xs text-center mt-1 px-4">
                      This will permanently remove &quot;{toTitleCase(habit.name)}&quot; and all associated log history.
                    </Text>
                  </View>

                  <View className="flex-row gap-3 mt-2">
                    <Pressable
                      onPress={() => setConfirmingDelete(false)}
                      className="flex-1 bg-background border border-border py-3.5 rounded-xl items-center"
                    >
                      <Text className="text-text font-semibold text-sm">Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        onDelete(habit);
                        handleClose();
                      }}
                      className="flex-1 bg-red-600 py-3.5 rounded-xl items-center"
                    >
                      <Text className="text-white font-bold text-sm">Confirm Delete</Text>
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
