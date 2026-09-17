import * as Haptics from 'expo-haptics';
import { useStore } from '@/store/store';

function isEnabled(): boolean {
  try {
    return useStore.getState().hapticsEnabled;
  } catch {
    return true;
  }
}

export async function hapticImpact(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Soft
) {
  if (!isEnabled()) return;
  try {
    await Haptics.impactAsync(style);
  } catch {}
}

export async function hapticNotification(
  type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success
) {
  if (!isEnabled()) return;
  try {
    await Haptics.notificationAsync(type);
  } catch {}
}
