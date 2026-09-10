import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Modal, Pressable, TouchableWithoutFeedback } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors, DataColors } from '@/constants/Colors';

interface Props {
  visible: boolean;
  hasPhoto: boolean;
  onClose: () => void;
  onPreview: () => void;
  onLibrary: () => void;
  onCamera: () => void;
  onRemove: () => void;
}

export const ProfilePhotoActionSheet: React.FC<Props> = ({ visible, hasPhoto, onClose, onPreview, onLibrary, onCamera, onRemove }) => {
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
        <Animated.View style={backdropStyle} className="flex-1 justify-end bg-black/60">
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <Animated.View style={sheetStyle} className="rounded-t-3xl border-t border-border bg-surface px-6 pb-8 pt-4 shadow-2xl">
              <View className="mb-4 h-1 w-10 self-center rounded-full bg-border" />
              <Text className="mb-3 text-center text-base font-bold text-text">Profile photo</Text>
              <View className="gap-2">
                {hasPhoto ? (
                  <Pressable
                    onPress={() => {
                      handleClose();
                      // queue preview after sheet exit to avoid race
                      setTimeout(onPreview, 260);
                    }}
                    className="flex-row items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3.5 active:opacity-80">
                    <View className="h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                      <Ionicons name="eye-outline" size={18} color={Colors.primary} />
                    </View>
                    <Text className="text-sm font-semibold text-text">Preview photo</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => {
                    handleClose();
                    setTimeout(onLibrary, 260);
                  }}
                  className="flex-row items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3.5 active:opacity-80">
                  <View className="h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                    <Ionicons name="images-outline" size={18} color={Colors.primary} />
                  </View>
                  <Text className="text-sm font-semibold text-text">Choose from library</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    handleClose();
                    setTimeout(onCamera, 260);
                  }}
                  className="flex-row items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3.5 active:opacity-80">
                  <View className="h-9 w-9 items-center justify-center rounded-xl bg-background">
                    <Ionicons name="camera-outline" size={18} color={Colors.secondary} />
                  </View>
                  <Text className="text-sm font-semibold text-text">Take photo</Text>
                </Pressable>
                {hasPhoto ? (
                  <Pressable
                    onPress={() => {
                      handleClose();
                      setTimeout(onRemove, 260);
                    }}
                    className="flex-row items-center gap-3 rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3.5 active:opacity-80">
                    <View className="h-9 w-9 items-center justify-center rounded-xl bg-danger/10">
                      <Ionicons name="trash-outline" size={18} color={DataColors.danger} />
                    </View>
                    <Text className="text-sm font-semibold text-danger">Remove photo</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={handleClose} className="mt-1 items-center rounded-2xl bg-background py-3.5 active:opacity-70">
                  <Text className="text-sm font-semibold text-textMuted">Cancel</Text>
                </Pressable>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default ProfilePhotoActionSheet;
