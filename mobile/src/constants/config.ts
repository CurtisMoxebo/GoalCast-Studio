declare const __DEV__: boolean | undefined;

const PROD_API_HOST = 'https://goalcast-zone-api.moxebocurtis.com';
const DEV_API_HOST = 'http://localhost:5000';

const getDefaultApiHost = (): string => {
  // In development mode (npx expo start), use localhost
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return DEV_API_HOST;
  }
  // In production builds (release APK, EAS build), use production server
  return PROD_API_HOST;
};

export const API_BASE_URL =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ||
  getDefaultApiHost();
