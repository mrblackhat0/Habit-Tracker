import { useEffect, useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, DataColors } from '@/constants/Colors';
import { useHabitStore } from '@/store/habitStore';
import { useStore } from '@/store/store';
import { getIconColor } from '@/constants/Icons';
import { formatTime, toTitleCase } from '@/utils/utils';
import { SettingDivider } from '@/components/SettingItem';
import AppAlertModal from '@/components/AppAlertModal';

export default function ArchivedScreen() {
  const insets = useSafeAreaInsets();
  const archivedHabits = useHabitStore((s) => s.archivedHabits);
  const loadArchived = useHabitStore((s) => s.loadArchived);
  const unarchiveHabit = useHabitStore((s) => s.unarchiveHabit);
  const deleteHabit = useHabitStore((s) => s.deleteHabit);
  const triggerHaptic = useStore((s) => s.triggerHaptic);
  const [loading, setLoading] = useState(true);
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message?: string;
    type?: 'info' | 'success' | 'warning' | 'error' | 'danger';
    primaryText?: string;
    secondaryText?: string;
    destructive?: boolean;
    onPrimary?: () => void;
  } | null>(null);

  const showAlert = useCallback(
    (cfg: Omit<NonNullable<typeof alertConfig>, 'visible'>) =>
      setAlertConfig({ visible: true, ...cfg }),
    []
  );
  const hideAlert = useCallback(() => setAlertConfig(null), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await loadArchived();
    } finally {
      setLoading(false);
    }
  }, [loadArchived]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View className="flex-1 border-t border-border bg-background">
      <Stack.Screen
        options={{
          title: 'Archived Habits',
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
        }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 32,
          paddingTop: 16,
          gap: 16,
        }}>
        {/* Header card like Export section */}
        <View className="rounded-2xl border border-border bg-surface p-4">
          <View className="flex-row items-center gap-3">
            <View
              className="h-10 w-10 items-center justify-center rounded-xl border border-border"
              style={{ backgroundColor: `${Colors.secondary}14` }}>
              <Ionicons name="archive-outline" size={20} color={Colors.secondary} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-text">
                {archivedHabits.length > 0
                  ? `${archivedHabits.length} archived habit${archivedHabits.length === 1 ? '' : 's'}`
                  : 'No archived habits'}
              </Text>
              <Text className="mt-0.5 text-xs leading-4 text-secondary">
                Archived habits are hidden from Today, Calendar and Analytics. Restore to make them
                active again.
              </Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View className="items-center py-12">
            <ActivityIndicator color={Colors.primary} />
            <Text className="mt-2 text-xs text-secondary">Loading archived habits…</Text>
          </View>
        ) : archivedHabits.length === 0 ? (
          <View className="items-center rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-10">
            <View className="h-14 w-14 items-center justify-center rounded-2xl border border-border bg-background">
              <Ionicons name="archive-outline" size={28} color={Colors.secondary} />
            </View>
            <Text className="mt-3 text-sm font-bold text-text">Nothing archived yet</Text>
            <Text className="mt-1 text-center text-xs leading-5 text-secondary">
              Long-press any habit on the Home screen and tap Archive to hide it here.
            </Text>
          </View>
        ) : (
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            {archivedHabits.map((h, idx) => (
              <View key={h.id}>
                {idx > 0 && <SettingDivider />}
                <View className="flex-row items-center px-3.5 py-3.5">
                  <View
                    className="mr-3 h-10 w-10 items-center justify-center rounded-xl border border-border"
                    style={{ backgroundColor: `${getIconColor(h.icon)}18` }}>
                    <Ionicons name={h.icon as any} size={20} color={getIconColor(h.icon)} />
                  </View>
                  <View className="flex-1 pr-2">
                    <Text className="text-[15px] font-semibold text-text" numberOfLines={1}>
                      {toTitleCase(h.name)}
                    </Text>
                    <Text
                      className="mt-0.5 text-xs capitalize leading-4 text-secondary"
                      numberOfLines={1}>
                      {h.progressType} •{' '}
                      {h.occurrence.split(',').length === 7 ? 'Daily' : h.occurrence}{' '}
                      {h.time ? `• ${formatTime(h.time)}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      triggerHaptic('light');
                      unarchiveHabit(h.id);
                    }}
                    className="mr-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-2 active:opacity-70">
                    <Text className="text-xs font-bold text-primary">Restore</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      showAlert({
                        title: 'Delete archived habit?',
                        message: `Permanently delete "${toTitleCase(h.name)}" and all its logs? This cannot be undone.`,
                        type: 'danger',
                        primaryText: 'Delete',
                        secondaryText: 'Cancel',
                        destructive: true,
                        onPrimary: () => deleteHabit(h.id),
                      })
                    }
                    hitSlop={8}
                    className="h-9 w-9 items-center justify-center rounded-full border border-danger/20 bg-danger/10 active:opacity-70">
                    <Ionicons name="trash-outline" size={16} color={DataColors.danger} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {archivedHabits.length > 0 && (
          <Text className="ml-1 text-xs leading-4 text-textMuted">
            Tip: Restore brings the habit back to Home and re-enables its reminders. Deleted habits
            are removed forever.
          </Text>
        )}
      </ScrollView>

      <AppAlertModal
        visible={!!alertConfig?.visible}
        title={alertConfig?.title ?? ''}
        message={alertConfig?.message}
        type={alertConfig?.type}
        primaryText={alertConfig?.primaryText}
        secondaryText={alertConfig?.secondaryText}
        destructive={!!alertConfig?.destructive}
        onClose={hideAlert}
        onPrimary={alertConfig?.onPrimary}
      />
    </View>
  );
}
