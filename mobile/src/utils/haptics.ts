import * as Haptics from 'expo-haptics';

export const triggerHaptic = () => {
  try {
    if (Haptics && typeof Haptics.impactAsync === 'function') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  } catch {
    // Ignore in environments without native haptics support (e.g. tests/web)
  }
};
