import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

interface EditNameModalProps {
  visible: boolean;
  initialName: string;
  onClose: () => void;
  onSave: (name: string) => void;
}

export default function EditNameModal({
  visible,
  initialName,
  onClose,
  onSave,
}: EditNameModalProps) {
  const [value, setValue] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setValue(initialName);
      setError(null);
    }
  }, [visible, initialName]);

  const handleSave = () => {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    if (trimmed.length > 24) {
      setError('Name must be 24 characters or less');
      return;
    }
    onSave(trimmed);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 justify-center bg-black/60 px-5">
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View className="rounded-3xl border border-border bg-surface p-5 shadow-2xl">
                <View className="mb-4 flex-row items-center justify-between">
                  <Text className="text-lg font-bold text-text">Edit username</Text>
                  <Pressable
                    onPress={onClose}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    className="h-8 w-8 items-center justify-center rounded-full border border-border bg-background active:opacity-70">
                    <Ionicons name="close" size={18} color={Colors.secondary} />
                  </Pressable>
                </View>

                <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-secondary">
                  UserName
                </Text>
                <View
                  className={`flex-row items-center rounded-2xl border bg-background px-3 py-1 ${error ? 'border-danger' : 'border-border'}`}>
                  <Ionicons name="person-outline" size={18} color={Colors.secondary} />
                  <TextInput
                    value={value}
                    onChangeText={(t) => {
                      setValue(t);
                      if (error) setError(null);
                    }}
                    placeholder="Your name"
                    placeholderTextColor={Colors.textMuted}
                    maxLength={24}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSave}
                    className="ml-2 flex-1 py-3 text-[15px] font-medium text-text"
                    style={{ outlineStyle: 'none' } as any}
                    accessibilityLabel="Display name input"
                  />
                  {value.length > 0 ? (
                    <Pressable onPress={() => setValue('')} hitSlop={8} className="p-1">
                      <Ionicons name="close-circle" size={18} color={Colors.secondary} />
                    </Pressable>
                  ) : null}
                </View>
                {error ? (
                  <Text
                    className="mt-2 text-xs font-medium text-danger"
                    accessibilityLiveRegion="polite">
                    {error}
                  </Text>
                ) : (
                  <Text className="mt-2 text-xs text-secondary">
                    Shown in greeting — “Good Morning, {value.trim().split(' ')[0] || '…'}”
                  </Text>
                )}

                <View className="mt-5 flex-row gap-3">
                  <Pressable
                    onPress={onClose}
                    className="flex-1 items-center justify-center rounded-2xl border border-border bg-background py-3.5 active:opacity-70"
                    accessibilityRole="button"
                    accessibilityLabel="Cancel">
                    <Text className="text-sm font-semibold text-text">Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSave}
                    className="flex-1 items-center justify-center rounded-2xl bg-primary py-3.5 active:opacity-90"
                    accessibilityRole="button"
                    accessibilityLabel="Save name">
                    <Text className="text-sm font-bold text-white">Save</Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
