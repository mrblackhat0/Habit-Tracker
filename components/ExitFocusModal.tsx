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
import { DataColors } from '../constants/Colors';

interface ExitFocusModalProps {
  visible: boolean;
  habitName: string;
  onStay: () => void;
  onStopAndExit: () => void;
}

export default function ExitFocusModal({
  visible,
  habitName,
  onStay,
  onStopAndExit,
}: ExitFocusModalProps) {
  const [isMounted, setIsMounted] = useState(visible);
  const backdropOpacity = useSharedValue(0);
  const sheetTranslateY = useSharedValue(400);

  const handleStay = useCallback(() => {
    backdropOpacity.value = withTiming(0, { duration: 200 });
    sheetTranslateY.value = withTiming(400, { duration: 200 }, (finished) => {
      if (finished) {
        runOnJS(setIsMounted)(false);
        runOnJS(onStay)();
      }
    });
  }, [onStay, backdropOpacity, sheetTranslateY]);

  const handleStop = useCallback(() => {
    backdropOpacity.value = withTiming(0, { duration: 200 });
    sheetTranslateY.value = withTiming(400, { duration: 200 }, (finished) => {
      if (finished) {
        runOnJS(setIsMounted)(false);
        runOnJS(onStopAndExit)();
      }
    });
  }, [onStopAndExit, backdropOpacity, sheetTranslateY]);

  const handleClose = handleStay;

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
                <View
                  className="h-12 w-12 items-center justify-center rounded-2xl border border-border"
                  style={{ backgroundColor: `${DataColors.warning}15` }}>
                  <Ionicons name="warning-outline" size={28} color={DataColors.warning} />
                </View>
                <Text className="mt-3 text-center text-xl font-bold text-text">
                  Active Session in Progress
                </Text>
                <Text className="mt-2 px-2 text-center text-xs leading-5 text-textMuted">
                  &quot;{habitName}&quot; has an active focus session. Would you like to stay on this screen
                  or stop and log your session before exiting?
                </Text>
              </View>

              <View className="mt-4 w-full flex-row gap-3">
                <Pressable
                  onPress={handleStay}
                  className="flex-1 items-center justify-center rounded-2xl bg-primary py-3.5 shadow-md active:opacity-90">
                  <Text className="text-sm font-bold text-white">Stay</Text>
                </Pressable>
                <Pressable
                  onPress={handleStop}
                  className="flex-1 items-center justify-center rounded-2xl border border-danger/40 bg-danger/10 py-3.5 active:opacity-80">
                  <Text className="text-sm font-bold text-danger">Stop & Exit</Text>
                </Pressable>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
