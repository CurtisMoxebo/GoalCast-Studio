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
