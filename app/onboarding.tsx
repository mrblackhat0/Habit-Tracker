import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  BackHandler,
  Alert,
  Modal,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors, DataColors } from '@/constants/Colors';
import { getIconColor } from '@/constants/Icons';
import { toTitleCase } from '@/utils/utils';
import { useStore } from '@/store/store';
import { ProfilePhotoActionSheet } from '@/components/ProfilePhotoActionSheet';
import { pickProfileImage, removeProfileImage } from '@/utils/profileImage';
import * as SplashScreen from 'expo-splash-screen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { replay } = useLocalSearchParams<{ replay?: string }>();
  const isReplaying = replay === 'true';

  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const isExitingRef = useRef(false);

  const existingUserName = useStore((s) => s.userName);
  const existingProfileImage = useStore((s) => s.profileImageUri);
  const [userName, setUserName] = useState(existingUserName ? existingUserName : '');
  const [profileImageUri, setProfileImageUri] = useState<string | null>(existingProfileImage);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoSheetVisible, setPhotoSheetVisible] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);

  const shakeOffset = useSharedValue(0);
  const floatingY = useSharedValue(0);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    floatingY.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );
    return () => {
      try {
        cancelAnimation(floatingY);
        cancelAnimation(shakeOffset);
      } catch {}
    };
  }, []);

  const handleExit = React.useCallback(() => {
    if (isExitingRef.current) return;
    isExitingRef.current = true;
    try {
      cancelAnimation(floatingY);
      cancelAnimation(shakeOffset);
    } catch {}
    // instant pop — onboarding has animation:'none', back is non-jank vs replace which re-animates (tabs) slide
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, []);

  useEffect(() => {
    const onBackPress = () => {
      if (currentIndex > 0) {
        goToSlide(currentIndex - 1);
        return true;
      }
      if (isReplaying) {
        handleExit();
        return true;
      }
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [currentIndex, isReplaying, handleExit]);

  const floatingStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatingY.value }],
  }));

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeOffset.value }],
  }));

  const triggerShake = () => {
    shakeOffset.value = withSequence(
      withTiming(-12, { duration: 60 }),
      withTiming(12, { duration: 60 }),
      withTiming(-10, { duration: 60 }),
      withTiming(10, { duration: 60 }),
      withTiming(-6, { duration: 60 }),
      withTiming(0, { duration: 60 })
    );
  };

  const goToSlide = (index: number) => {
    useStore.getState().triggerHaptic('light');
    flatListRef.current?.scrollToIndex({ index, animated: true });
    setCurrentIndex(index);
  };

  const handleNext = () => {
    if (currentIndex < 3) goToSlide(currentIndex + 1);
  };

  const handleSkip = () => goToSlide(3);

  const handleFinish = async () => {
    const trimmed = userName.trim();
    if (!trimmed) {
      setErrorMessage('Username is required to get started');
      triggerShake();
      useStore.getState().triggerHaptic('heavy');
      return;
    }
    setErrorMessage('');
    setIsSubmitting(true);
    useStore.getState().triggerHaptic('medium');
    try {
      await useStore.getState().completeOnboarding(trimmed, profileImageUri);
      router.replace('/(tabs)');
    } catch {
      setIsSubmitting(false);
      Alert.alert('Error', 'Could not save profile. Please try again.');
    }
  };

  const handleOpenPhotoSheet = () => {
    useStore.getState().triggerHaptic('light');
    setPhotoSheetVisible(true);
  };

  const handleLibraryPick = async () => {
    try {
      const uri = await pickProfileImage(false);
      if (uri) {
        setProfileImageUri(uri);
        useStore.getState().triggerHaptic('light');
      }
    } catch (err: any) {
      Alert.alert('Photo Access', err.message || 'Unable to open photo library');
    }
  };

  const handleCameraPick = async () => {
    try {
      const uri = await pickProfileImage(true);
      if (uri) {
        setProfileImageUri(uri);
        useStore.getState().triggerHaptic('light');
      }
    } catch (err: any) {
      Alert.alert('Camera Access', err.message || 'Unable to access camera');
    }
  };

  const handleRemovePhoto = async () => {
    await removeProfileImage();
    setProfileImageUri(null);
    useStore.getState().triggerHaptic('light');
  };

  const renderSlide = ({ index }: { index: number }) => {
    if (index === 0) {
      return (
        <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-4 py-4">
          <View className="flex-1 items-center justify-center">
            <Animated.View
              style={floatingStyle}
              className="w-full max-w-sm rounded-2xl border border-border bg-surface p-4 shadow-sm">
              {/* Streak row — same as HabitDetail streak card */}
              <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-primary/20 bg-primary/10 px-3.5 py-3">
                <View className="flex-row items-center gap-3">
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                    <Text className="text-lg">🔥</Text>
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-text">7-Day Streak Active</Text>
                    <Text className="text-xs text-secondary">Keep the momentum going!</Text>
                  </View>
                </View>
                <View className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1">
                  <Text className="text-xs font-bold text-primary">Top 5%</Text>
                </View>
              </View>

              <View className="gap-2.5">
                <View className="flex-row items-center justify-between rounded-2xl border border-border bg-background px-3.5 py-3">
                  <View className="flex-row items-center gap-3">
                    <View
                      className="h-10 w-10 items-center justify-center rounded-xl border border-border"
                      style={{ backgroundColor: `${DataColors.positive}14` }}>
                      <Ionicons name="sunny" size={18} color={DataColors.positive} />
                    </View>
                    <View>
                      <Text className="text-sm font-semibold text-text">Morning Meditation</Text>
                      <Text className="text-xs text-secondary">Everyday • 15 mins</Text>
                    </View>
                  </View>
                  <View className="h-9 w-9 items-center justify-center rounded-full border border-positive bg-positive">
                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  </View>
                </View>

                <View className="flex-row items-center justify-between rounded-2xl border border-border bg-background px-3.5 py-3">
                  <View className="flex-row items-center gap-3">
                    <View
                      className="h-10 w-10 items-center justify-center rounded-xl border border-border"
                      style={{ backgroundColor: `${DataColors.info}14` }}>
                      <Ionicons name="water" size={18} color={DataColors.info} />
                    </View>
                    <View>
                      <Text className="text-sm font-semibold text-text">Hydration Goal</Text>
                      <Text className="text-xs text-secondary">Daily • 2,500 ml</Text>
                    </View>
                  </View>
                  <View className="h-9 w-9 items-center justify-center rounded-full border border-positive bg-positive">
                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  </View>
                </View>

                <View className="flex-row items-center justify-between rounded-2xl border border-border bg-background px-3.5 py-3">
                  <View className="flex-row items-center gap-3">
                    <View
                      className="h-10 w-10 items-center justify-center rounded-xl border border-border"
                      style={{ backgroundColor: `${Colors.primary}14` }}>
                      <Ionicons name="book" size={18} color={Colors.primary} />
                    </View>
                    <View>
                      <Text className="text-sm font-semibold text-text">Read 20 Pages</Text>
                      <Text className="text-xs text-secondary">In progress • 14/20</Text>
                    </View>
                  </View>
                  <View className="h-9 w-9 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
                    <Ionicons name="time-outline" size={14} color={Colors.primary} />
                  </View>
                </View>
              </View>
            </Animated.View>

            <View className="mt-8 items-center px-2">
              <View className="mb-3 rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
                <Text className="text-xs font-semibold uppercase tracking-widest text-primary">
                  Daily Tracking
                </Text>
              </View>
              <Text className="text-center text-2xl font-bold tracking-tight text-text">
                Build Unstoppable Habits
              </Text>
              <Text className="mt-2 text-center text-sm leading-5 text-secondary">
                Turn micro-actions into monumental daily achievements. Track streaks, log daily
                check-ins, and build disciplined routines.
              </Text>
            </View>
          </View>
        </View>
      );
    }

    if (index === 1) {
      return (
        <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-4 py-4">
          <View className="flex-1 items-center justify-center">
            <Animated.View
              style={floatingStyle}
              className="w-full max-w-sm items-center rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <View className="relative mb-5 h-36 w-36 items-center justify-center rounded-full border-4 border-primary/20 bg-background">
                <View
                  className="absolute inset-0 rounded-full border-4 border-dashed"
                  style={{ borderColor: `${Colors.primary}60` }}
                />
                <View className="items-center">
                  <Text className="text-3xl font-bold tracking-tight text-text">25:00</Text>
                  <Text className="mt-0.5 text-xs font-semibold uppercase tracking-widest text-primary">
                    Pomodoro
                  </Text>
                </View>
              </View>

              <View className="w-full gap-2">
                <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-background px-3.5 py-3">
                  <View
                    className="h-8 w-8 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${Colors.primary}14` }}>
                    <Ionicons name="timer-outline" size={16} color={Colors.primary} />
                  </View>
                  <Text className="text-sm font-semibold text-text">Timer & Stopwatch Modes</Text>
                </View>
                <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-background px-3.5 py-3">
                  <View
                    className="h-8 w-8 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${DataColors.warning}14` }}>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={16}
                      color={DataColors.warning}
                    />
                  </View>
                  <Text className="text-sm font-semibold text-text">
                    Strict Anti-Distraction Mode
                  </Text>
                </View>
                <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-background px-3.5 py-3">
                  <View
                    className="h-8 w-8 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${DataColors.positive}14` }}>
                    <Ionicons name="notifications-outline" size={16} color={DataColors.positive} />
                  </View>
                  <Text className="text-sm font-semibold text-text">Live Lock Screen Controls</Text>
                </View>
              </View>
            </Animated.View>

            <View className="mt-8 items-center px-2">
              <View className="mb-3 rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
                <Text className="text-xs font-semibold uppercase tracking-widest text-primary">
                  Deep Focus
                </Text>
              </View>
              <Text className="text-center text-2xl font-bold tracking-tight text-text">
                Laser-Sharp Concentration
              </Text>
              <Text className="mt-2 text-center text-sm leading-5 text-secondary">
                Eliminate distractions and achieve flow state. Use precision timers with persistent
                background notifications.
              </Text>
            </View>
          </View>
        </View>
      );
    }

    if (index === 2) {
      // Dummy monthly tracker — same visual rows as components/MonthlyHabitsTracker.tsx
      const dummyHabits = [
        {
          id: 1,
          name: 'morning run',
          icon: 'walk',
          done: [
            true,
            true,
            false,
            true,
            true,
            true,
            false,
            true,
            true,
            false,
            true,
            true,
            true,
            false,
          ],
        },
        {
          id: 2,
          name: 'drink water',
          icon: 'water',
          done: [
            true,
            false,
            true,
            true,
            false,
            true,
            true,
            true,
            false,
            true,
            true,
            false,
            true,
            true,
          ],
        },
        {
          id: 3,
          name: 'read book',
          icon: 'book',
          done: [
            true,
            true,
            true,
            false,
            true,
            false,
            true,
            true,
            true,
            true,
            false,
            true,
            false,
            true,
          ],
        },
        {
          id: 4,
          name: 'meditate',
          icon: 'leaf',
          done: [
            false,
            true,
            true,
            true,
            true,
            false,
            true,
            false,
            true,
            true,
            true,
            true,
            false,
            true,
          ],
        },
      ] as const;

      return (
        <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-4 py-4">
          <View className="flex-1 items-center justify-center">
            <Animated.View
              style={floatingStyle}
              className="w-full max-w-sm rounded-2xl border border-border bg-surface p-4 shadow-sm">
              {/* Header like MonthlyHabitsTracker left “Habits • 4” */}
              <View className="mb-3 flex-row items-center justify-between">
                <View className="flex-row items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5">
                  <Ionicons name="list" size={12} color="#94A3B8" />
                  <Text className="text-xs font-bold text-text">Habits</Text>
                  <Text className="text-xs font-semibold text-textMuted">• 4</Text>
                </View>
                <View className="rounded-full border border-positive/20 bg-positive/10 px-2.5 py-1">
                  <Text className="text-xs font-bold text-positive">86% Month</Text>
                </View>
              </View>

              {/* Week header — two weeks preview, same 20+8 grouping as MonthlyHabitsTracker */}
              <View className="mb-2 flex-row items-center">
                <View className="w-28" />
                <View className="flex-1 flex-row items-center justify-end">
                  <Text className="flex-1 text-center text-[10px] font-bold uppercase tracking-wider text-primary">
                    Week 1
                  </Text>
                  <Text className="flex-1 text-center text-[10px] font-bold uppercase tracking-wider text-primary">
                    Week 2
                  </Text>
                </View>
              </View>

              {/* Dummy tracker rows — mirrors MonthlyHabitsTracker.tsx box style */}
              <View style={{ gap: 4 }}>
                {dummyHabits.map((h) => (
                  <View key={h.id} className="flex-row items-center">
                    <View className="w-28 flex-row items-center gap-2 py-0.5">
                      <Ionicons name={h.icon as any} size={14} color={getIconColor(h.icon)} />
                      <Text
                        numberOfLines={1}
                        className="flex-1 text-xs font-semibold text-textMuted">
                        {toTitleCase(h.name)}
                      </Text>
                    </View>
                    <View className="flex-1 flex-row items-center justify-end">
                      {/* Week 1 */}
                      <View className="flex-row gap-1">
                        {h.done.slice(0, 7).map((isCompleted, i) => (
                          <View
                            key={`w1-${i}`}
                            className={`h-5 w-5 items-center justify-center rounded-sm ${
                              isCompleted ? 'bg-positive' : 'border border-gray-500 bg-transparent'
                            }`}>
                            {isCompleted && (
                              <Text className="bottom-[0.5px] text-[10px] font-bold text-white">
                                ✓
                              </Text>
                            )}
                          </View>
                        ))}
                      </View>
                      <View className="mx-1.5 h-5 w-[1.5px] self-center rounded-full bg-border opacity-60" />
                      {/* Week 2 */}
                      <View className="flex-row gap-1">
                        {h.done.slice(7, 14).map((isCompleted, i) => (
                          <View
                            key={`w2-${i}`}
                            className={`h-5 w-5 items-center justify-center rounded-sm ${
                              isCompleted ? 'bg-positive' : 'border border-gray-500 bg-transparent'
                            }`}>
                            {isCompleted && (
                              <Text className="bottom-[0.5px] text-[10px] font-bold text-white">
                                ✓
                              </Text>
                            )}
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              <Text className="mt-3 text-center text-[10px] font-medium text-textMuted">
                Monthly view • 4 habits • tap to see full calendar
              </Text>
            </Animated.View>

            <View className="mt-8 items-center px-2">
              <View className="mb-3 rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
                <Text className="text-xs font-semibold uppercase tracking-widest text-primary">
                  Visual Insights
                </Text>
              </View>
              <Text className="text-center text-2xl font-bold tracking-tight text-text">
                Visualize Your Momentum
              </Text>
              <Text className="mt-2 text-center text-sm leading-5 text-secondary">
                Track every day at a glance — monthly rows, check-offs and streaks just like in the
                app.
              </Text>
            </View>
          </View>
        </View>
      );
    }

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ width: SCREEN_WIDTH }}
        className="flex-1">
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          className="px-4 py-4">
          <View className="w-full max-w-sm self-center">
            <View className="mb-3 self-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
              <Text className="text-xs font-semibold uppercase tracking-widest text-primary">
                Final Step
              </Text>
            </View>

            <Text className="text-center text-2xl font-bold tracking-tight text-text">
              Set Up Your Profile
            </Text>
            <Text className="mt-1.5 text-center text-sm leading-5 text-secondary">
              Personalize your account before entering your habit sanctuary.
            </Text>

            <View className="my-6 items-center">
              <Pressable onPress={handleOpenPhotoSheet} className="relative active:opacity-80">
                {profileImageUri ? (
                  <View>
                    <Image
                      source={{ uri: profileImageUri }}
                      style={{
                        width: 96,
                        height: 96,
                        borderRadius: 48,
                        borderWidth: 3,
                        borderColor: Colors.primary,
                      }}
                    />
                    <View className="absolute -bottom-1 -right-1 h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-primary">
                      <Ionicons name="camera" size={16} color="#FFFFFF" />
                    </View>
                  </View>
                ) : (
                  <View
                    className="items-center justify-center rounded-2xl border border-border bg-surface"
                    style={{ width: 96, height: 96 }}>
                    <Ionicons name="person" size={36} color={Colors.primary} />
                    <View className="absolute -bottom-1 -right-1 h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-primary">
                      <Ionicons name="add" size={18} color="#FFFFFF" />
                    </View>
                  </View>
                )}
              </Pressable>
              <Pressable
                onPress={handleOpenPhotoSheet}
                className="mt-3 flex-row items-center gap-1.5">
                <Text className="text-sm font-semibold text-primary">
                  {profileImageUri ? 'Change Photo' : 'Add Photo'}
                </Text>
                <Text className="text-xs text-textMuted">(Optional)</Text>
              </Pressable>
            </View>

            <View className="mb-4">
              <View className="mb-2 flex-row items-center justify-between">
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-xs font-semibold uppercase tracking-widest text-textMuted">
                    Username
                  </Text>
                  <Text className="text-xs font-bold text-danger">*</Text>
                </View>
                <View className="rounded-full border border-danger/20 bg-danger/10 px-2 py-0.5">
                  <Text className="text-xs font-bold text-danger">Required</Text>
                </View>
              </View>

              <Animated.View style={shakeStyle}>
                <View
                  className={`flex-row items-center rounded-2xl border bg-surface px-4 py-3.5 ${errorMessage ? 'border-danger' : 'border-border'}`}>
                  <Ionicons
                    name="person"
                    size={18}
                    color={errorMessage ? DataColors.danger : Colors.primary}
                    style={{ marginRight: 10 }}
                  />
                  <TextInput
                    value={userName}
                    onChangeText={(txt) => {
                      setUserName(txt);
                      if (errorMessage) setErrorMessage('');
                    }}
                    placeholder="e.g. Alex, Jordan, Rebel"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="words"
                    autoCorrect={false}
                    maxLength={24}
                    returnKeyType="done"
                    onSubmitEditing={handleFinish}
                    className="flex-1 text-base font-semibold text-text"
                  />
                  {userName.length > 0 ? (
                    <Pressable onPress={() => setUserName('')} hitSlop={8} className="p-1">
                      <Ionicons name="close-circle" size={18} color={Colors.secondary} />
                    </Pressable>
                  ) : null}
                </View>
              </Animated.View>

              <View className="mt-2 flex-row items-center justify-between px-1">
                {errorMessage ? (
                  <Text className="text-xs font-medium text-danger">{errorMessage}</Text>
                ) : (
                  <Text className="text-xs text-textMuted">This will be your display name</Text>
                )}
                <Text className="text-xs text-textMuted">{userName.length}/24</Text>
              </View>
            </View>

            <Pressable
              onPress={handleFinish}
              disabled={isSubmitting}
              className={`mt-4 flex-row items-center justify-center gap-2 rounded-2xl py-4 shadow-sm ${userName.trim().length > 0 ? 'bg-primary' : 'border border-border bg-surface'} ${isSubmitting ? 'opacity-60' : 'active:opacity-90'}`}>
              <Text
                className={`text-base font-bold ${userName.trim().length > 0 ? 'text-white' : 'text-textMuted'}`}>
                {isSubmitting ? 'Setting up...' : 'Get Started'}
              </Text>
              <Ionicons
                name="rocket-outline"
                size={18}
                color={userName.trim().length > 0 ? '#FFFFFF' : Colors.textMuted}
              />
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  return (
    <View
      style={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        backgroundColor: Colors.background,
      }}
      className="flex-1">
      <View className="h-12 flex-row items-center justify-between px-4">
        {currentIndex > 0 ? (
          <Pressable
            onPress={() => goToSlide(currentIndex - 1)}
            hitSlop={12}
            className="flex-row items-center gap-1 rounded-xl border border-border bg-surface px-3 py-1.5 active:opacity-70">
            <Ionicons name="chevron-back" size={18} color={Colors.text} />
            <Text className="text-sm font-semibold text-text">Back</Text>
          </Pressable>
        ) : isReplaying ? (
          <Pressable
            onPress={handleExit}
            hitSlop={12}
            className="flex-row items-center gap-1 rounded-xl border border-border bg-surface px-3 py-1.5 active:opacity-70">
            <Ionicons name="close" size={18} color={Colors.text} />
            <Text className="text-sm font-semibold text-text">Exit</Text>
          </Pressable>
        ) : (
          <View style={{ width: 64 }} />
        )}
        {currentIndex < 3 ? (
          <Pressable
            onPress={handleSkip}
            hitSlop={12}
            className="rounded-xl border border-border bg-surface px-3 py-1.5 active:opacity-70">
            <Text className="text-sm font-semibold text-secondary">Skip</Text>
          </Pressable>
        ) : (
          <View style={{ width: 64 }} />
        )}
      </View>

      <FlatList
        ref={flatListRef}
        data={[0, 1, 2, 3]}
        keyExtractor={(item) => item.toString()}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        removeClippedSubviews
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={1}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        onMomentumScrollEnd={(e) => {
          const newIdx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          if (newIdx !== currentIndex) {
            setCurrentIndex(newIdx);
            useStore.getState().triggerHaptic('light');
          }
        }}
        scrollEventThrottle={16}
        className="flex-1"
      />

      {/* Reserve footer height so last profile screen doesn't shift down when Next disappears */}
      <View
        pointerEvents={currentIndex < 3 ? 'auto' : 'none'}
        style={{ height: 76, opacity: currentIndex < 3 ? 1 : 0 }}
        className="flex-row items-center justify-between border-t border-border bg-background px-4">
        <View className="flex-row items-center gap-2">
          {[0, 1, 2, 3].map((idx) => {
            const isActive = idx === currentIndex;
            return (
              <View
                key={idx}
                style={{
                  width: isActive ? 24 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: isActive ? Colors.primary : Colors.border,
                }}
              />
            );
          })}
        </View>
        <Pressable
          onPress={handleNext}
          className="flex-row items-center gap-2 rounded-2xl bg-primary px-6 py-3.5 shadow-sm active:opacity-90">
          <Text className="text-sm font-bold text-white">Next</Text>
          <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
        </Pressable>
      </View>

      <ProfilePhotoActionSheet
        visible={photoSheetVisible}
        hasPhoto={!!profileImageUri}
        onClose={() => setPhotoSheetVisible(false)}
        onPreview={() => setPreviewVisible(true)}
        onLibrary={handleLibraryPick}
        onCamera={handleCameraPick}
        onRemove={handleRemovePhoto}
      />

      <Modal
        visible={previewVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/80 p-4">
          <Pressable
            onPress={() => setPreviewVisible(false)}
            className="absolute right-6 top-14 z-10 h-10 w-10 items-center justify-center rounded-full border border-border bg-surface">
            <Ionicons name="close" size={22} color={Colors.text} />
          </Pressable>
          {profileImageUri ? (
            <Image
              source={{ uri: profileImageUri }}
              style={{ width: SCREEN_WIDTH - 48, height: SCREEN_WIDTH - 48, borderRadius: 24 }}
              resizeMode="cover"
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}
