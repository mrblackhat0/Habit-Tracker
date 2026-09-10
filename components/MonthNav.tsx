import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TouchableWithoutFeedback } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function isCurrentMonth(year: number, monthIdx: number): boolean {
  const now = new Date();
  return year === now.getFullYear() && monthIdx === now.getMonth();
}
function isAtCreationMonth(
  year: number,
  monthIdx: number,
  createdYear?: number,
  createdMonth?: number
): boolean {
  if (createdYear == null || createdMonth == null) return false;
  return year === createdYear && monthIdx === createdMonth - 1;
}

interface MonthPickerModalProps {
  visible: boolean;
  year: number;
  monthIndex: number;
  onClose: () => void;
  onSelect: (year: number, monthIndex: number) => void;
}

function MonthPickerModal({
  visible,
  year,
  monthIndex,
  onClose,
  onSelect,
}: MonthPickerModalProps) {
  const [showModal, setShowModal] = useState(visible);
  const isClosingRef = useRef(false);
  const [modalMode, setModalMode] = useState<'months' | 'years'>('months');
  const [tempYear, setTempYear] = useState(year);
  const yearScrollRef = useRef<ScrollView>(null);
  const backdropOpacity = useSharedValue(0);
  const sheetTranslateY = useSharedValue(400);

  // Synchronous mount when visible becomes true so modal renders on the first frame
  if (visible && !showModal) {
    setShowModal(true);
  }

  const yearRange = useMemo(() => {
    const nowYear = new Date().getFullYear();
    const arr: number[] = [];
    for (let y = 2000; y <= nowYear + 5; y++) arr.push(y);
    return arr;
  }, []);

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    backdropOpacity.value = withTiming(0, { duration: 200 });
    sheetTranslateY.value = withTiming(400, { duration: 200 }, (finished) => {
      if (finished) {
        runOnJS(setShowModal)(false);
        runOnJS(onClose)();
      }
    });
  }, [onClose, backdropOpacity, sheetTranslateY]);

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      setTempYear(year);
      setModalMode('months');
      backdropOpacity.value = withTiming(1, { duration: 250 });
      sheetTranslateY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.8 });
    } else if (showModal && !isClosingRef.current) {
      isClosingRef.current = true;
      backdropOpacity.value = withTiming(0, { duration: 200 });
      sheetTranslateY.value = withTiming(400, { duration: 200 }, (finished) => {
        if (finished) {
          runOnJS(setShowModal)(false);
        }
      });
    }
  }, [visible]);

  useEffect(() => {
    if (showModal && modalMode === 'years') {
      const idx = yearRange.indexOf(tempYear);
      if (idx >= 0) {
        const row = Math.floor(idx / 3);
        const y = row * 60;
        setTimeout(() => yearScrollRef.current?.scrollTo({ y, animated: false }), 50);
      }
    }
  }, [showModal, modalMode, tempYear, yearRange]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  if (!showModal) return null;

  const handleYearSelect = (y: number) => {
    setTempYear(y);
    setModalMode('months');
  };

  const handleMonthSelect = (m: number) => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    backdropOpacity.value = withTiming(0, { duration: 200 });
    sheetTranslateY.value = withTiming(400, { duration: 200 }, (finished) => {
      if (finished) {
        runOnJS(setShowModal)(false);
        runOnJS(onClose)();
        runOnJS(onSelect)(tempYear, m);
      }
    });
  };

  return (
    <Modal visible={showModal} transparent animationType="none" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View style={backdropStyle} className="flex-1 bg-black/60 justify-end">
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <Animated.View
              style={sheetStyle}
              className="bg-surface border-t border-border rounded-t-3xl px-6 pt-4 pb-8 shadow-2xl">
              <View className="relative mb-2 w-full items-center justify-center">
                <View className="h-1 w-10 rounded-full bg-border" />
                <Pressable
                  onPress={handleClose}
                  hitSlop={8}
                  className="absolute right-0 top-[-4px] h-8 w-8 items-center justify-center rounded-full border border-border bg-background active:opacity-70">
                  <Ionicons name="close" size={16} color="#a1a1aa" />
                </Pressable>
              </View>

              <Pressable
                onPress={() => setModalMode((m) => (m === 'months' ? 'years' : 'months'))}
                className="flex-row items-center justify-center gap-1.5 py-1 active:opacity-75">
                <Text className="text-xl font-bold text-text">{tempYear}</Text>
                <Ionicons
                  name={modalMode === 'years' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.secondary}
                />
              </Pressable>
              <Text className="mb-4 text-center text-xs text-secondary">
                {modalMode === 'months' ? 'Select month' : 'Select year'}
              </Text>

              <View style={{ minHeight: 180 }} className="justify-center">
                {modalMode === 'months' ? (
                  <View className="flex-row flex-wrap gap-2.5">
                    {MONTH_NAMES.map((m, idx) => {
                      const isActive = idx === monthIndex && tempYear === year;
                      return (
                        <Pressable
                          key={m}
                          onPress={() => handleMonthSelect(idx)}
                          className={`h-12 flex-1 basis-[22%] items-center justify-center rounded-2xl border active:opacity-80 ${
                            isActive
                              ? 'border-primary bg-primary'
                              : 'border-border bg-background'
                          }`}>
                          <Text
                            className={`text-xs font-bold ${
                              isActive ? 'text-white' : 'text-text'
                            }`}>
                            {m.slice(0, 3).toUpperCase()}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <ScrollView
                    ref={yearScrollRef}
                    showsVerticalScrollIndicator={false}
                    style={{ maxHeight: 180 }}
                    contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
                    <View className="flex-row flex-wrap gap-2.5">
                      {yearRange.map((y) => {
                        const isActive = y === tempYear;
                        return (
                          <Pressable
                            key={y}
                            onPress={() => handleYearSelect(y)}
                            className={`h-12 w-[30%] items-center justify-center rounded-2xl border active:opacity-80 ${
                              isActive
                                ? 'border-primary bg-primary'
                                : 'border-border bg-background'
                            }`}>
                            <Text
                              className={`text-sm font-bold ${
                                isActive ? 'text-white' : 'text-text'
                              }`}>
                              {y}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                )}
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

export function MonthNav({
  year,
  month,
  monthIndex,
  createdYear,
  createdMonth,
  onPrev,
  onNext,
  onPickerPress,
  onPickerChange,
  disablePrev,
  disableNext,
  embedded = false,
}: {
  year: number;
  month?: number;
  monthIndex?: number;
  createdYear?: number;
  createdMonth?: number;
  onPrev: () => void;
  onNext: () => void;
  onPickerPress?: () => void;
  onPickerChange?: (year: number, monthIndex: number) => void;
  disablePrev?: boolean;
  disableNext?: boolean;
  embedded?: boolean;
}) {
  const mIdx = monthIndex ?? (month != null ? month - 1 : 0);
  const atCurrent = isCurrentMonth(year, mIdx);
  const atCreation = isAtCreationMonth(year, mIdx, createdYear, createdMonth);
  const prevDisabled = disablePrev ?? atCreation;
  const nextDisabled = disableNext ?? (createdYear != null ? atCurrent : false);
  const label = `${MONTH_NAMES[mIdx].toUpperCase()} ${year}`;

  const [modalVisible, setModalVisible] = useState(false);

  const openPicker = () => {
    if (onPickerPress) {
      onPickerPress();
      return;
    }
    if (onPickerChange) {
      setModalVisible(true);
    }
  };

  const hasPicker = Boolean(onPickerPress || onPickerChange);

  const NavRow = (
    <View
      className={
        embedded
          ? 'mb-4 flex-row items-center justify-between border-b border-border/50 pb-3'
          : 'flex-row items-center justify-between'
      }>
      <Pressable
        onPress={onPrev}
        disabled={prevDisabled}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Previous month"
        accessibilityState={{ disabled: prevDisabled }}
        className={`h-8 w-8 items-center justify-center rounded-lg border active:opacity-70 ${prevDisabled ? 'border-border/40 bg-background/30 opacity-40' : 'border-border bg-background/50'}`}>
        <Ionicons
          name="chevron-back"
          size={18}
          color={prevDisabled ? Colors.secondary : Colors.text}
        />
      </Pressable>

      {hasPicker ? (
        <Pressable
          onPress={openPicker}
          accessibilityRole="button"
          accessibilityLabel={`Open month picker, current ${label}`}
          className="flex-row items-center gap-2 rounded-xl bg-background/40 px-4 py-1.5 active:opacity-80">
          <Text className="text-base font-bold tracking-wider text-text">{label}</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.secondary} />
        </Pressable>
      ) : (
        <Text className="text-base font-semibold text-text">
          {new Date(year, mIdx, 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
        </Text>
      )}

      <Pressable
        onPress={onNext}
        disabled={nextDisabled}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Next month"
        accessibilityState={{ disabled: nextDisabled }}
        className={`h-8 w-8 items-center justify-center rounded-lg border active:opacity-70 ${nextDisabled ? 'border-border/40 bg-background/30 opacity-40' : 'border-border bg-background/50'}`}>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={nextDisabled ? Colors.secondary : Colors.text}
        />
      </Pressable>
    </View>
  );

  return (
    <>
      {embedded ? (
        NavRow
      ) : (
        <View className="mb-4 rounded-2xl border border-border bg-surface p-2.5 shadow-sm">
          {NavRow}
        </View>
      )}

      {onPickerChange != null && (
        <MonthPickerModal
          visible={modalVisible}
          year={year}
          monthIndex={mIdx}
          onClose={() => setModalVisible(false)}
          onSelect={(selectedYear, selectedMonth) => {
            onPickerChange(selectedYear, selectedMonth);
          }}
        />
      )}
    </>
  );
}
