import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Modal, Pressable, TouchableWithoutFeedback } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { DataColors } from '@/constants/Colors';

interface TypeChangeConfirmModalProps {
  visible: boolean;
  habitName: string;
  oldType: string;
  onClose: () => void;
  onConfirm: () => void;
}

export const TypeChangeConfirmModal: React.FC<TypeChangeConfirmModalProps> = ({
  visible,
  habitName,
  oldType,
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
        if (finished) runOnJS(setIsMounted)(false);
      });
    }
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetTranslateY.value }] }));

  if (!isMounted) return null;

  return (
    <Modal visible={isMounted} transparent animationType="none" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View style={backdropStyle} className="flex-1 bg-black/60 justify-end">
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <Animated.View
              style={sheetStyle}
              className="bg-surface border-t border-border rounded-t-3xl px-6 pt-4 pb-8 shadow-2xl items-center">
              <View className="w-10 h-1 bg-border rounded-full self-center mb-4" />
              <View className="items-center mb-4">
                <Ionicons name="warning-outline" size={40} color={DataColors.warning} />
                <Text className="text-text text-xl font-bold mt-2">Erase logs?</Text>
              </View>
              <View className="w-full bg-background border border-border rounded-2xl p-4 mb-4">
                <Text className="text-text font-bold text-base" numberOfLines={1}>
                  {habitName || 'This habit'}
                </Text>
                <Text className="text-warning text-xs font-semibold mt-1">
                  {oldType} → check
                </Text>
              </View>
              <Text className="text-textMuted text-xs text-center px-2 leading-5 mb-6">
                Changing to check will erase logged minutes/quantity for completed dates. This cannot be undone.
              </Text>
              <View className="flex-row gap-3 w-full">
                <Pressable
                  onPress={handleClose}
                  className="flex-1 bg-background border border-border py-3.5 rounded-2xl items-center active:opacity-80">
                  <Text className="text-text font-semibold text-sm">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    onConfirm();
                    handleClose();
                  }}
                  className="flex-1 bg-danger py-3.5 rounded-2xl items-center flex-row justify-center gap-1.5 active:opacity-90"
                  style={{ backgroundColor: DataColors.danger }}>
                  <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                  <Text className="text-white font-bold text-sm">Erase & Update</Text>
                </Pressable>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default TypeChangeConfirmModal;
