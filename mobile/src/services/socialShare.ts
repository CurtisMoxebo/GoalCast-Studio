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
  icon: string; // Ionicons / FontAwesome icon name
}

export const SOCIAL_PLATFORMS: PlatformConfig[] = [
  {
    id: 'facebook',
    name: 'Facebook Reels',
    color: '#1877F2',
    icon: 'logo-facebook'
  },
  {
    id: 'instagram',
    name: 'Instagram Reels',
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
    name: 'YouTube Shorts',
    color: '#FF0000',
    icon: 'logo-youtube'
  }
];

export async function shareToSocialMedia(
  platform: SocialPlatform,
  payload: SocialSharePayload
): Promise<boolean> {
  try {
    const Sharing = await import('expo-sharing');
    const isAvailable = await Sharing.isAvailableAsync().catch(() => false);
    const config = SOCIAL_PLATFORMS.find((p) => p.id === platform);
    const platformName = config?.name || 'Social Media';

    if (!isAvailable) {
      // Fallback for web or platforms without native file sharing sheet
      const { Share } = await import('react-native');
      await Share.share({
        message: `${payload.description}\n\n[GoalCast Video Ready for ${platformName}]`
      });
      return true;
    }

    // Share native video file with caption dialog
    await Sharing.shareAsync(payload.videoUri, {
      mimeType: 'video/mp4',
      dialogTitle: `Post to ${platformName}`,
      UTI: 'public.movie'
    });

    return true;
  } catch (error: any) {
    console.error(`[SocialShare] Error sharing to ${platform}:`, error);
    try {
      const { Alert } = await import('react-native');
      Alert.alert('Sharing Notice', `Could not complete share to ${platform}: ${error?.message}`);
    } catch {}
    return false;
  }
}
