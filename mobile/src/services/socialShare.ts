export type SocialPlatform = 'facebook' | 'instagram' | 'tiktok' | 'youtube';

export interface SocialSharePayload {
  videoUri: string;
  description: string;
  thumbnailTimestamp?: number;
}

export interface PlatformConfig {
  id: SocialPlatform;
  name: string;
  color: string;
  icon: string;
}

export const SOCIAL_PLATFORMS: PlatformConfig[] = [
  {
    id: 'facebook',
    name: 'Facebook',
    color: '#1877F2',
    icon: 'logo-facebook'
  },
  {
    id: 'instagram',
    name: 'Instagram',
    color: '#833AB4',
    icon: 'logo-instagram'
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    color: '#000000',
    icon: 'logo-tiktok'
  },
  {
    id: 'youtube',
    name: 'YouTube',
    color: '#FF0000',
    icon: 'logo-youtube'
  }
];

export function formatThumbnailTimestamp(seconds?: number): string {
  if (typeof seconds !== 'number' || isNaN(seconds)) return '00:03';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export async function shareToSocialMedia(
  platform: SocialPlatform,
  payload: SocialSharePayload
): Promise<boolean> {
  const config = SOCIAL_PLATFORMS.find((p) => p.id === platform);
  const platformName = config?.name || 'Social Media';
  const thumbStr = formatThumbnailTimestamp(payload.thumbnailTimestamp);

  // 1. Copy description to clipboard so user can simply paste into the caption field
  if (payload.description) {
    try {
      const Clipboard = await import('expo-clipboard');
      await Clipboard.setStringAsync(payload.description);
    } catch (clipErr) {
      console.warn('[SocialShare] Clipboard copy warning:', clipErr);
    }
  }

  // 2. Android Direct App Intent Launch (Bypasses system chooser directly into Reel/Post edit mode)
  try {
    const { Platform, ToastAndroid, Alert } = await import('react-native');

    if (Platform.OS === 'android') {
      try {
        const FileSystem = await import('expo-file-system');
        const IntentLauncher = await import('expo-intent-launcher');

        let contentUri = payload.videoUri;
        if (contentUri.startsWith('file://')) {
          try {
            contentUri = await FileSystem.getContentUriAsync(contentUri);
          } catch (fsErr) {
            console.warn('[SocialShare] Could not convert to contentUri:', fsErr);
          }
        }

        // Show non-blocking toast with thumbnail timeframe guidance
        try {
          ToastAndroid.show(
            `Opening ${platformName}... (Caption copied! Cover: ${thumbStr})`,
            ToastAndroid.LONG
          );
        } catch {}

        if (platform === 'facebook') {
          try {
            // Attempt 1: Direct Facebook Reel Action
            await IntentLauncher.startActivityAsync('com.facebook.reels.SHARE_TO_REEL', {
              type: 'video/mp4',
              data: contentUri,
              packageName: 'com.facebook.katana',
              flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
              extra: {
                'android.intent.extra.STREAM': contentUri,
                'android.intent.extra.TEXT': payload.description,
                'com.facebook.platform.extra.APPLICATION_ID': 'com.facebook.katana'
              }
            });
            return true;
          } catch {
            // Attempt 2: Explicit ACTION_SEND directly to Facebook video composer
            await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
              type: 'video/mp4',
              packageName: 'com.facebook.katana',
              flags: 1,
              extra: {
                'android.intent.extra.STREAM': contentUri,
                'android.intent.extra.TEXT': payload.description
              }
            });
            return true;
          }
        } else if (platform === 'instagram') {
          try {
            // Attempt 1: Direct Instagram Reel Action
            await IntentLauncher.startActivityAsync('com.instagram.share.ADD_TO_REEL', {
              type: 'video/*',
              data: contentUri,
              packageName: 'com.instagram.android',
              flags: 1,
              extra: {
                'android.intent.extra.STREAM': contentUri,
                'android.intent.extra.TEXT': payload.description,
                'com.instagram.platform.extra.APPLICATION_ID': 'com.instagram.android'
              }
            });
            return true;
          } catch {
            // Attempt 2: Explicit ACTION_SEND to Instagram post composer
            await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
              type: 'video/mp4',
              packageName: 'com.instagram.android',
              flags: 1,
              extra: {
                'android.intent.extra.STREAM': contentUri,
                'android.intent.extra.TEXT': payload.description
              }
            });
            return true;
          }
        } else if (platform === 'tiktok') {
          try {
            // Main TikTok app
            await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
              type: 'video/mp4',
              packageName: 'com.zhiliaoapp.musically',
              flags: 1,
              extra: {
                'android.intent.extra.STREAM': contentUri,
                'android.intent.extra.TEXT': payload.description
              }
            });
            return true;
          } catch {
            // Alternative regional TikTok package
            await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
              type: 'video/mp4',
              packageName: 'com.ss.android.ugc.trill',
              flags: 1,
              extra: {
                'android.intent.extra.STREAM': contentUri,
                'android.intent.extra.TEXT': payload.description
              }
            });
            return true;
          }
        } else if (platform === 'youtube') {
          await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
            type: 'video/mp4',
            packageName: 'com.google.android.youtube',
            flags: 1,
            extra: {
              'android.intent.extra.STREAM': contentUri,
              'android.intent.extra.TEXT': payload.description
            }
          });
          return true;
        }
      } catch (intentErr: any) {
        console.warn(`[SocialShare] Direct app launch failed for ${platformName}:`, intentErr?.message);
        Alert.alert(
          `${platformName} App Not Installed`,
          `The ${platformName} app was not detected on this device. Would you like to share via another app?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Choose App',
              onPress: async () => {
                const Sharing = await import('expo-sharing');
                await Sharing.shareAsync(payload.videoUri, {
                  mimeType: 'video/mp4',
                  dialogTitle: `Share Video to ${platformName}`,
                  UTI: 'public.movie'
                });
              }
            }
          ]
        );
        return false;
      }
    }

    // 3. iOS / Web / Fallback Sharing
    const Sharing = await import('expo-sharing');
    const isAvailable = await Sharing.isAvailableAsync().catch(() => false);

    if (!isAvailable) {
      const { Share } = await import('react-native');
      await Share.share({
        message: `${payload.description}\n\n[GoalCast Video Ready for ${platformName}]`
      });
      return true;
    }

    await Sharing.shareAsync(payload.videoUri, {
      mimeType: 'video/mp4',
      dialogTitle: `Post to ${platformName}`,
      UTI: 'public.movie'
    });
    return true;
  } catch (err: any) {
    console.error(`[SocialShare] Error sharing to ${platform}:`, err);
    try {
      const { Alert } = await import('react-native');
      Alert.alert('Sharing Notice', `Could not complete share to ${platformName}: ${err?.message}`);
    } catch {}
    return false;
  }
}
