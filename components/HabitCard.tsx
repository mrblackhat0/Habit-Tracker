import React, { useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hapticImpact, hapticNotification } from '@/utils/haptics';
import { Colors } from '../constants/Colors';
import { Habit, ProgressType } from '../db/habits';
import { formatTime, toTitleCase } from '@/utils/utils';
import { getIconColor } from '@/constants/Icons';

export interface HabitCardItem extends Omit<Habit, 'progressType'> {
  progressType: ProgressType | string;
  streak?: number;
  done?: boolean;
  loggedMinutes?: number;
  loggedQty?: number;
}

interface HabitCardProps {
  habit: HabitCardItem;
  onToggleDone?: (id: number, habit: HabitCardItem) => void;
  onPress?: (habit: HabitCardItem) => void;
  onLongPress?: (habit: HabitCardItem) => void;
}

export const HabitCard: React.FC<HabitCardProps> = React.memo(
  ({ habit, onToggleDone, onPress, onLongPress }) => {
    const isPressingRef = useRef(false);

    const handlePress = () => {
      if (!onPress) return;
      if (isPressingRef.current) return;
      isPressingRef.current = true;
      try {
        onPress(habit);
      } catch {}
      setTimeout(() => {
        isPressingRef.current = false;
      }, 600);
    };

    // defensive defaults — prevents crash on malformed habit from DB
    if (!habit || typeof habit.id !== 'number') return null;

    const {
      id,
      name = 'Untitled',
      icon = 'star',
      time,
      streak = 0,
      progressType = 'check',
      done = false,
      goalMinutes,
      loggedMinutes = 0,
      goalQty,
      loggedQty = 0,
      unit,
      occurrence,
    } = habit as HabitCardItem;

    let progressText = '';

    try {
      if (progressType === 'duration' && goalMinutes) {
        const gm = Number(goalMinutes) || 0;
        const lm = Number(loggedMinutes) || 0;
        progressText = `${Math.floor(lm)} / ${gm} mins`;
      } else if (progressType === 'quantity' && goalQty) {
        const gq = Number(goalQty) || 0;
        const lq = Number(loggedQty) || 0;
        progressText = `${lq} / ${gq} ${unit || ''}`;
      }
    } catch {}

    return (
      <Pressable
        onPress={handlePress}
        onLongPress={() => onLongPress && onLongPress(habit)}
        delayLongPress={350}
        className="mb-3 rounded-2xl border border-border bg-surface p-4 shadow-sm active:opacity-90">
        <View className="flex-row items-center justify-between">
          <View className="mr-3 flex-1 flex-row items-center">
            <View
              className="mr-3 h-12 w-12 items-center justify-center rounded-xl border border-border"
              style={{ backgroundColor: `${getIconColor(icon)}20` }}>
              <Ionicons name={icon as any} color={getIconColor(icon)} size={22} />
            </View>

            <View className="flex-1">
              <View className="mt-1 flex-row flex-wrap items-center gap-x-2 gap-y-1">
                <Text
                  numberOfLines={1}
                  className={`text-base font-semibold ${
                    done ? 'text-secondary line-through' : 'text-text'
                  }`}>
                  {toTitleCase(name)}
                </Text>
                {!habit.reminder && habit.time && (
                  <View className="flex-row items-center">
                    <Ionicons
                      name={'notifications-off-outline'}
                      size={12}
                      color={Colors.secondary}
                    />
                  </View>
                )}
                {streak > 0 && (
                  <View className="ml-1 flex-row items-center">
                    <Text className="text-xs text-warning">🔥 {streak}d streak</Text>
                  </View>
                )}
              </View>

              <View className="mt-1 flex-row flex-wrap items-center gap-x-3 gap-y-1">
                {time && (
                  <View className="flex-row items-center">
                    <Ionicons name={'time-outline'} size={12} color={Colors.secondary} />
                    <Text className={`ml-1 text-xs text-secondary`}>{formatTime(time)}</Text>
                  </View>
                )}
                {progressType !== 'check' && (
                  <View className="max-w-[30%] flex-row items-center">
                    <Text numberOfLines={1} className="text-xs font-medium text-secondary">
                      {progressText}
                    </Text>
                  </View>
                )}

                {occurrence &&
                  (occurrence.split(',').length === 7 ? (
                    <Text className="text-sm">
                      <Ionicons name="repeat-sharp" color={Colors.secondary} size={20} />
                    </Text>
                  ) : (
                    <Text className="text-xs text-secondary">{occurrence}</Text>
                  ))}
              </View>
              <View className="mt-1 flex-row flex-wrap items-center gap-x-3 gap-y-1" />
            </View>
          </View>

          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              // skip haptic here if parent will show any modal — let parent handle Heavy/Medium
              const isDurationIncomplete =
                progressType === 'duration' &&
                goalMinutes != null &&
                (loggedMinutes ?? 0) < (goalMinutes ?? 0);
              const isQuantityIncomplete =
                progressType === 'quantity' && goalQty != null && (loggedQty ?? 0) < (goalQty ?? 0);
              const willShowIncompleteModal =
                !done && (isDurationIncomplete || isQuantityIncomplete);
              const willShowUncompleteModal = !!done && progressType !== 'check';
              const willShowModal = willShowIncompleteModal || willShowUncompleteModal;
              if (!willShowModal) {
                if (done) hapticImpact();
                else hapticNotification();
              }
              onToggleDone && onToggleDone(id, habit);
            }}
            className={`h-9 w-9 items-center justify-center rounded-full border ${
              done ? 'border-positive bg-positive' : 'border-secondary bg-surface'
            }`}>
            {done && (
              <Text className="bottom-[1px] left-[0.5px] text-2xl font-bold text-white">✓</Text>
            )}
          </Pressable>
        </View>
      </Pressable>
    );
  }
);

export default HabitCard;
