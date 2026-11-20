import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { THEME } from '../constants/theme';

interface FixturesLoadingViewProps {
  displayDate?: string;
}

const LOADING_STEPS = [
  'Connecting to live football feeds...',
  'Scanning 35+ global leagues & competitions...',
  'Syncing official club crests & kickoffs...',
  'Preparing AI prediction models...'
];

export const FixturesLoadingView: React.FC<FixturesLoadingViewProps> = ({ displayDate }) => {
  const pulseAnim = useRef(new Animated.Value(0.35)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const [stepIndex, setStepIndex] = useState(0);

  // Pulse shimmer animation for skeleton shapes
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.85,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    );
    pulse.start();

    // Floating bounce for badge
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -5,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    );
    float.start();

    // Cycle through live status messages
    const timer = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % LOADING_STEPS.length);
    }, 1800);

    return () => {
      pulse.stop();
      float.stop();
      clearInterval(timer);
    };
  }, [pulseAnim, floatAnim]);

  return (
    <View style={styles.container}>
      {/* Brand Hero Banner */}
      <View style={styles.brandHero}>
        <Animated.View style={[styles.logoBadge, { transform: [{ translateY: floatAnim }] }]}>
          <Text style={styles.logoIcon}>⚽</Text>
        </Animated.View>
        <Text style={styles.brandTitle}>GoalCast Studio</Text>
        <Text style={styles.brandSubtitle}>
          {displayDate ? `Querying fixtures for ${displayDate}` : 'Syncing scheduled fixtures...'}
        </Text>

        {/* Dynamic Status Stepper Pill */}
        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{LOADING_STEPS[stepIndex]}</Text>
        </View>
      </View>

      {/* Realistic Competition Card Skeletons */}
      <View style={styles.skeletonsWrapper}>
        {[1, 2].map((cardId) => (
          <Animated.View key={cardId} style={[styles.skeletonCard, { opacity: pulseAnim }]}>
            {/* Header Skeleton */}
            <View style={styles.skeletonHeader}>
              <View style={styles.skeletonLogo} />
              <View style={styles.skeletonHeaderTextCol}>
                <View style={[styles.skeletonBar, { width: 140, height: 13 }]} />
                <View style={[styles.skeletonBar, { width: 75, height: 10, marginTop: 5 }]} />
              </View>
              <View style={styles.skeletonMatchCount} />
            </View>

            {/* Match Row Skeleton 1 */}
            <View style={styles.skeletonRow}>
              <View style={styles.skeletonTimeCol}>
                <View style={[styles.skeletonBar, { width: 44, height: 10 }]} />
                <View style={[styles.skeletonBar, { width: 38, height: 11, marginTop: 4 }]} />
              </View>
              <View style={styles.skeletonTeamsCol}>
                <View style={styles.skeletonTeamLine}>
                  <View style={styles.skeletonCrest} />
                  <View style={[styles.skeletonBar, { width: 115, height: 11 }]} />
                </View>
                <View style={[styles.skeletonTeamLine, { marginTop: 6 }]}>
                  <View style={styles.skeletonCrest} />
                  <View style={[styles.skeletonBar, { width: 95, height: 11 }]} />
                </View>
              </View>
              <View style={styles.skeletonActionBtn} />
            </View>

            {/* Match Row Skeleton 2 */}
            <View style={[styles.skeletonRow, styles.skeletonRowBorder]}>
              <View style={styles.skeletonTimeCol}>
                <View style={[styles.skeletonBar, { width: 44, height: 10 }]} />
                <View style={[styles.skeletonBar, { width: 38, height: 11, marginTop: 4 }]} />
              </View>
              <View style={styles.skeletonTeamsCol}>
                <View style={styles.skeletonTeamLine}>
                  <View style={styles.skeletonCrest} />
                  <View style={[styles.skeletonBar, { width: 130, height: 11 }]} />
                </View>
                <View style={[styles.skeletonTeamLine, { marginTop: 6 }]}>
                  <View style={styles.skeletonCrest} />
                  <View style={[styles.skeletonBar, { width: 105, height: 11 }]} />
                </View>
              </View>
              <View style={styles.skeletonActionBtn} />
            </View>
          </Animated.View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12
  },
  brandHero: {
    alignItems: 'center',
    marginBottom: 16
  },
  logoBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#0c2340',
    borderWidth: 2,
    borderColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 8
  },
  logoIcon: {
    fontSize: 24
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 0.5
  },
  brandSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '500'
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#1e293b'
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#38bdf8',
    marginRight: 8
  },
  statusText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '600'
  },
  skeletonsWrapper: {
    flex: 1
  },
  skeletonCard: {
    backgroundColor: '#0c1322',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 12,
    overflow: 'hidden'
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderColor: '#192438'
  },
  skeletonLogo: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    marginRight: 10
  },
  skeletonHeaderTextCol: {
    flex: 1
  },
  skeletonMatchCount: {
    width: 22,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1e293b'
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  skeletonRowBorder: {
    borderTopWidth: 1,
    borderColor: '#172236'
  },
  skeletonTimeCol: {
    width: 60,
    justifyContent: 'center'
  },
  skeletonTeamsCol: {
    flex: 1,
    paddingHorizontal: 6
  },
  skeletonTeamLine: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  skeletonCrest: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    marginRight: 8
  },
  skeletonActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#172236',
    borderWidth: 1,
    borderColor: '#24344d',
    marginLeft: 6
  },
  skeletonBar: {
    backgroundColor: '#1e293b',
    borderRadius: 4
  }
});
