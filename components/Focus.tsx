import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { toTitleCase, formatDuration } from '@/utils/utils';
import { hapticImpact, hapticNotification } from '@/utils/haptics';
import {
  View,
  Text,
  Pressable,
  Modal,
  AppState,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { useFocusEffect, useNavigation, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withTiming } from 'react-native-reanimated';
import { Colors, DataColors } from '../constants/Colors';
import { Habit, getLogsForHabit, getHabitById } from '../db/habits';
import { useFocusStore } from '../store/focusStore';
import { useHabitStore } from '../store/habitStore';
import { FocusMode, getDailyTotalMs, resetTodayLoggedMinutes } from '../db/focus';
import { getTodayDateStr } from '../utils/dates';
import { requestNotificationPermission } from '@/services/notificationService';
import EditableTimeDisplay from './EditableTimeDisplay';
import SegmentedToggle from './SegmentedToggle';
import AnimatedSwitch from './AnimatedSwitch';
import ResetFocusModal from './ResetFocusModal';
import ExitFocusModal from './ExitFocusModal';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING_SIZE = 275;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface FocusProps {
  habit: Habit;
}

export default function Focus({ habit }: FocusProps) {
  const navigation = useNavigation();
  const activeSession = useFocusStore((state) => state.activeSession);
  const stalePrompt = useFocusStore((state) => state.stalePrompt);
  const loadActiveSession = useFocusStore((state) => state.loadActiveSession);
  const startSession = useFocusStore((state) => state.startSession);
  const pauseSession = useFocusStore((state) => state.pauseSession);
  const resumeSession = useFocusStore((state) => state.resumeSession);
  const stopSession = useFocusStore((state) => state.stopSession);
  const cancelSessionWithoutLogging = useFocusStore((state) => state.cancelSessionWithoutLogging);

  const updateHabit = useHabitStore((state) => state.updateHabit);
  const [strictMode, setStrictMode] = useState<boolean>(habit.strictMode);
  const [exitModalVisible, setExitModalVisible] = useState<boolean>(false);
  const [pendingNavigationAction, setPendingNavigationAction] = useState<any>(null);

  // Refs for strict-mode effects — avoid re-subscribing / spurious cleanup on prop changes
  const habitIdRef = useRef(habit.id);
  const habitStrictRef = useRef(habit.strictMode);
  const pauseSessionRef = useRef(pauseSession);
  useEffect(() => {
    habitIdRef.current = habit.id;
  }, [habit.id]);
  useEffect(() => {
    habitStrictRef.current = habit.strictMode;
  }, [habit.strictMode]);
  useEffect(() => {
    pauseSessionRef.current = pauseSession;
  }, [pauseSession]);

  useEffect(() => {
    setStrictMode(habit.strictMode);
  }, [habit.strictMode]);

  // Intercept navigation back / exit when an active session is in progress (Strict Mode ON only)
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      const active = useFocusStore.getState().activeSession;
      if (!active || active.habitId !== habit.id) {
        return; // Allow exit if no session is active for this habit
      }

      // Only intercept navigation if strict mode is ON
      const currentHabit = useHabitStore.getState().habits.find((h) => h.id === habit.id) ?? habit;
      if (currentHabit.strictMode) {
        e.preventDefault();
        setPendingNavigationAction(e.data.action);
        setExitModalVisible(true);
      }
    });

    return unsubscribe;
  }, [navigation, habit.id]);

  const handleStay = useCallback(() => {
    setExitModalVisible(false);
    setPendingNavigationAction(null);
  }, []);

  // Strict Mode auto-pause when app is switched to background/inactive
  // ponytail: ignore transient inactive from permission dialog + grace after start (1500ms)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState !== 'background') return;
      const active = useFocusStore.getState().activeSession;
      const hid = habitIdRef.current;
      const currentHabit = useHabitStore.getState().habits.find((h) => h.id === hid);
      const isStrict = currentHabit ? currentHabit.strictMode : habitStrictRef.current;
      if (active && active.habitId === hid && active.status === 'running' && isStrict) {
        if (Date.now() - active.startedAt < 1500) return;
        pauseSessionRef.current();
      }
    });
    return () => subscription.remove();
  }, []);

  // Strict Mode auto-pause when screen is switched / loses focus
  useFocusEffect(
    useCallback(() => {
      return () => {
        if ((navigation as any).isTimeFocused?.() === true) return;
        const active = useFocusStore.getState().activeSession;
        if (!active || active.status !== 'running') return;
        const hid = habitIdRef.current;
        if (active.habitId !== hid) return;
        if (Date.now() - active.startedAt < 1500) return;
        const currentHabit = useHabitStore.getState().habits.find((h) => h.id === hid);
        const isStrict = currentHabit ? currentHabit.strictMode : habitStrictRef.current;
        if (isStrict) pauseSessionRef.current();
      };
    }, [navigation])
  );

  const [mode, setMode] = useState<FocusMode>('timer');
  const [selectedGoalMins, setSelectedGoalMins] = useState<number>(habit.goalMinutes ?? 30);
  // `tick` is just a counter that drives periodic re-renders while running.
  // We do NOT store `now` as state — instead, elapsedMs calls Date.now() inline
  // so it is always accurate with zero staleness on start/resume/pause/stop.
  const [tick, setTick] = useState(0);
  const [lockErrorMessage, setLockErrorMessage] = useState<string | null>(null);
  const [isUiReset, setIsUiReset] = useState<boolean>(false);
  const [resetModalVisible, setResetModalVisible] = useState<boolean>(false);
  // Exact typed time override (timer: new remaining, stopwatch: new display base)
  const [editedBaseMs, setEditedBaseMs] = useState<number | null>(null);
  const [isTimeFocused, setIsTimeFocused] = useState(false);
  const ringProgress = useSharedValue(0);
  // __DEV__ tick forensics (step 1, temporary): detect non-monotonic countdown
  const prevRemainingRef = useRef<number | null>(null);
  const prevSessionKeyRef = useRef<string | null>(null);

  const todayStr = useMemo(() => getTodayDateStr(), []);
  const goalMinutes = habit.goalMinutes ?? 60;
  let timeOptions = [15, 30, 45, 60, goalMinutes].sort((a, b) => (a < b ? a : b));
  timeOptions = timeOptions.filter((min, index) => timeOptions.indexOf(min) === index);

  const habitsVersion = useHabitStore((s) => s.habits);
  const [todayLoggedMs, setTodayLoggedMs] = useState(0);
  useEffect(() => {
    getLogsForHabit(habit.id).then((logs) => {
      const dbTotal = getDailyTotalMs(habit.id, todayStr);
      const todayLog = logs.find((l) => l.date === todayStr);
      const logMinsMs = Math.round((todayLog?.loggedMinutes ?? 0) * 60) * 1000;
      setTodayLoggedMs(Math.max(dbTotal, logMinsMs));
    });
  }, [habit.id, todayStr, activeSession, habitsVersion]);


  const isCurrentHabitActive = activeSession?.habitId === habit.id;
  const isOtherHabitActive = Boolean(activeSession && activeSession.habitId !== habit.id);

  // UI tick — only runs while THIS habit's session is actively running.
  // Keyed on the boolean `isRunning` so it never fires during pause or stop.
  const isRunning = isCurrentHabitActive && activeSession?.status === 'running';
  useEffect(() => {
    if (editedBaseMs) setIsUiReset(true)
    if (!isRunning) {
      prevRemainingRef.current = null;
      prevSessionKeyRef.current = null;
      return;
    }
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    loadActiveSession();
  }, [loadActiveSession]);

  const [activeOtherHabit, setActiveOtherHabit] = useState<Habit | null>(null);
  useEffect(() => {
    if (isOtherHabitActive && activeSession) {
      getHabitById(activeSession.habitId).then((h) => setActiveOtherHabit(h));
    } else {
      setActiveOtherHabit(null);
    }
  }, [isOtherHabitActive, activeSession?.habitId]);

  // Derived elapsed time for active session.
  // Calls Date.now() inline — never stale, no 1-frame jerk on resume/pause/stop.
  // `tick` forces periodic re-evaluation while running; `activeSession` change
  // (pause/stop/resume) re-evaluates immediately with fresh Date.now().
  // eslint-disable-next-line react-hooks/purity
  const elapsedMs = useMemo(() => {
    if (!activeSession || !isCurrentHabitActive) return 0;
    if (activeSession.status === 'running') {
      return activeSession.accumulatedMs + (Date.now() - activeSession.startedAt);
    }
    return activeSession.accumulatedMs;
  }, [activeSession, isCurrentHabitActive, tick]);

  const targetGoalMs = useMemo(() => {
    if (activeSession?.targetGoalMs) {
      return activeSession.targetGoalMs;
    }
    const fullGoalMs = selectedGoalMins * 60 * 1000;
    return isUiReset ? fullGoalMs : Math.max(0, fullGoalMs - todayLoggedMs);
  }, [activeSession, selectedGoalMins, isUiReset, todayLoggedMs]);

  // Remaining time for timer mode
  const remainingMs = useMemo(() => {
    if (isCurrentHabitActive) {
      return Math.max(0, targetGoalMs - elapsedMs);
    }
    if (editedBaseMs !== null) return editedBaseMs;
    const fullGoalMs = selectedGoalMins * 60 * 1000;
    return isUiReset ? fullGoalMs : Math.max(0, fullGoalMs - todayLoggedMs);
  }, [
    isCurrentHabitActive,
    targetGoalMs,
    elapsedMs,
    selectedGoalMins,
    isUiReset,
    todayLoggedMs,
    editedBaseMs,
    tick,
  ]);

  // __DEV__ tick forensics (step 1, temporary): detect non-monotonic countdown
  useEffect(() => {
    if (!__DEV__ || !isCurrentHabitActive || activeSession?.status !== 'running') return;
    const key = `${activeSession.startedAt}|${activeSession.accumulatedMs}|${activeSession.targetGoalMs}`;
    if (prevSessionKeyRef.current !== null && prevSessionKeyRef.current !== key) {
      console.warn(`[tick-forensics] SESSION FLIP prev=${prevSessionKeyRef.current} now=${key}`);
    }
    prevSessionKeyRef.current = key;
    if (prevRemainingRef.current !== null && remainingMs > prevRemainingRef.current) {
      console.warn(
        `[tick-forensics] UP-TICK tick=${tick} now=${Date.now()} ` +
          `startedAt=${activeSession.startedAt} acc=${activeSession.accumulatedMs} ` +
          `target=${targetGoalMs} elapsed=${elapsedMs} prev=${prevRemainingRef.current} nowR=${remainingMs}`
      );
    }
    prevRemainingRef.current = remainingMs;
  }, [remainingMs, isCurrentHabitActive, activeSession, targetGoalMs, elapsedMs, tick]);

  // Stopwatch elapsed display
  const stopwatchDisplayMs = useMemo(() => {
    if (isCurrentHabitActive) {
      return (editedBaseMs ?? (isUiReset ? 0 : todayLoggedMs)) + elapsedMs;
    }
    if (editedBaseMs !== null) return editedBaseMs;
    return isUiReset ? 0 : todayLoggedMs;
  }, [isCurrentHabitActive, elapsedMs, isUiReset, todayLoggedMs, editedBaseMs]);

  const handleStopAndLog = useCallback(
    (reason?: 'completed') => {
      stopSession(reason);
      // DB already updated synchronously — refresh optimistically so display
      // never flashes the pre-session value before async reload completes
      const fresh = getDailyTotalMs(habit.id, todayStr);
      setTodayLoggedMs((prev) => Math.max(fresh, prev));
      // setEditedBaseMs(null);
    },
    [stopSession, habit.id, todayStr]
  );

  const handleStopAndExit = useCallback(() => {
    handleStopAndLog();
    setExitModalVisible(false);
    if (pendingNavigationAction) {
      navigation.dispatch(pendingNavigationAction);
    } else {
      router.back();
    }
  }, [handleStopAndLog, pendingNavigationAction, navigation]);

  // Auto-stop and log session when timer hits 00:00
  useEffect(() => {
    const currentTimerMode = isCurrentHabitActive ? activeSession!.mode : mode;
    if (!isRunning || currentTimerMode !== 'timer' || targetGoalMs <= 0) return;

    if (elapsedMs >= targetGoalMs) {
      hapticNotification();
      handleStopAndLog('completed');
    }
  }, [
    isRunning,
    isCurrentHabitActive,
    activeSession,
    mode,
    targetGoalMs,
    elapsedMs,
    handleStopAndLog,
  ]);

  const fullGoalMs = selectedGoalMins * 60 * 1000;
  const progressPercent = useMemo(() => {
    if (mode === 'stopwatch' || fullGoalMs <= 0) return 0;
    if (isUiReset || isCurrentHabitActive) {
      return isCurrentHabitActive ? Math.min(100, Math.round((elapsedMs / targetGoalMs) * 100)) : 0;
    }
    const totalAccumulated = todayLoggedMs + (isCurrentHabitActive ? elapsedMs : 0);
    return Math.min(100, Math.round((totalAccumulated / fullGoalMs) * 100));
  }, [mode, fullGoalMs, isUiReset, isCurrentHabitActive, elapsedMs, targetGoalMs, todayLoggedMs]);

  // Animate ring: 100% = full ring, 0% = empty ring
  useEffect(() => {
    ringProgress.value = withTiming(100 - progressPercent, { duration: 500 });
  }, [progressPercent, ringProgress]);

  const ringAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * ((100 - ringProgress.value) / 100),
  }));

  const handleStart = () => {
    setLockErrorMessage(null);
    requestNotificationPermission().catch(() => {});
    let targetMs: number | null = null;
    if (mode === 'timer') {
      if (editedBaseMs !== null) {
        targetMs = editedBaseMs;
      } else {
        const fullGoal = selectedGoalMins * 60 * 1000;
        const remaining = isUiReset ? fullGoal : Math.max(0, fullGoal - todayLoggedMs);
        targetMs = remaining > 0 ? remaining : fullGoal;
      }
    }

    const success = startSession(habit.id, mode, targetMs, isUiReset);
    if (!success) {
      const otherName = activeOtherHabit?.name ?? 'another habit';
      setLockErrorMessage(`"${otherName}" session is currently active. Resolve it first.`);
    }
  };

  const handleResetUi = () => {
    if (isCurrentHabitActive) {
      cancelSessionWithoutLogging();
    }
    setIsUiReset(true);
    setEditedBaseMs(null);
  };

  const handleClearDb = () => {
    if (isCurrentHabitActive) {
      cancelSessionWithoutLogging();
    }
    resetTodayLoggedMinutes(habit.id, todayStr);
    useHabitStore.getState().loadHabits();
    setIsUiReset(false);
    setEditedBaseMs(null);
  };

  // Typed time supersedes reset view — show exact value from here on
  const handleTimeConfirm = (ms: number) => {
    setEditedBaseMs(ms);
    setIsUiReset(true);
  };

  const currentMode = isCurrentHabitActive ? activeSession!.mode : mode;

  return (
    <TouchableWithoutFeedback
      onPress={() => {
        setIsTimeFocused(false);
        Keyboard.dismiss();
      }}
      accessible={false}>
      <View className="flex-1 bg-background pb-8 pt-4">
        {/* Animated Mode Selector */}
        <View
          pointerEvents={isTimeFocused ? 'none' : 'auto'}
          style={{ opacity: isTimeFocused ? 0.5 : 1 }}>
          <SegmentedToggle
            fullWidth={false}
            options={['Timer', 'Stopwatch']}
            value={currentMode === 'timer' ? 'Timer' : 'Stopwatch'}
            onChange={(val) => {
              if (!isCurrentHabitActive) {
                setMode(val === 'Timer' ? 'timer' : 'stopwatch');
                setEditedBaseMs(null);
              }
            }}
          />
        </View>

        {/* Lock Banner if another habit session is active */}
        {isOtherHabitActive && (
          <View className="mb-6 flex-row items-center gap-3 rounded-2xl border border-warning/50 bg-surface p-4">
            <Ionicons name="lock-closed" size={20} color={DataColors.warning} />
            <View className="flex-1">
              <Text className="text-sm font-bold text-text">Session Locked</Text>
              <Text className="mt-0.5 text-xs text-textMuted">
                &quot;{activeOtherHabit?.name ?? 'Another habit'}&quot; is currently{' '}
                {activeSession?.status}. Resolve it first.
              </Text>
            </View>
          </View>
        )}

        {lockErrorMessage && (
          <View className="mb-4 rounded-2xl border border-danger/50 bg-surface p-3">
            <Text className="text-center text-xs font-semibold text-danger">
              {lockErrorMessage}
            </Text>
          </View>
        )}

        {/* Timer / Stopwatch Main Display Card */}
        <View className="mb-4 items-center justify-center rounded-3xl border border-border bg-surface p-8 shadow-sm">
          {/* Reset Header Row */}
          <View className="mb-2 w-full flex-row items-center justify-between">
            <Text className="text-xs font-semibold uppercase tracking-wider text-textMuted">
              {isCurrentHabitActive
                ? activeSession?.status === 'running'
                  ? currentMode === 'timer'
                    ? 'Time Remaining'
                    : 'Elapsed Time'
                  : currentMode === 'timer'
                    ? 'Timer Paused'
                    : 'Stopwatch Paused'
                : currentMode === 'timer'
                  ? 'Target Goal'
                  : 'Stopwatch Mode'}
            </Text>
            <Pressable
              onPress={() => {
                if (isTimeFocused) {
                  Keyboard.dismiss();
                  setIsTimeFocused(false);
                  return;
                }
                if (isUiReset) {
                  hapticImpact();
                  setIsUiReset(false);
                  setEditedBaseMs(null);
                } else {
                  setResetModalVisible(true);
                }
              }}
              disabled={isRunning || isTimeFocused}
              className={`flex-row items-center gap-1 rounded-xl border border-border bg-background px-2.5 py-1 ${isTimeFocused || isRunning ? 'opacity-40' : 'active:opacity-80'}`}>
              <Ionicons
                name={isUiReset ? 'arrow-undo-outline' : 'reload-outline'}
                size={13}
                color={Colors.secondary}
              />
              <Text className="text-[11px] font-semibold text-textMuted">
                {isUiReset ? 'Restore' : 'Reset'}
              </Text>
            </Pressable>
          </View>

          {currentMode === 'timer' ? (
            <>
              {/* Countdown Ring */}
              <View className="mt-2 items-center justify-center">
                <Svg
                  width={RING_SIZE}
                  height={RING_SIZE}
                  style={{ transform: [{ rotate: '-90deg' }] }}>
                  <Circle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_RADIUS}
                    strokeWidth={RING_STROKE}
                    stroke="rgba(255,255,255,0.08)"
                    fill="none"
                  />
                  <AnimatedCircle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_RADIUS}
                    strokeWidth={RING_STROKE}
                    stroke={Colors.primary}
                    fill="none"
                    strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
                    strokeLinecap="round"
                    animatedProps={ringAnimatedProps}
                  />
                </Svg>
                <View className="absolute items-center justify-center">
                  <EditableTimeDisplay
                    valueMs={remainingMs}
                    disabled={isCurrentHabitActive}
                    onConfirm={handleTimeConfirm}
                    ceilDisplay
                    isFocused={isTimeFocused}
                    onFocusedChange={setIsTimeFocused}
                  />
                </View>
              </View>
              {!editedBaseMs && <Text className="mt-4 text-xs font-medium text-textMuted">
                {!isUiReset && todayLoggedMs > 0
                  ? `${formatDuration(todayLoggedMs)} logged today`
                  : `Target: ${formatDuration(selectedGoalMins * 60 * 1000)} `}
              </Text>}

              {/* Goal Presets (when idle) */}
              {!isCurrentHabitActive && (
                <View className="mt-6 flex-row gap-2">
                  {timeOptions.map((mins) => (
                    <Pressable
                      key={mins}
                      disabled={isTimeFocused}
                      onPress={() => {
                        setSelectedGoalMins(mins);
                        setEditedBaseMs(null);
                      }}
                      className={`rounded-xl border px-3 py-1.5 ${isTimeFocused ? 'opacity-40' : ''} ${
                        selectedGoalMins === mins && !editedBaseMs
                          ? 'border-primary bg-primary'
                          : 'border-border bg-background'
                      }`}>
                      <Text
                        className={`text-xs font-bold ${
                          selectedGoalMins === mins && !editedBaseMs
                            ? 'text-white'
                            : 'text-textMuted'
                        }`}>
                        {mins}m {mins === goalMinutes && '(Goal)'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          ) : (
            <>
              <EditableTimeDisplay
                valueMs={stopwatchDisplayMs}
                disabled={isCurrentHabitActive}
                onConfirm={handleTimeConfirm}
                isFocused={isTimeFocused}
                onFocusedChange={setIsTimeFocused}
              />
              <Text className="mt-1 text-xs font-medium text-textMuted">
                {!isUiReset && todayLoggedMs > 0
                  ? `Continuing from ${formatDuration(todayLoggedMs)} logged today`
                  : 'Open-ended count-up session'}
              </Text>
            </>
          )}
        </View>

        {/* Control Buttons */}
        <View className="mt-6 gap-3">
          {!isCurrentHabitActive ? (
            <Pressable
              onPress={handleStart}
              disabled={isOtherHabitActive || isTimeFocused}
              className={`flex-row items-center justify-center gap-2 rounded-2xl py-4 ${
                isOtherHabitActive || isTimeFocused
                  ? 'bg-surface opacity-50'
                  : 'bg-primary active:opacity-90'
              }`}>
              <Ionicons name="play" size={20} color="#FFFFFF" />
              <Text className="text-base font-bold text-white">Start Focus Session</Text>
            </Pressable>
          ) : (
            <View className="flex-row gap-3">
              {activeSession?.status === 'running' ? (
                <Pressable
                  onPress={pauseSession}
                  disabled={isTimeFocused}
                  className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-4 ${isTimeFocused ? 'opacity-40' : 'active:opacity-80'}`}>
                  <Ionicons name="pause" size={20} color={Colors.text} />
                  <Text className="text-base font-bold text-text">Pause</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={resumeSession}
                  disabled={isTimeFocused}
                  className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-4 ${isTimeFocused ? 'opacity-40' : 'active:opacity-90'}`}>
                  <Ionicons name="play" size={20} color="#FFFFFF" />
                  <Text className="text-base font-bold text-white">Resume</Text>
                </Pressable>
              )}

              <Pressable
                onPress={() => handleStopAndLog()}
                disabled={isTimeFocused}
                className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-danger py-4 ${isTimeFocused ? 'opacity-40' : 'active:opacity-90'}`}>
                <Ionicons name="square" size={18} color="#FFFFFF" />
                <Text className="text-base font-bold text-white">Stop & Log</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Strict Mode Toggle Row */}
        <View className="mt-4 flex-row items-center justify-between rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <View className="flex-1 flex-row items-center gap-3 pr-3">
            <View
              className={`h-10 w-10 items-center justify-center rounded-xl ${
                strictMode ? 'bg-primary/20' : 'bg-background'
              }`}>
              <Ionicons
                name={strictMode ? 'shield-checkmark' : 'shield-outline'}
                size={20}
                color={strictMode ? Colors.primary : Colors.secondary}
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-text">Strict Mode</Text>
              <Text className="mt-0.5 text-xs text-textMuted">
                Auto-pause when screen or app is switched
              </Text>
            </View>
          </View>
          <AnimatedSwitch
            value={strictMode}
            disabled={isTimeFocused}
            onValueChange={(val) => {
              hapticImpact();
              setStrictMode(val);
              updateHabit(habit.id, { strictMode: val });
            }}
          />
        </View>

        {/* Exit Confirmation Modal Prompt (Strict Mode ON) */}
        <ExitFocusModal
          visible={exitModalVisible}
          habitName={toTitleCase(habit.name)}
          onStay={handleStay}
          onStopAndExit={handleStopAndExit}
        />

        {/* Reset Focus Modal Prompt */}
        <ResetFocusModal
          visible={resetModalVisible}
          habitName={toTitleCase(habit.name)}
          todayLoggedMs={todayLoggedMs}
          currentMode={currentMode}
          onClose={() => setResetModalVisible(false)}
          onResetUi={handleResetUi}
          onClearDb={handleClearDb}
        />

        {/* Stale Session Auto-Timeout Modal Prompt */}
        {stalePrompt && stalePrompt.visible && (
          <Modal transparent animationType="fade" visible={stalePrompt.visible}>
            <View className="flex-1 items-center justify-center bg-black/70 px-6">
              <View className="w-full items-center rounded-3xl border border-border bg-surface p-6">
                <Ionicons name="time-outline" size={40} color={DataColors.warning} />
                <Text className="mt-3 text-center text-xl font-bold text-text">Session Paused</Text>
                <Text className="mt-2 px-2 text-center text-xs leading-5 text-textMuted">
                  &quot;{stalePrompt.habitName}&quot; was paused {stalePrompt.pausedMinsAgo} minutes
                  ago. Would you like to resume or log and stop?
                </Text>

                <View className="mt-6 w-full flex-row gap-3">
                  <Pressable
                    onPress={() => handleStopAndLog()}
                    className="flex-1 items-center rounded-2xl bg-danger py-3.5">
                    <Text className="text-sm font-bold text-white">Log & Stop</Text>
                  </Pressable>
                  <Pressable
                    onPress={resumeSession}
                    className="flex-1 items-center rounded-2xl bg-primary py-3.5">
                    <Text className="text-sm font-bold text-white">Resume</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
}
