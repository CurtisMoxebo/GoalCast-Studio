const getDefaultApiHost = (): string => {
  return 'http://66.131.227.117:8006';
};

export const API_BASE_URL =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ||
  getDefaultApiHost();
