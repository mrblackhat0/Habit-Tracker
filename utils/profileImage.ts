import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useStore } from '@/store/store';

const PROFILE_PREFIX = 'profile-';

function getDocumentDir(): string | null {
  // @ts-ignore legacy
  return (FileSystem as any).documentDirectory ?? null;
}

async function copyToDocumentDir(sourceUri: string): Promise<string> {
  const dir = getDocumentDir();
  if (!dir) return sourceUri;
  const fileName = `${PROFILE_PREFIX}${Date.now()}.jpg`;
  const dest = `${dir}${fileName}`;
  try {
    // clean old profile images
    try {
      const dirInfo: any = await (FileSystem as any).readDirectoryAsync?.(dir);
      if (Array.isArray(dirInfo)) {
        for (const f of dirInfo) {
          if (f.startsWith(PROFILE_PREFIX) && f.endsWith('.jpg')) {
            try { await (FileSystem as any).deleteAsync(`${dir}${f}`, { idempotent: true }); } catch {}
          }
        }
      } else {
        const old = `${dir}profile.jpg`;
        const info: any = await (FileSystem as any).getInfoAsync?.(old);
        if (info?.exists) await (FileSystem as any).deleteAsync(old, { idempotent: true });
      }
    } catch {}
    // legacy copyAsync
    if ((FileSystem as any).copyAsync) {
      await (FileSystem as any).copyAsync({ from: sourceUri, to: dest });
      return dest;
    }
    // new File API
    const { File } = await import('expo-file-system');
    const srcFile = new (File as any)(sourceUri);
    const destFile = new (File as any)(dest);
    // @ts-ignore try both
    if (srcFile.copy) await srcFile.copy(destFile);
    else {
      // fallback: read and write
      const base64 = await (FileSystem as any).readAsStringAsync?.(sourceUri, { encoding: 'base64' });
      if (base64) await (FileSystem as any).writeAsStringAsync(dest, base64, { encoding: 'base64' });
      else return sourceUri;
    }
    return dest;
  } catch {
    return sourceUri;
  }
}

export async function pickProfileImage(useCamera = false): Promise<string | null> {
  // request permission
  const perm = useCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (perm.status !== 'granted' && (perm as any).granted !== true) {
    throw new Error(useCamera ? 'Camera permission denied' : 'Photo library permission denied');
  }

  const result = useCamera
    ? await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      })
    : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

  if (result.canceled || !result.assets?.[0]?.uri) return null;

  const sourceUri = result.assets[0].uri;
  const persistedUri = await copyToDocumentDir(sourceUri);
  useStore.getState().setProfileImageUri(persistedUri);
  return persistedUri;
}

export async function removeProfileImage(): Promise<void> {
  const { profileImageUri } = useStore.getState();
  if (profileImageUri) {
    try {
      // try delete file if it's in documentDirectory
      const dir = getDocumentDir();
      if (dir && profileImageUri.startsWith(dir)) {
        await (FileSystem as any).deleteAsync(profileImageUri, { idempotent: true });
      }
    } catch {}
  }
  useStore.getState().setProfileImageUri(null);
}

export async function validateProfileImageUri(uri: string | null): Promise<string | null> {
  if (!uri) return null;
  try {
    const info: any = await (FileSystem as any).getInfoAsync?.(uri);
    if (info && info.exists === false) {
      // file missing (cache cleared) -> clear store
      useStore.getState().setProfileImageUri(null);
      return null;
    }
  } catch {}
  return uri;
}
