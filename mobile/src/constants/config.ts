declare const __DEV__: boolean | undefined;

export const PROD_API_HOST = 'https://goalcast-zone-api.moxebocurtis.com';
export const LOCAL_DEV_FALLBACK = 'http://192.168.0.15:5000';

export const resolveApiBaseUrl = (): string => {
  const envUrl = typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_API_URL : undefined;

  // If envUrl is explicitly provided and is a valid remote host or LAN IP, use it directly
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl;
  }

  // In Expo development on mobile, auto-resolve dev PC's IP from Metro hostUri
  try {
    // Dynamically require expo-constants to avoid static react-native transform issues in node tests
    const Constants = require('expo-constants').default || require('expo-constants');
    const hostUri = Constants?.expoConfig?.hostUri || Constants?.manifest?.debuggerHost;
    if (hostUri) {
      const ip = hostUri.split(':')[0];
      if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
        return `http://${ip}:5000`;
      }
    }
  } catch {}

  // If in web browser on localhost
  if (typeof window !== 'undefined' && window?.location?.hostname === 'localhost') {
    return 'http://localhost:5000';
  }

  // Fallback to local Wi-Fi IP if running in dev, otherwise production server
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return LOCAL_DEV_FALLBACK;
  }

  return PROD_API_HOST;
};

export const API_BASE_URL = resolveApiBaseUrl();

/**
 * Default timestamp offset (in seconds) used for video thumbnail frames across the mobile studio.
 */
export const DEFAULT_THUMBNAIL_TIMESTAMP = 5.0;

/**
 * Formatted string representation (MM:SS) of the default thumbnail timestamp.
 */
export const DEFAULT_THUMBNAIL_TIME_STR = '00:05';

/**
 * Video, Media & Scheduling Default Constants across the mobile studio.
 */
export const DEFAULT_BACKGROUND_VIDEO = 'background_video_1.mp4';
export const DEFAULT_BACKGROUND_AUDIO = 'background_track_1.mp3';
export const DEFAULT_VOICE_ACTOR = 'hearth';
export const DEFAULT_DESCRIPTION_TEMPLATE =
  'Football predictions for {date} ⚽🔥\n#football #soccer #predictions #fyp';
export const MIN_SCHEDULE_ADVANCE_MINUTES = 29.5;
export const DEFAULT_SCHEDULE_HOUR = 19;
export const DEFAULT_SCHEDULE_MINUTE = 0;

/**
 * Default list of social platforms enabled on initial render.
 */
export const DEFAULT_SELECTED_SOCIAL_PLATFORMS = [
  'facebook_reels',
  'instagram_reels',
  'tiktok',
  'youtube_shorts'
] as const;

export interface DirectPostTemplate {
  id: string;
  label: string;
  content: string;
}

/**
 * Selectable description templates for the Direct Social Post tab.
 * Add new templates here to expose them in the mobile Post tab automatically.
 */
export const DIRECT_POST_DESCRIPTION_TEMPLATES: DirectPostTemplate[] = [
  {
    id: 'sportybet_slip',
    label: '⚽ Sportybet Slip',
    content:
      '⚽️ Sportybet Slip\n\n🎟️ Code: \n📊 Total Odds: \n\n💡 Note: Stake responsibly. Edit to your preference if needed'
  },
  {
    id: 'blank',
    label: '✍️ Blank',
    content: ''
  }
];

export const DEFAULT_DIRECT_POST_DESCRIPTION = DIRECT_POST_DESCRIPTION_TEMPLATES[0].content;
