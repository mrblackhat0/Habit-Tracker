import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Share,
  Linking,
  Modal,
  TextInput,
  TouchableWithoutFeedback,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { Colors, DataColors } from '@/constants/Colors';
import { useStore } from '@/store/store';
import { useHabitStore } from '@/store/habitStore';
import { db } from '@/db/habits';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AnimatedSwitch from '@/components/AnimatedSwitch';
import SettingItem, { SettingDivider } from '@/components/SettingItem';
import EditNameModal from '@/components/EditNameModal';
import AppAlertModal from '@/components/AppAlertModal';
import ProfilePhotoActionSheet from '@/components/ProfilePhotoActionSheet';
import {
  pickProfileImage,
  removeProfileImage,
  validateProfileImageUri,
} from '@/utils/profileImage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function Settings() {
  const insets = useSafeAreaInsets();
  const {
    userName,
    profileImageUri,
    hapticsEnabled,
    weeklyOverviewEnabled,
    focusNotificationsEnabled,
    alarmEnabled,
    setUserName,
    setHapticsEnabled,
    setWeeklyOverview,
    setFocusNotifications,
    triggerHaptic,
    hydrate,
  } = useStore();
  const clearAll = useHabitStore((s) => s.clearAll);
  const archivedCount = useHabitStore((s) => s.archivedHabits.length);
  const loadArchived = useHabitStore((s) => s.loadArchived);

  const [editVisible, setEditVisible] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importVisible, setImportVisible] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const importDataRef = useRef<any>(null);
  const [importSummary, setImportSummary] = useState<{ name: string; sizeKB: number; habits: number; logs: number } | null>(null);
  const [imageActionVisible, setImageActionVisible] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
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

  useEffect(() => {
    hydrate();
    loadArchived();
  }, [hydrate, loadArchived]);

  useFocusEffect(
    useCallback(() => {
      loadArchived();
    }, [loadArchived])
  );

  const onToggleHaptics = useCallback(
    (v: boolean) => {
      setHapticsEnabled(v);
    },
    [setHapticsEnabled]
  );

  const onToggleWeekly = useCallback(
    (v: boolean) => {
      triggerHaptic('light');
      setWeeklyOverview(v);
    },
    [setWeeklyOverview, triggerHaptic]
  );

  const onToggleFocusNotif = useCallback(
    (v: boolean) => {
      triggerHaptic('light');
      setFocusNotifications(v);
    },
    [setFocusNotifications, triggerHaptic]
  );

  useEffect(() => {
    if (profileImageUri) validateProfileImageUri(profileImageUri);
  }, [profileImageUri]);

  const handlePickImage = useCallback(
    async (useCamera: boolean) => {
      setImageLoading(true);
      try {
        const uri = await pickProfileImage(useCamera);
        if (uri) triggerHaptic('light');
      } catch (e: any) {
        showAlert({
          title: 'Permission needed',
          message: e?.message ?? 'Allow photo access to set profile image.',
          type: 'warning',
          primaryText: 'OK',
        });
      } finally {
        setImageLoading(false);
      }
    },
    [showAlert, triggerHaptic]
  );

  const handleRemoveImage = useCallback(async () => {
    try {
      await removeProfileImage();
      triggerHaptic('light');
    } catch {}
  }, [triggerHaptic]);

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const habits = await db.getAllAsync<any>(`SELECT * FROM habits`);
      const logs = await db.getAllAsync<any>(`SELECT * FROM habit_logs ORDER BY date DESC`);
      const settingsRows = await db.getAllAsync<any>(`SELECT * FROM app_settings`).catch(() => []);
      const payload = {
        exportedAt: new Date().toISOString(),
        app: 'Habit-Tracker',
        version: Constants.expoConfig?.version ?? '1.0.0',
        habits,
        logs,
        settings: settingsRows,
      };
      const json = JSON.stringify(payload);
      const fileName = `habit-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const dir = (FileSystem as any).cacheDirectory ?? (FileSystem as any).documentDirectory ?? '';
      const fileUri = `${dir}${fileName}`;
      // write file (legacy + new API fallback)
      try {
        if ((FileSystem as any).writeAsStringAsync) {
          await (FileSystem as any).writeAsStringAsync(fileUri, json, { encoding: 'utf8' } as any);
        } else {
          const { File } = await import('expo-file-system');
          const f = new (File as any)(fileUri);
          // @ts-ignore
          if (f.write) await f.write(json);
          else if ((f as any).create) {
            await (f as any).create();
            await (f as any).write(json);
          }
        }
      } catch (writeErr) {
        // fallback to Share text if file write fails
        await Share.share({ message: json, title: 'Habit Backup' });
        return;
      }

      try {
        const available = await (Sharing as any).isAvailableAsync?.();
        if (available === false) throw new Error('Sharing not available');
        await (Sharing as any).shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Habit Backup',
          UTI: 'public.json',
        });
      } catch {
        // fallback: Share with file url (works on many Android launchers)
        // @ts-ignore Share url support
        if ((Share as any).share)
          await Share.share({
            url: fileUri,
            title: 'Habit Backup',
            message: 'Habit Tracker backup file',
          } as any);
        else await Share.share({ message: json, title: 'Habit Backup' });
      }
    } catch (e: any) {
      showAlert({
        title: 'Export failed',
        message: e?.message ?? 'Could not export data',
        type: 'error',
        primaryText: 'OK',
      });
    } finally {
      setExporting(false);
    }
  }, [exporting, showAlert]);

  const handleImportPlaceholder = useCallback(() => {
    setImportText('');
    setImportVisible(true);
  }, []);

  const handlePickFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const uri = res.assets[0].uri;
      let content = '';
      try {
        // @ts-ignore legacy
        if ((FileSystem as any).readAsStringAsync)
          content = await (FileSystem as any).readAsStringAsync(uri);
        else {
          const { File } = await import('expo-file-system');
          const f = new (File as any)(uri);
          content = await f.text();
        }
      } catch {}
      if (!content) {
        showAlert({
          title: 'Could not read file',
          message: 'Please try another JSON file or paste manually.',
          type: 'error',
          primaryText: 'OK',
        });
        return;
      }
      try {
        const parsed = JSON.parse(content);
        const habitsArr = parsed.habits ?? parsed.habitsData ?? [];
        const logsArr = parsed.logs ?? [];
        const fileName = res.assets[0].name ?? uri.split('/').pop() ?? 'backup.json';
        const sizeKB = Math.round(content.length / 1024);
        importDataRef.current = parsed;
        setImportSummary({ name: fileName, sizeKB, habits: habitsArr.length, logs: logsArr.length });
        setImportText('');
        triggerHaptic('light');
      } catch {
        showAlert({
          title: 'Invalid JSON',
          message: 'The file does not contain valid JSON. Please check the file.',
          type: 'error',
          primaryText: 'OK',
        });
      }
    } catch (e: any) {
      showAlert({
        title: 'Pick failed',
        message: e?.message ?? 'Could not open file.',
        type: 'error',
        primaryText: 'OK',
      });
    }
  }, [showAlert, triggerHaptic]);

  const handleImportConfirm = useCallback(async () => {
    let data = importDataRef.current;
    if (!data) {
      const raw = importText.trim();
      if (!raw) {
        showAlert({
          title: 'Nothing to import',
          message: 'Paste the JSON you exported first or choose a file.',
          type: 'warning',
          primaryText: 'OK',
        });
        return;
      }
      try {
        data = JSON.parse(raw);
      } catch {
        showAlert({
          title: 'Invalid JSON',
          message: 'Could not parse — make sure you pasted the full export.',
          type: 'error',
          primaryText: 'OK',
        });
        return;
      }
    }
    const habitsArr: any[] = data.habits ?? data.habitsData ?? [];
    const logsArr: any[] = data.logs ?? [];
    const settingsArr: any[] = data.settings ?? [];
    if (__DEV__) console.log('[TEST] parsed via', importDataRef.current ? 'ref' : 'text', 'habitsArr=', habitsArr.length, 'logsArr=', logsArr.length, 'settings=', settingsArr.length, 't=', Date.now());
    if (!Array.isArray(habitsArr) || habitsArr.length === 0) {
      showAlert({
        title: 'No habits found',
        message: 'The backup does not contain any habits.',
        type: 'warning',
        primaryText: 'OK',
      });
      return;
    }
    setImporting(true);
    try {
      // Build a lookup of existing habits by (name, occurrence, time) to detect matches
      const existingRows = await db.getAllAsync<{ id: string; name: string; occurrence: string; time: string }>(
        `SELECT id, name, occurrence, time FROM habits`
      );
      const existingMap = new Map<string, string>(); // key → habit id
      for (const r of existingRows) {
        existingMap.set(
          `${r.name ?? ''}||${r.occurrence ?? ''}||${r.time ?? ''}`,
          r.id
        );
      }

      // backupId → currentId mapping for log rewriting
      const idMap = new Map<string, string>();
      let matched = 0;
      let added = 0;
      let skippedHabits = 0;
      let skippedLogs = 0;

      await db.execAsync('BEGIN TRANSACTION');
      if (__DEV__) console.log('[TEST] BEGIN TRANSACTION t=', Date.now());
      try {
        for (const h of habitsArr) {
          const name = (h.name ?? '').toString().trim();
          if (!name) { skippedHabits++; continue; }
          const icon = h.icon ?? 'star';
          const progressType = ['check', 'duration', 'quantity'].includes(h.progressType) ? h.progressType : 'check';
          const occurrence = h.occurrence ?? '1,2,3,4,5,6,7';
          const createdAt = h.createdAt ?? new Date().toISOString();

          const key = `${name}||${occurrence}||${h.time ?? ''}`;
          const existingId = existingMap.get(key);
          if (existingId) {
            matched++;
            idMap.set(String(h.id), existingId);
            await db.runAsync(
              `UPDATE habits SET icon=?, progressType=?, reminder=?, strictMode=?, archived=?, goalMinutes=?, goalQty=?, unit=?
               WHERE id=?`,
              [
                icon,
                progressType,
                h.reminder ? 1 : 0,
                h.strictMode ? 1 : 0,
                h.archived ? 1 : 0,
                h.goalMinutes ?? null,
                h.goalQty ?? null,
                h.unit ?? null,
                existingId,
              ]
            );
          } else {
            added++;
            const result = await db.runAsync(
              `INSERT INTO habits (name, icon, progressType, time, reminder, strictMode, archived, goalMinutes, goalQty, unit, occurrence, createdAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                name,
                icon,
                progressType,
                h.time ?? null,
                h.reminder ? 1 : 0,
                h.strictMode ? 1 : 0,
                h.archived ? 1 : 0,
                h.goalMinutes ?? null,
                h.goalQty ?? null,
                h.unit ?? null,
                occurrence,
                createdAt,
              ]
            );
            const newId = String(result.lastInsertRowId);
            idMap.set(String(h.id), newId);
          }
        }
        if (__DEV__) console.log('[TEST] habits loop done matched=', matched, 'added=', added, 'skipped=', skippedHabits, 't=', Date.now());

        // Batch log inserts — one execAsync per 500 rows instead of N individual calls
        const BATCH = 500;
        const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
        const validLogs = logsArr
          .filter((l: any) => {
            const hid = idMap.get(String(l.habitId));
            if (!hid) { skippedLogs++; return false; }
            if (!l.date || !DATE_RE.test(String(l.date))) { skippedLogs++; return false; }
            return true;
          })
          .map((l: any) => {
            const hid = Number(idMap.get(String(l.habitId)));
            const mins = Number.isFinite(Number(l.loggedMinutes)) && l.loggedMinutes != null ? Math.trunc(Number(l.loggedMinutes)) : 'NULL';
            const qty = Number.isFinite(Number(l.loggedQty)) && l.loggedQty != null ? Math.trunc(Number(l.loggedQty)) : 'NULL';
            const done = l.completed ? 1 : 0;
            const date = String(l.date).replace(/'/g, "''");
            return `(${hid},'${date}',${mins},${qty},${done})`;
          })
          .filter((v: any) => v.startsWith('(') && Number.isInteger(Number(v.slice(1).split(',')[0])));
        for (let i = 0; i < validLogs.length; i += BATCH) {
          const chunk = validLogs.slice(i, i + BATCH);
          await db.execAsync(
            `INSERT OR REPLACE INTO habit_logs (habitId, date, loggedMinutes, loggedQty, completed) VALUES ${chunk.join(',')}`
          );
          if (__DEV__) console.log('[TEST] logs batch i=', i, 'chunk=', chunk.length, 'total=', validLogs.length, 'skipped=', skippedLogs, 't=', Date.now());
        }

        if (Array.isArray(settingsArr) && settingsArr.length) {
          for (const s of settingsArr) {
            if (s.key && s.value != null) {
              await db.runAsync(
                `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                [s.key, s.value]
              );
            }
          }
        }
        await db.execAsync('COMMIT');
        if (__DEV__) console.log('[TEST] COMMIT t=', Date.now());
      } catch (e) {
        try {
          await db.execAsync('ROLLBACK');
        } catch {}
        throw e;
      }
      await useHabitStore.getState().loadHabits();
      if (__DEV__) console.log('[TEST] loadHabits done t=', Date.now());
      await hydrate();
      if (__DEV__) console.log('[TEST] hydrate done t=', Date.now());
      const { syncHabitReminder } = await import('@/services/notificationService');
      for (const h of useHabitStore.getState().habits) {
        if (h.reminder && h.time) {
          try {
            await syncHabitReminder(h.id, h.name, h.time, h.occurrence, h.reminder);
            if (__DEV__) console.log('[TEST] syncHabitReminder done id=', h.id, 't=', Date.now());
          } catch {}
        }
      }
      triggerHaptic('medium');
      setImportVisible(false);
      setImportText('');
      importDataRef.current = null;
      setImportSummary(null);
      const skipMsg = (skippedHabits > 0 || skippedLogs > 0) ? ` (${skippedHabits} habits and ${skippedLogs} logs skipped)` : '';
      showAlert({
        title: 'Restored',
        message: `${matched} updated, ${added} new habits imported${skipMsg}.`,
        type: 'success',
        primaryText: 'Great!',
      });
    } catch (e: any) {
      showAlert({
        title: 'Import failed',
        message: e?.message ?? 'Could not restore backup.',
        type: 'error',
        primaryText: 'OK',
      });
    } finally {
      if (__DEV__) console.log('[TEST] finally setImporting(false) t=', Date.now());
      setImporting(false);
    }
  }, [importText, hydrate, triggerHaptic, showAlert]);

  const handleClear = useCallback(() => {
    showAlert({
      title: 'Clear all data?',
      message:
        'This permanently deletes all habits, logs and active timers. App settings are kept. This cannot be undone.',
      type: 'danger',
      primaryText: 'Delete everything',
      secondaryText: 'Cancel',
      destructive: true,
      onPrimary: () => {
        // queue second confirm after first sheet's exit animation (200ms) to avoid hideAlert race
        setTimeout(() => {
          showAlert({
            title: 'Are you absolutely sure?',
            message: 'Second confirmation — delete all habits and logs now?',
            type: 'danger',
            primaryText: 'Yes, delete',
            secondaryText: 'Cancel',
            destructive: true,
            onPrimary: async () => {
              try {
                await clearAll();
                try {
                  const { default: notifee } = await import('@notifee/react-native');
                  await notifee.cancelAllNotifications();
                  await notifee.cancelTriggerNotifications();
                } catch {}
                triggerHaptic('heavy');
                showAlert({
                  title: 'Cleared',
                  message: 'All habits and logs have been reset.',
                  type: 'success',
                  primaryText: 'OK',
                });
              } catch (e: any) {
                showAlert({
                  title: 'Failed',
                  message: e?.message ?? 'Could not clear',
                  type: 'error',
                  primaryText: 'OK',
                });
              }
            },
          });
        }, 280);
      },
    });
  }, [clearAll, triggerHaptic, showAlert]);

  const openGithub = useCallback(async () => {
    const url = 'https://github.com/mrblackhat0/Habit-Tracker';
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Linking.openURL(url);
    }
  }, []);

  const openLink = useCallback(async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Linking.openURL(url);
    }
  }, []);

  const version = Constants.expoConfig?.version ?? '1.0.0';

  const developers = [
    {
      name: 'Rohit Patel',
      role: 'Lead Developer',
      initials: 'RP',
      links: [
        {
          icon: 'logo-github' as const,
          title: 'GitHub',
          subtitle: 'github.com/mrblackhat0',
          url: 'https://github.com/mrblackhat0',
          color: Colors.text,
        },
        {
          icon: 'logo-instagram' as const,
          title: 'Instagram',
          subtitle: 'instagram.com/rrr143_46',
          url: 'https://www.instagram.com/rrr143_46',
          color: '#E4405F',
        },
        {
          icon: 'logo-facebook' as const,
          title: 'Facebook',
          subtitle: 'facebook.com/rohit.patel.582553',
          url: 'https://www.facebook.com/rohit.patel.582553',
          color: '#1877F2',
        },
        {
          icon: 'mail-outline' as const,
          title: 'Email',
          subtitle: 'rohitpatel143246@gmail.com',
          url: 'mailto:rohitpatel143246@gmail.com',
          color: DataColors.danger,
        },
        {
          icon: 'globe-outline' as const,
          title: 'Portfolio',
          subtitle: 'github.com/mrblackhat0/mrblackhat0',
          url: 'https://github.com/mrblackhat0/mrblackhat0',
          color: DataColors.positive,
        },
      ],
    },
  ];

  return (
    <View style={{ paddingTop: insets.top }} className="flex-1 bg-background">
      {/* Header */}
      <View className="px-4 pb-3 pt-4">
        <Text accessibilityRole="header" className="text-2xl font-bold tracking-tight text-text">
          Settings
        </Text>
        <Text className="mt-0.5 text-sm leading-5 text-secondary">
          Personalize your habit journey
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 20 }}
        keyboardShouldPersistTaps="handled">
        {/* Profile Card */}
        <View>
          <Text className="mb-2 ml-1 text-xs font-semibold uppercase tracking-widest text-secondary">
            Profile
          </Text>
          <View
            className="flex-row items-center rounded-2xl border border-border bg-surface p-4"
            style={{ minHeight: 84 }}>
            <Pressable
              onPress={() => setImageActionVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              className="h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-[2px] border-border bg-background active:opacity-80">
              {profileImageUri ? (
                <Image
                  key={profileImageUri}
                  source={{ uri: profileImageUri }}
                  style={{ width: 56, height: 56, borderRadius: 16 }}
                  resizeMode="cover"
                  onError={() => useStore.getState().setProfileImageUri(null)}
                />
              ) : (
                <Ionicons name="person" size={28} color={Colors.primary} />
              )}
              {imageLoading ? (
                <View className="absolute inset-0 items-center justify-center bg-black/40">
                  <Text className="text-[10px] font-bold text-white">…</Text>
                </View>
              ) : null}
              <View className="absolute -bottom-1 -right-1 h-6 w-6 items-center justify-center rounded-full border border-border bg-primary">
                <Ionicons name="camera" size={12} color="white" />
              </View>
            </Pressable>
            <Pressable
              onPress={() => setEditVisible(true)}
              className="ml-3 flex-1 active:opacity-70">
              <Text className="text-[17px] font-bold leading-6 text-text" numberOfLines={1}>
                {userName}
              </Text>
              <Text className="mt-0.5 text-xs font-medium leading-4 text-secondary">
                Personalized Habit Profile
              </Text>
              <View className="mt-1 flex-row items-center gap-1">
                <View className="h-1.5 w-1.5 rounded-full bg-positive" />
                <Text className="text-[11px] font-semibold uppercase tracking-wider text-positive">
                  Active
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => setEditVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Edit name"
              hitSlop={8}
              className="ml-2 h-9 w-9 items-center justify-center rounded-xl border border-border bg-background active:opacity-70">
              <Ionicons name="pencil" size={16} color={Colors.secondary} />
            </Pressable>
          </View>
        </View>

        {/* Preferences */}
        <View>
          <Text className="mb-2 ml-1 text-xs font-semibold uppercase tracking-widest text-secondary">
            Preferences
          </Text>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            {/* Haptics — mirrors habit/[id].tsx row so same AnimatedSwitch path animates */}
            <View className="flex-row items-center justify-between px-3.5 py-3.5">
              <View className="flex-1 flex-row items-center gap-3 pr-3">
                <View
                  className="h-10 w-10 items-center justify-center rounded-xl border border-border"
                  style={{ backgroundColor: `${Colors.primary}14` }}>
                  <Ionicons name="pulse-outline" size={20} color={Colors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold text-text">Haptic Feedback</Text>
                  <Text className="mt-0.5 text-xs text-secondary">
                    {hapticsEnabled ? 'Vibration on interactions' : 'Haptics disabled'}
                  </Text>
                </View>
              </View>
              <AnimatedSwitch
                value={hapticsEnabled}
                onValueChange={onToggleHaptics}
                accessibilityLabel="Haptic feedback"
              />
            </View>
            <SettingDivider />
            {/* Weekly overview — every Sunday 7 AM */}
            <View className="flex-row items-center justify-between px-3.5 py-3.5">
              <View className="flex-1 flex-row items-center gap-3 pr-3">
                <View
                  className="h-10 w-10 items-center justify-center rounded-xl border border-border"
                  style={{ backgroundColor: `${DataColors.warning}14` }}>
                  <Ionicons name="bar-chart-outline" size={20} color={DataColors.warning} />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold text-text">Weekly overview</Text>
                  <Text className="mt-0.5 text-xs text-secondary">
                    {weeklyOverviewEnabled
                      ? 'Every Sunday at 7:00 AM'
                      : 'Get a Sunday 7 AM weekly summary'}
                  </Text>
                </View>
              </View>
              <AnimatedSwitch
                value={weeklyOverviewEnabled}
                onValueChange={onToggleWeekly}
                accessibilityLabel="Weekly overview every Sunday at 7 AM"
              />
            </View>
            <SettingDivider />
            {/* Focus timer/stopwatch notification */}
            <View className="flex-row items-center justify-between px-3.5 py-3.5">
              <View className="flex-1 flex-row items-center gap-3 pr-3">
                <View
                  className="h-10 w-10 items-center justify-center rounded-xl border border-border"
                  style={{ backgroundColor: `${Colors.primary}14` }}>
                  <Ionicons name="timer-outline" size={20} color={Colors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold text-text">Focus notifications</Text>
                  <Text className="mt-0.5 text-xs text-secondary">
                    {focusNotificationsEnabled
                      ? 'Timer & stopwatch in notification shade'
                      : 'Focus notifications hidden'}
                  </Text>
                </View>
              </View>
              <AnimatedSwitch
                value={focusNotificationsEnabled}
                onValueChange={onToggleFocusNotif}
                accessibilityLabel="Focus notifications for timer and stopwatch"
              />
            </View>
          </View>
          <Text className="ml-1 mt-2 text-xs leading-4 text-textMuted">
            Summarizes completions, streaks & missed habits from the past week.
          </Text>
        </View>

        {/* Data & Backup */}
        <View>
          <Text className="mb-2 ml-1 text-xs font-semibold uppercase tracking-widest text-secondary">
            Data & Backup
          </Text>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            <SettingItem
              icon="share-outline"
              iconColor={Colors.primary}
              title="Export backup"
              subtitle="Share habits & logs as JSON"
              onPress={handleExport}
              accessibilityLabel="Export backup as JSON"
            />
            <SettingDivider />
            <SettingItem
              icon="download-outline"
              iconColor={DataColors.info}
              title="Import / Restore"
              subtitle="Restore from exported file"
              onPress={handleImportPlaceholder}
              accessibilityLabel="Import backup"
            />
            <SettingDivider />
            <SettingItem
              icon="archive-outline"
              iconColor={Colors.secondary}
              title="Archived habits"
              subtitle={
                archivedCount > 0 ? `${archivedCount} hidden • tap to manage` : 'No archived habits'
              }
              rightKind="value"
              rightValue={archivedCount > 0 ? String(archivedCount) : undefined}
              onPress={() => {
                triggerHaptic('light');
                router.push('/archived');
              }}
              accessibilityLabel="Archived habits"
            />
          </View>
        </View>

        {/* Danger Zone */}
        <View>
          <Text className="mb-2 ml-1 text-xs font-semibold uppercase tracking-widest text-danger">
            Danger Zone
          </Text>
          <View className="overflow-hidden rounded-2xl border border-danger/30 bg-danger/5">
            <Pressable
              onPress={handleClear}
              accessibilityRole="button"
              accessibilityLabel="Clear all data, destructive action"
              className="flex-row items-center px-3.5 py-3.5 active:opacity-70"
              style={{ minHeight: 56 }}>
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-xl border border-danger/30 bg-danger/10">
                <Ionicons name="trash-outline" size={20} color={DataColors.danger} />
              </View>
              <View className="flex-1 pr-3">
                <Text className="text-[15px] font-bold text-danger">Clear all data</Text>
                <Text className="mt-0.5 text-xs leading-4 text-secondary">
                  Permanently delete habits & logs
                </Text>
              </View>
              <Ionicons name="warning-outline" size={18} color={DataColors.danger} />
            </Pressable>
          </View>
          <Text className="ml-1 mt-2 text-xs leading-4 text-textMuted">
            Requires double confirmation. App settings are preserved.
          </Text>
        </View>

        {/* About */}
        <View>
          <Text className="mb-2 ml-1 text-xs font-semibold uppercase tracking-widest text-secondary">
            About
          </Text>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            <View className="flex-row items-center justify-between px-3.5 py-3.5">
              <View className="flex-row items-center gap-3">
                <View className="h-10 w-10 items-center overflow-hidden justify-center rounded-xl border border-border bg-secondary/10">
                  {/* <Ionicons name="aperture-outline" size={20} color={Colors.primary} /> */}
                  <Image 
                    source={require("@/assets/icon_transparent.png")} 
                    style={{ width: 32, height: 32 ,borderRadius:5}} 
                    resizeMode="cover" 
                  />
                </View>
                <View>
                  <Text className="text-sm font-bold text-text">Habit Tracker</Text>
                  <Text className="text-xs text-secondary">Expo 57 • SQLite • NativeWind</Text>
                </View>
              </View>
              <View className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1">
                <Text className="text-xs font-bold text-primary">v{version}</Text>
              </View>
            </View>
            <SettingDivider />
            <SettingItem
              icon="rocket-outline"
              iconColor={Colors.primary}
              title="Welcome Tour"
              subtitle="Review features and animated onboarding"
              onPress={() => router.push({ pathname: '/onboarding', params: { replay: 'true' } })}
              accessibilityLabel="Open onboarding tour"
            />
            <SettingDivider />
            <SettingItem
              icon="logo-github"
              iconColor={Colors.text}
              title="GitHub & Feedback"
              subtitle="Report issues or star the repo"
              onPress={openGithub}
              accessibilityLabel="Open GitHub repository"
            />
            <SettingDivider />
            <View className="px-3.5 py-3">
              <Text className="text-xs leading-5 text-secondary">
                Obsidian-neon theme • Built with care for daily momentum. All data stays on device.
              </Text>
            </View>
          </View>
        </View>

        {/* Developers */}
        <View>
          <Text className="mb-2 ml-1 text-xs font-semibold uppercase tracking-widest text-secondary">
            Developers
          </Text>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            {developers.map((dev, devIdx) => (
              <View key={dev.name}>
                {devIdx > 0 && <SettingDivider />}
                {/* Developer header — same style as Profile/Header rows */}
                <View className="flex-row items-center gap-3 px-3.5 py-3.5">
                  <View className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-primary/10">
                    <Text className="text-sm font-black text-primary">{dev.initials}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-text">{dev.name}</Text>
                    <Text className="text-xs text-secondary">{dev.role}</Text>
                  </View>
                </View>
                {dev.links.map((link) => (
                  <View key={link.url}>
                    <SettingDivider />
                    <SettingItem
                      icon={link.icon}
                      iconColor={link.color}
                      title={link.title}
                      subtitle={link.subtitle}
                      onPress={() => {
                        triggerHaptic('light');
                        openLink(link.url);
                      }}
                      accessibilityLabel={`${dev.name} ${link.title}`}
                    />
                  </View>
                ))}
              </View>
            ))}
            <SettingDivider />
            <View className="flex-row items-center justify-between px-3.5 py-3">
              <Text className="text-xs leading-5 text-secondary">Want to contribute?</Text>
              <Pressable
                onPress={() => {
                  triggerHaptic('light');
                  openLink('https://github.com/mrblackhat0/Habit-Tracker');
                }}
                className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 active:opacity-70">
                <Text className="text-xs font-bold text-primary">Join us →</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={importVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { importDataRef.current = null; setImportSummary(null); setImportVisible(false); }}>
        <TouchableWithoutFeedback onPress={() => { importDataRef.current = null; setImportSummary(null); setImportVisible(false); }}>
          <View className="flex-1 justify-center bg-black/60 px-5">
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View className="rounded-3xl border border-border bg-surface p-5">
                <View className="mb-3 flex-row items-center justify-between">
                  <Text className="text-lg font-bold text-text">Import backup</Text>
                  <Pressable
                    onPress={() => { importDataRef.current = null; setImportSummary(null); setImportVisible(false); }}
                    hitSlop={8}
                    className="h-8 w-8 items-center justify-center rounded-full border border-border bg-background">
                    <Ionicons name="close" size={18} color={Colors.secondary} />
                  </Pressable>
                </View>
                <Text className="mb-2 text-xs leading-4 text-secondary">
                  Paste the JSON you exported (from Share) or choose a file. Habits matching by
                  name, time & frequency are updated; new habits are added.
                </Text>
                <Pressable
                  onPress={handlePickFile}
                  className="mb-3 flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/30 bg-primary/5 py-3 active:opacity-70">
                  <Ionicons name="folder-open-outline" size={18} color={Colors.primary} />
                  <Text className="text-sm font-semibold text-primary">
                    Choose file from storage
                  </Text>
                </Pressable>
                {importSummary ? (
                  <View className="mb-2 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                    <View className="flex-row items-center justify-between mb-2">
                      <Text className="text-sm font-bold text-text" numberOfLines={1}>{importSummary.name}</Text>
                      <Pressable
                        onPress={() => { importDataRef.current = null; setImportSummary(null); }}
                        hitSlop={6}
                        className="ml-2 h-6 w-6 items-center justify-center rounded-full bg-danger/10">
                        <Ionicons name="close" size={12} color={DataColors.danger} />
                      </Pressable>
                    </View>
                    <Text className="text-xs text-secondary">
                      {importSummary.sizeKB} KB · {importSummary.habits} habits · {importSummary.logs} logs
                    </Text>
                  </View>
                ) : (
                  <View className="min-h-[180px] rounded-2xl border border-border bg-background p-2">
                    <TextInput
                      value={importText}
                      onChangeText={setImportText}
                      placeholder='{"habits": [...], "logs": [...]}'
                      placeholderTextColor={Colors.textMuted}
                      multiline
                      textAlignVertical="top"
                      style={{ flex: 1, minHeight: 160, color: Colors.text, fontSize: 12 }}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                )}
                <View className="mt-4 flex-row gap-3">
                  <Pressable
                    onPress={() => { importDataRef.current = null; setImportSummary(null); setImportVisible(false); }}
                    className="flex-1 items-center justify-center rounded-2xl border border-secondary/10 bg-secondary/5 py-3.5 active:opacity-70">
                    <Text className="text-sm font-semibold text-secondary">Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleImportConfirm}
                    disabled={importing}
                    className={`flex-1 items-center justify-center rounded-2xl py-3.5 active:opacity-90 ${importing ? 'bg-secondary' : 'bg-primary'}`}>
                    <Text className="text-sm font-bold text-white">
                      {importing ? 'Importing…' : 'Import'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <ProfilePhotoActionSheet
        visible={imageActionVisible}
        hasPhoto={!!profileImageUri}
        onClose={() => setImageActionVisible(false)}
        onPreview={() => setPreviewVisible(true)}
        onLibrary={() => handlePickImage(false)}
        onCamera={() => handlePickImage(true)}
        onRemove={handleRemoveImage}
      />

      <Modal
        visible={previewVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewVisible(false)}>
        <View
          className="flex-1 items-center justify-center bg-background/10 px-6"
          style={{ backgroundColor: '#0d0d12cc' }}>
          <Pressable
            onPress={() => setPreviewVisible(false)}
            className="absolute right-6 top-14 z-10 h-10 w-10 items-center justify-center rounded-full border border-border bg-surface">
            <Ionicons name="close" size={22} color={Colors.text} />
          </Pressable>
          {profileImageUri ? (
            <Image
              source={{ uri: profileImageUri }}
              style={{
                width: SCREEN_WIDTH - 64,
                height: SCREEN_WIDTH - 64,
                borderRadius: (SCREEN_WIDTH - 64) / 2,
              }}
              resizeMode="cover"
            />
          ) : (
            <View className="h-[260px] w-[260px] items-center justify-center rounded-3xl border border-border bg-background">
              <Ionicons name="person" size={56} color={Colors.primary} />
            </View>
          )}
        </View>
      </Modal>

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

      <EditNameModal
        visible={editVisible}
        initialName={userName}
        onClose={() => setEditVisible(false)}
        onSave={setUserName}
      />
    </View>
  );
}
