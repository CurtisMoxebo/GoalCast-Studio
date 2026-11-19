const getDefaultApiHost = (): string => {
  // Android emulator loopback host is 10.0.2.2
  return 'http://localhost:5000';
};

export const API_BASE_URL =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ||
  getDefaultApiHost();
