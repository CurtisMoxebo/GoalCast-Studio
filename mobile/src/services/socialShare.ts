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

/**
 * Builds comprehensive intent extras bundle for Facebook Reel and Composer sharing.
 * Ensures description, caption, and thumbnail timeframe are included in all standard
 * keys supported across Meta / Facebook apps.
 */
export function buildFacebookShareExtras(
  payload: SocialSharePayload,
  contentUri: string
): Record<string, any> {
  const thumbSeconds =
    typeof payload.thumbnailTimestamp === 'number' && !isNaN(payload.thumbnailTimestamp)
      ? payload.thumbnailTimestamp
      : 3.0;
  const thumbStr = formatThumbnailTimestamp(thumbSeconds);
  const thumbMs = Math.round(thumbSeconds * 1000);

  return {
    'com.facebook.platform.extra.APPLICATION_ID': '966242223397117',
    'android.intent.extra.STREAM': contentUri,
    // Description and Caption in all standard Android and Meta keys
    'android.intent.extra.TEXT': payload.description,
    'android.intent.extra.SUBJECT': `GoalCast Predictions (Cover: ${thumbStr})`,
    'android.intent.extra.TITLE': `GoalCast Predictions (Cover: ${thumbStr})`,
    caption: payload.description,
    description: payload.description,
    'com.facebook.platform.extra.CAPTION': payload.description,
    'com.facebook.platform.extra.DESCRIPTION': payload.description,
    'com.facebook.platform.extra.TEXT': payload.description,
    // Thumbnail and cover timeframe in seconds, string MM:SS, and milliseconds
    thumbnail_time: thumbStr,
    thumbnail_timestamp: thumbSeconds,
    thumbnail_timestamp_ms: thumbMs,
    video_cover_time: thumbSeconds,
    video_cover_timestamp: thumbSeconds,
    cover_time: thumbStr,
    cover_timestamp: thumbSeconds,
    cover_frame_time: thumbStr,
    'com.facebook.platform.extra.THUMBNAIL_TIME': thumbStr,
    'com.facebook.platform.extra.THUMBNAIL_TIMESTAMP': thumbSeconds,
    'com.facebook.platform.extra.COVER_TIME': thumbStr,
    'com.facebook.platform.extra.VIDEO_COVER_TIMESTAMP': thumbSeconds
  };
}

/**
 * Builds comprehensive intent extras bundle for Instagram Reel and Composer sharing.
 * Passes description, caption, and cover timeframe in all recognized keys.
 */
export function buildInstagramShareExtras(
  payload: SocialSharePayload,
  contentUri: string
): Record<string, any> {
  const thumbSeconds =
    typeof payload.thumbnailTimestamp === 'number' && !isNaN(payload.thumbnailTimestamp)
      ? payload.thumbnailTimestamp
      : 3.0;
  const thumbStr = formatThumbnailTimestamp(thumbSeconds);
  const thumbMs = Math.round(thumbSeconds * 1000);

  return {
    'com.instagram.platform.extra.APPLICATION_ID': '966242223397117',
    'android.intent.extra.STREAM': contentUri,
    // Description and Caption in all standard Android and Meta Instagram keys
    'android.intent.extra.TEXT': payload.description,
    'android.intent.extra.SUBJECT': `GoalCast Predictions (Cover: ${thumbStr})`,
    'android.intent.extra.TITLE': `GoalCast Predictions (Cover: ${thumbStr})`,
    caption: payload.description,
    description: payload.description,
    'com.instagram.platform.extra.CAPTION': payload.description,
    'com.instagram.platform.extra.DESCRIPTION': payload.description,
    'com.instagram.platform.extra.TEXT': payload.description,
    // Thumbnail and cover timeframe in seconds, string MM:SS, and milliseconds
    thumbnail_time: thumbStr,
    thumbnail_timestamp: thumbSeconds,
    thumbnail_timestamp_ms: thumbMs,
    video_cover_time: thumbSeconds,
    video_cover_timestamp: thumbSeconds,
    cover_time: thumbStr,
    cover_timestamp: thumbSeconds,
    cover_frame_time: thumbStr,
    'com.instagram.platform.extra.THUMBNAIL_TIME': thumbStr,
    'com.instagram.platform.extra.THUMBNAIL_TIMESTAMP': thumbSeconds,
    'com.instagram.platform.extra.COVER_TIME': thumbStr,
    'com.instagram.platform.extra.VIDEO_COVER_TIMESTAMP': thumbSeconds
  };
}

/**
 * Builds comprehensive intent extras bundle for TikTok sharing.
 * Passes description, caption, and cover timeframe across recognized Android extras.
 */
export function buildTikTokShareExtras(
  payload: SocialSharePayload,
  contentUri: string
): Record<string, any> {
  const thumbSeconds =
    typeof payload.thumbnailTimestamp === 'number' && !isNaN(payload.thumbnailTimestamp)
      ? payload.thumbnailTimestamp
      : 3.0;
  const thumbStr = formatThumbnailTimestamp(thumbSeconds);
  const thumbMs = Math.round(thumbSeconds * 1000);

  return {
    'android.intent.extra.STREAM': contentUri,
    // Description and Caption in all standard Android and TikTok keys
    'android.intent.extra.TEXT': payload.description,
    'android.intent.extra.SUBJECT': `GoalCast Predictions (Cover: ${thumbStr})`,
    'android.intent.extra.TITLE': `GoalCast Predictions (Cover: ${thumbStr})`,
    caption: payload.description,
    description: payload.description,
    title: payload.description,
    // Thumbnail and cover timeframe in seconds, string MM:SS, and milliseconds
    thumbnail_time: thumbStr,
    thumbnail_timestamp: thumbSeconds,
    thumbnail_timestamp_ms: thumbMs,
    video_cover_time: thumbSeconds,
    video_cover_timestamp: thumbSeconds,
    cover_time: thumbStr,
    cover_timestamp: thumbSeconds,
    cover_frame_time: thumbStr
  };
}

/**
 * Builds comprehensive intent extras bundle for YouTube Shorts sharing.
 * Formats title and description with #Shorts hashtag and attaches cover timeframe.
 */
export function buildYouTubeShareExtras(
  payload: SocialSharePayload,
  contentUri: string
): Record<string, any> {
  const thumbSeconds =
    typeof payload.thumbnailTimestamp === 'number' && !isNaN(payload.thumbnailTimestamp)
      ? payload.thumbnailTimestamp
      : 3.0;
  const thumbStr = formatThumbnailTimestamp(thumbSeconds);
  const thumbMs = Math.round(thumbSeconds * 1000);

  // Extract first line for concise Shorts title, ensuring #Shorts hashtag is present
  const firstLine = payload.description.split('\n')[0].trim() || 'GoalCast Football Predictions';
  const ytTitle = firstLine.toLowerCase().includes('#shorts')
    ? firstLine
    : `${firstLine} #Shorts`;

  // Ensure #Shorts is also present in description so YouTube categorizes it as a Short
  const ytDescription = payload.description.toLowerCase().includes('#shorts')
    ? payload.description
    : `${payload.description}\n\n#Shorts #shorts`;

  return {
    'android.intent.extra.STREAM': contentUri,
    // Description and Title formatted for YouTube Shorts
    'android.intent.extra.TITLE': ytTitle,
    'android.intent.extra.SUBJECT': ytTitle,
    'android.intent.extra.TEXT': ytDescription,
    title: ytTitle,
    caption: ytDescription,
    description: ytDescription,
    // Thumbnail and cover timeframe in seconds, string MM:SS, and milliseconds
    thumbnail_time: thumbStr,
    thumbnail_timestamp: thumbSeconds,
    thumbnail_timestamp_ms: thumbMs,
    video_cover_time: thumbSeconds,
    video_cover_timestamp: thumbSeconds,
    cover_time: thumbStr,
    cover_timestamp: thumbSeconds,
    cover_frame_time: thumbStr
  };
}

export async function shareToSocialMedia(
  platform: SocialPlatform,
  payload: SocialSharePayload
): Promise<boolean> {
  const config = SOCIAL_PLATFORMS.find((p) => p.id === platform);
  const platformName = config?.name || 'Social Media';
  const thumbSeconds =
    typeof payload.thumbnailTimestamp === 'number' && !isNaN(payload.thumbnailTimestamp)
      ? payload.thumbnailTimestamp
      : 3.0;
  const thumbStr = formatThumbnailTimestamp(thumbSeconds);

  // Android Direct App Intent Launch (Bypasses system chooser directly into Reel/Post edit mode)
  try {
    const { Platform, ToastAndroid, Alert } = await import('react-native');

    if (Platform.OS === 'android') {
      try {
        const FileSystem = await import('expo-file-system/legacy');
        const IntentLauncher = await import('expo-intent-launcher');

        let contentUri = payload.videoUri;
        if (contentUri.startsWith('file://')) {
          try {
            contentUri = await FileSystem.getContentUriAsync(contentUri);
          } catch (fsErr) {
            console.warn('[SocialShare] Could not convert to contentUri:', fsErr);
          }
        }

        // Copy description (with #Shorts tag if YouTube) to system clipboard
        try {
          const Clipboard = await import('expo-clipboard');
          const textToCopy =
            platform === 'youtube'
              ? (payload.description.toLowerCase().includes('#shorts')
                  ? payload.description
                  : `${payload.description}\n\n#Shorts #shorts`)
              : payload.description;

          if (textToCopy) {
            await Clipboard.setStringAsync(textToCopy);
          }
        } catch (clipErr) {
          console.warn('[SocialShare] Could not copy description to clipboard:', clipErr);
        }

        // Show non-blocking toast with description copied & thumbnail timeframe guidance
        try {
          ToastAndroid.show(
            `Opening ${platformName}... Description copied! (Cover: ${thumbStr})`,
            ToastAndroid.LONG
          );
        } catch {}

        if (platform === 'facebook') {
          const fbExtras = buildFacebookShareExtras(payload, contentUri);
          try {
            // Attempt 1: Direct Facebook Reel Action targeting com.facebook.katana explicitly with video/*
            await IntentLauncher.startActivityAsync('com.facebook.reels.SHARE_TO_REEL', {
              type: 'video/*',
              data: contentUri,
              packageName: 'com.facebook.katana',
              flags: 1, // Intent.FLAG_GRANT_READ_URI_PERMISSION
              extra: fbExtras
            });
            return true;
          } catch (fbErr1) {
            console.warn('[SocialShare] Facebook package SHARE_TO_REEL attempt 1 failed:', fbErr1);
            try {
              // Attempt 2: Direct Facebook Reel Action (implicit intent fallback)
              await IntentLauncher.startActivityAsync('com.facebook.reels.SHARE_TO_REEL', {
                type: 'video/*',
                data: contentUri,
                flags: 1,
                extra: fbExtras
              });
              return true;
            } catch (fbErr2) {
              console.warn('[SocialShare] Facebook implicit SHARE_TO_REEL attempt 2 failed:', fbErr2);
              try {
                // Attempt 3: ACTION_SEND directly to Facebook composer (without data uri parameter)
                await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
                  type: 'video/*',
                  packageName: 'com.facebook.katana',
                  flags: 1,
                  extra: fbExtras
                });
                return true;
              } catch (fbErr3) {
                console.warn('[SocialShare] Facebook ACTION_SEND attempt 3 failed:', fbErr3);
                // Attempt 4: ACTION_SEND to Facebook Lite
                await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
                  type: 'video/*',
                  packageName: 'com.facebook.lite',
                  flags: 1,
                  extra: fbExtras
                });
                return true;
              }
            }
          }
        } else if (platform === 'instagram') {
          const igExtras = buildInstagramShareExtras(payload, contentUri);
          try {
            // Attempt 1: Direct Instagram Reel Action
            await IntentLauncher.startActivityAsync('com.instagram.share.ADD_TO_REEL', {
              type: 'video/*',
              data: contentUri,
              packageName: 'com.instagram.android',
              flags: 1,
              extra: igExtras
            });
            return true;
          } catch (igErr1) {
            console.warn('[SocialShare] Instagram ADD_TO_REEL attempt 1 failed:', igErr1);
            try {
              // Attempt 2: Explicit ACTION_SEND to Instagram post composer
              await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
                type: 'video/*',
                packageName: 'com.instagram.android',
                flags: 1,
                extra: igExtras
              });
              return true;
            } catch (igErr2) {
              console.warn('[SocialShare] Instagram ACTION_SEND attempt 2 failed:', igErr2);
              // Attempt 3: ACTION_SEND without hardcoded packageName in case of alternate Instagram build
              await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
                type: 'video/*',
                flags: 1,
                extra: igExtras
              });
              return true;
            }
          }
        } else if (platform === 'tiktok') {
          const tiktokExtras = buildTikTokShareExtras(payload, contentUri);
          try {
            // Attempt 1: Main global TikTok app package (com.zhiliaoapp.musically) via ACTION_SEND
            await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
              type: 'video/*',
              packageName: 'com.zhiliaoapp.musically',
              flags: 1,
              extra: tiktokExtras
            });
            return true;
          } catch (ttErr1) {
            console.warn('[SocialShare] TikTok musical.ly attempt 1 failed:', ttErr1);
            try {
              // Attempt 2: Regional TikTok package (com.ss.android.ugc.trill) via ACTION_SEND
              await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
                type: 'video/*',
                packageName: 'com.ss.android.ugc.trill',
                flags: 1,
                extra: tiktokExtras
              });
              return true;
            } catch (ttErr2) {
              console.warn('[SocialShare] TikTok trill attempt 2 failed:', ttErr2);
              try {
                // Attempt 3: TikTok Lite package (com.zhiliaoapp.musically.go)
                await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
                  type: 'video/*',
                  packageName: 'com.zhiliaoapp.musically.go',
                  flags: 1,
                  extra: tiktokExtras
                });
                return true;
              } catch (ttErr3) {
                console.warn('[SocialShare] TikTok go attempt 3 failed:', ttErr3);
                // Attempt 4: Sister TikTok package (com.ss.android.ugc.aweme)
                await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
                  type: 'video/*',
                  packageName: 'com.ss.android.ugc.aweme',
                  flags: 1,
                  extra: tiktokExtras
                });
                return true;
              }
            }
          }
        } else if (platform === 'youtube') {
          const ytExtras = buildYouTubeShareExtras(payload, contentUri);
          try {
            // Attempt 1: Direct YouTube app targeting com.google.android.youtube with video/*
            await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
              type: 'video/*',
              packageName: 'com.google.android.youtube',
              flags: 1,
              extra: ytExtras
            });
            return true;
          } catch (ytErr1) {
            console.warn('[SocialShare] YouTube attempt 1 failed:', ytErr1);
            try {
              // Attempt 2: Direct YouTube app with video/mp4 MIME type
              await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
                type: 'video/mp4',
                packageName: 'com.google.android.youtube',
                flags: 1,
                extra: ytExtras
              });
              return true;
            } catch (ytErr2) {
              console.warn('[SocialShare] YouTube attempt 2 failed:', ytErr2);
              // Attempt 3: Fallback generic video upload handler
              await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
                type: 'video/*',
                flags: 1,
                extra: ytExtras
              });
              return true;
            }
          }
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

/**
 * Share video file with its description directly into the native share sheet
 * Attaches the local video file and sets the description as the share caption/title.
 */
export async function sharePredictionVideo(payload: SocialSharePayload): Promise<boolean> {
  const { videoUri, description, thumbnailTimestamp } = payload;
  const thumbStr = formatThumbnailTimestamp(thumbnailTimestamp);

  // Automatically copy description to clipboard so it's always ready to paste in any app
  try {
    const Clipboard = await import('expo-clipboard');
    if (description) {
      await Clipboard.setStringAsync(description);
    }
  } catch (clipErr) {
    console.warn('[SocialShare] Could not copy description to clipboard:', clipErr);
  }

  try {
    const { Platform } = await import('react-native');

    // On iOS, React Native Share.share natively attaches both message (caption) and file URL
    if (Platform.OS === 'ios') {
      try {
        const { Share } = await import('react-native');
        const res = await Share.share({
          title: `GoalCast Prediction Reel (Cover: ${thumbStr})`,
          message: description,
          url: videoUri
        });
        if (res.action === Share.sharedAction) {
          return true;
        }
      } catch (iosErr) {
        console.warn('[SocialShare] iOS Share.share warning, falling back to expo-sharing:', iosErr);
      }
    }

    // On Android & cross-platform: expo-sharing creates the native FileProvider share chooser
    const Sharing = await import('expo-sharing');
    const isAvailable = await Sharing.isAvailableAsync().catch(() => false);

    if (isAvailable && videoUri.startsWith('file://')) {
      await Sharing.shareAsync(videoUri, {
        mimeType: 'video/mp4',
        dialogTitle: description || `Share GoalCast Prediction Reel (Cover: ${thumbStr})`,
        UTI: 'public.movie'
      });
      return true;
    }

    // Fallback: React Native Share
    const { Share } = await import('react-native');
    await Share.share({
      title: `GoalCast Prediction Reel (Cover: ${thumbStr})`,
      message: description ? `${description}\n\n[Cover: ${thumbStr}]\n${videoUri}` : videoUri
    });
    return true;
  } catch (err: any) {
    console.error('[SocialShare] Error sharing video:', err);
    try {
      const { Alert } = await import('react-native');
      Alert.alert('Share Error', `Could not share video: ${err?.message}`);
    } catch {}
    return false;
  }
}

/**
 * Share multiple prediction video files with their descriptions directly into native share sheet
 */
export async function shareMultiplePredictionVideos(
  items: { videoUri: string; description: string }[]
): Promise<boolean> {
  if (items.length === 0) return false;
  if (items.length === 1) {
    return sharePredictionVideo(items[0]);
  }

  const combinedDescription = items
    .map((item, i) => `[Reel ${i + 1}]: ${item.description}`)
    .join('\n\n');

  try {
    const Sharing = await import('expo-sharing');
    const isAvailable = await Sharing.isAvailableAsync().catch(() => false);

    if (isAvailable && items[0].videoUri.startsWith('file://')) {
      await Sharing.shareAsync(items[0].videoUri, {
        mimeType: 'video/mp4',
        dialogTitle: combinedDescription,
        UTI: 'public.movie'
      });
      return true;
    }

    const { Share } = await import('react-native');
    await Share.share({
      title: `GoalCast Prediction Reels (${items.length})`,
      message: combinedDescription
    });
    return true;
  } catch (err: any) {
    console.error('[SocialShare] Error batch sharing videos:', err);
    return false;
  }
}
