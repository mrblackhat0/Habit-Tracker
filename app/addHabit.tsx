import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { ThemeConfig } from '../constants/Colors';
import { useHabitStore } from '../store/habitStore';
import { ProgressType } from '../db/habits';
import DateTimePicker from '@react-native-community/datetimepicker';
import { formatTime, toTitleCase } from '@/utils/utils';
import { HABIT_ICONS as ICONS } from '@/constants/Icons';
import SegmentedToggle from '@/components/SegmentedToggle';
import AnimatedSwitch from '@/components/AnimatedSwitch';
import TypeChangeConfirmModal from '@/components/TypeChangeConfirmModal';
import { requestNotificationPermission } from '@/services/notificationService';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const AddHabit = () => {
  const { habitId } = useLocalSearchParams<{ habitId?: string }>();
  const isEdit = Boolean(habitId);

  const habits = useHabitStore((state) => state.habits);
  const addHabit = useHabitStore((state) => state.addHabit);
  const updateHabit = useHabitStore((state) => state.updateHabit);

  const existingHabit = isEdit ? habits.find((h) => h.id === Number(habitId)) : undefined;

  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[0].name);
  const [progressType, setProgressType] = useState('check');
  const [goalMinutes, setGoalMinutes] = useState('');
  const [goalQty, setGoalQty] = useState('');
  const [unit, setUnit] = useState('');
  const [selectedDays, setSelectedDays] = useState(DAYS);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [time, setTime] = useState(''); // ISO string
  const [showPicker, setShowPicker] = useState(false);
  const [showTypeChangeModal, setShowTypeChangeModal] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<any>(null);

  useEffect(() => {
    if (existingHabit) {
      setName(existingHabit.name);
      setIcon(existingHabit.icon);
      setProgressType(existingHabit.progressType);
      setGoalMinutes(existingHabit.goalMinutes ? String(existingHabit.goalMinutes) : '');
      setGoalQty(existingHabit.goalQty ? String(existingHabit.goalQty) : '');
      setUnit(existingHabit.unit ?? '');

      setReminderEnabled(existingHabit.reminder ?? Boolean(existingHabit.time));
      setTime(existingHabit.time ?? '');

      if (existingHabit.occurrence === 'daily') {
        setSelectedDays(DAYS);
      } else if (existingHabit.occurrence) {
        const daysArr = existingHabit.occurrence.split(',');
        setSelectedDays(daysArr);
      }
    }
  }, [existingHabit]);

  const toggleDay = (s: string) => {
    setSelectedDays((prev) =>
      prev.includes(s)
        ? prev.filter((d) => d !== s)
        : [...prev, s].sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b))
    );
  };

  const handleReminderToggle = (value: boolean) => {
    if (value) {
      if (!time) {
        handleTimePress();
        // keep reminder off until time is actually picked
      } else {
        setReminderEnabled(true);
      }
      requestNotificationPermission().catch(() => {});
    } else {
      setReminderEnabled(false);
      setShowPicker(false);
    }
  };

  const handleTimePress = () => {
    setShowPicker(true);
    requestNotificationPermission().catch(() => {});
  };

  const getDisplayTime = () => {
    if (time) {
      const formatted = formatTime(time);
      if (formatted) return formatted;
    }
    return '12:00 AM';
  };

  const handleSave = () => {
    const finalTime = time || (reminderEnabled ? new Date().toISOString() : null);

    const payload = {
      name: toTitleCase(name.trim()),
      icon,
      progressType: progressType as ProgressType,
      time: finalTime,
      reminder: reminderEnabled,
      goalMinutes: progressType === 'duration' ? Number(goalMinutes) || null : null,
      goalQty: progressType === 'quantity' ? Number(goalQty) || null : null,
      unit: progressType === 'quantity' ? unit : null,
      occurrence: selectedDays.join(','),
    };

    if (isEdit && habitId && existingHabit) {
      const oldType = existingHabit.progressType;
      const newType = progressType as ProgressType;
      if ((oldType === 'duration' || oldType === 'quantity') && newType === 'check') {
        setPendingPayload(payload);
        setShowTypeChangeModal(true);
        return;
      }
      updateHabit(Number(habitId), payload);
      router.back();
      return;
    }

    if (isEdit && habitId) {
      updateHabit(Number(habitId), payload);
    } else {
      addHabit(payload);
    }

    router.back();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 border-t border-border bg-background">
      <Stack.Screen options={{ title: isEdit ? 'Edit Habit' : 'Add Habit' }} />

      <ScrollView
        className="flex-1 px-5 pt-4"
        contentContainerStyle={{ paddingTop: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}>
        {/* Name */}
        <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-textMuted">
          Habit name
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Morning run"
          placeholderTextColor={ThemeConfig.colors.textMuted}
          className="mb-6 rounded-2xl border border-border bg-surface px-4 py-4 text-base text-text"
        />

        {/* Icon picker */}
        <Text className="mb-3 text-xs font-semibold uppercase tracking-wider text-textMuted">
          Icon
        </Text>
        <ScrollView
          keyboardShouldPersistTaps="always"
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-6"
          contentContainerStyle={{ paddingRight: 16 }}>
          <View className="gap-3">
            {[0, 1].map((row) => {
              const perRow = Math.ceil(ICONS.length / 2);
              const rowIcons = ICONS.slice(row * perRow, (row + 1) * perRow);
              return (
                <View key={row} className="flex-row gap-3">
                  {rowIcons.map((ic) => {
                    const active = ic.name === icon;
                    return (
                      <Pressable
                        key={ic.name}
                        onPress={() => setIcon(ic.name)}
                        className={`h-14 w-14 items-center justify-center rounded-2xl border ${
                          active ? 'border-primary' : 'border-border'
                        }`}
                        style={{
                          backgroundColor: active ? `${ic.color}25` : ThemeConfig.colors.surface,
                        }}>
                        <Ionicons name={ic.name as any} size={22} color={ic.color} />
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* Progress type */}
        <Text className="mb-3 text-xs font-semibold uppercase tracking-wider text-textMuted">
          Track by
        </Text>
        <SegmentedToggle
          onChange={setProgressType}
          options={['check', 'duration', 'quantity']}
          value={progressType}
        />

        {/* Conditional goal fields */}
        {progressType === 'duration' && (
          <View className="mb-6">
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-textMuted">
              Goal (minutes)
            </Text>
            <TextInput
              value={goalMinutes}
              onChangeText={setGoalMinutes}
              keyboardType="number-pad"
              placeholder="30"
              placeholderTextColor={ThemeConfig.colors.textMuted}
              className="rounded-2xl border border-border bg-surface px-4 py-4 text-base text-text"
            />
          </View>
        )}

        {progressType === 'quantity' && (
          <View className="mb-6 flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-textMuted">
                Goal
              </Text>
              <TextInput
                value={goalQty}
                onChangeText={setGoalQty}
                keyboardType="number-pad"
                placeholder="8"
                placeholderTextColor={ThemeConfig.colors.textMuted}
                className="rounded-2xl border border-border bg-surface px-4 py-4 text-base text-text"
              />
            </View>
            <View className="flex-1">
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-textMuted">
                Unit
              </Text>
              <TextInput
                value={unit}
                onChangeText={setUnit}
                placeholder="glasses"
                placeholderTextColor={ThemeConfig.colors.textMuted}
                className="rounded-2xl border border-border bg-surface px-4 py-4 text-base text-text"
              />
            </View>
          </View>
        )}

        {/* Reminder Field */}
        <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-textMuted">
          Reminder
        </Text>
        <View className="mb-6 flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3.5">
          <Pressable
            onPress={handleTimePress}
            disabled={!reminderEnabled}
            className="flex-1 flex-row items-center gap-3">
            <Ionicons
              name="notifications-outline"
              size={20}
              color={reminderEnabled ? ThemeConfig.colors.primary : ThemeConfig.colors.textMuted}
            />
            <Text
              className={`text-base font-semibold ${
                reminderEnabled ? 'text-text' : 'text-textMuted opacity-50'
              }`}>
              {getDisplayTime()}
            </Text>
          </Pressable>

          <AnimatedSwitch value={reminderEnabled} onValueChange={handleReminderToggle} />
        </View>

        {showPicker && (
          <DateTimePicker
            value={time ? new Date(time) : new Date()}
            mode="time"
            design="default"
            is24Hour={false}
            display="clock"
            onValueChange={(_, selectedDate) => {
              setShowPicker(Platform.OS === 'ios');
              if (selectedDate) {
                setTime(selectedDate.toISOString());
                setReminderEnabled(true);
              } else if (!time) {
                setReminderEnabled(false);
              }
            }}
            onDismiss={() => {
              setShowPicker(false);
              if (!time) setReminderEnabled(false);
            }}
          />
        )}

        {/* Occurrence */}
        <Text className="mb-3 text-xs font-semibold uppercase tracking-wider text-textMuted">
          Repeat on
        </Text>
        <View className="mb-8 flex-row justify-between">
          {DAYS.map((d, i) => {
            const active = selectedDays.includes(d);
            return (
              <Pressable
                key={i}
                onPress={() => toggleDay(d)}
                className={`h-10 w-10 items-center justify-center rounded-full border ${
                  active ? 'border-primary bg-primary' : 'border-border bg-surface'
                }`}>
                <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-textMuted'}`}>
                  {d.charAt(0)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Save button */}
      <View className="border-t border-border bg-background px-5 pb-6 pt-2">
        <Pressable
          onPress={handleSave}
          disabled={!name.trim()}
          className={`items-center rounded-2xl py-4 ${name.trim() ? 'bg-primary' : 'bg-surface'}`}>
          <Text className={`text-base font-bold ${name.trim() ? 'text-white' : 'text-textMuted'}`}>
            {isEdit ? 'Update Habit' : 'Save Habit'}
          </Text>
        </Pressable>
      </View>

      <TypeChangeConfirmModal
        visible={showTypeChangeModal}
        habitName={toTitleCase(name.trim()) || existingHabit?.name || 'This habit'}
        oldType={existingHabit?.progressType ?? ''}
        onClose={() => {
          setShowTypeChangeModal(false);
          setPendingPayload(null);
        }}
        onConfirm={() => {
          if (pendingPayload && habitId) {
            updateHabit(Number(habitId), pendingPayload);
            router.back();
          }
          setShowTypeChangeModal(false);
          setPendingPayload(null);
        }}
      />
    </KeyboardAvoidingView>
  );
};

export default AddHabit;
