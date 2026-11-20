import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Animated,
  Easing,
  Dimensions
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { THEME } from '../constants/theme';

const { width } = Dimensions.get('window');

interface AppInitialLoadingScreenProps {
  onFinish: () => void;
  minDurationMs?: number;
}

const STARTUP_STAGES = [
  'Initializing GoalCast Studio...',
  'Connecting to live football engine...',
  'Syncing global fixtures & crests...',
  'Calibrating AI prediction models...',
  'Welcome to Studio'
];

export const AppInitialLoadingScreen: React.FC<AppInitialLoadingScreenProps> = ({
  onFinish,
  minDurationMs = 2000
}) => {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const glowAnim = useRef(new Animated.Value(0.6)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    // 1. Entrance zoom for logo
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 40,
      friction: 7,
      useNativeDriver: true
    }).start();

    // 2. Ambient neon glow pulse
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(glowAnim, {
          toValue: 0.5,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    );
    glowLoop.start();

    // 3. Shimmer pulse loop
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.9,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    );
    pulseLoop.start();

    // 4. Progress bar fill
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: minDurationMs - 300,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: false
    }).start();

    // 5. Sequence through startup stages
    const stageDuration = (minDurationMs - 400) / (STARTUP_STAGES.length - 1);
    const intervals: NodeJS.Timeout[] = [];

    for (let i = 1; i < STARTUP_STAGES.length; i++) {
      const timeout = setTimeout(() => {
        setStageIndex(i);
      }, i * stageDuration);
      intervals.push(timeout);
    }

    // 6. Complete and fade out
    const finishTimeout = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 450,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true
      }).start(() => {
        onFinish();
      });
    }, minDurationMs);

    return () => {
      glowLoop.stop();
      pulseLoop.stop();
      intervals.forEach(clearTimeout);
      clearTimeout(finishTimeout);
    };
  }, [fadeAnim, scaleAnim, glowAnim, pulseAnim, progressAnim, minDurationMs, onFinish]);

  const progressBarWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%']
  });

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar style="light" />

      {/* Background Stadium Glow Elements */}
      <Animated.View
        style={[
          styles.ambientOrb,
          {
            opacity: glowAnim,
            transform: [{ scale: glowAnim.interpolate({ inputRange: [0.5, 1], outputRange: [0.9, 1.2] }) }]
          }
        ]}
      />
      <View style={styles.ambientOrbSecondary} />

      {/* Main Brand Content */}
      <View style={styles.content}>
        {/* App Icon with Glowing Ring */}
        <Animated.View
          style={[
            styles.iconContainer,
            {
              transform: [{ scale: scaleAnim }]
            }
          ]}
        >
          <Animated.View style={[styles.iconGlowRing, { opacity: pulseAnim }]} />
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logoImage}
            resizeMode="cover"
          />
        </Animated.View>

        {/* Brand Title */}
        <View style={styles.titleRow}>
          <Text style={styles.titleGoalCast}>GOALCAST</Text>
          <Text style={styles.titleStudio}> STUDIO</Text>
        </View>

        {/* Subtitle Pill */}
        <View style={styles.pillContainer}>
          <Text style={styles.pillDot}>⚡</Text>
          <Text style={styles.pillText}>AI FOOTBALL VIDEO & PREDICTION SUITE</Text>
        </View>

        {/* Startup Progress Area */}
        <View style={styles.progressSection}>
          <View style={styles.progressBarTrack}>
            <Animated.View style={[styles.progressBarFill, { width: progressBarWidth }]} />
          </View>

          <View style={styles.statusRow}>
            <Animated.View style={[styles.statusLiveDot, { opacity: pulseAnim }]} />
            <Text style={styles.statusText}>{STARTUP_STAGES[stageIndex]}</Text>
          </View>
        </View>
      </View>

      {/* Footer / Version */}
      <View style={styles.footer}>
        <Text style={styles.footerBrand}>POWERED BY DEEPMIND & GOALCAST AI</Text>
        <Text style={styles.footerVersion}>v1.0.0 • Studio Edition</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 50,
    zIndex: 9999
  },
  ambientOrb: {
    position: 'absolute',
    top: '25%',
    width: width * 0.85,
    height: width * 0.85,
    borderRadius: (width * 0.85) / 2,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    filter: 'blur(40px)'
  },
  ambientOrbSecondary: {
    position: 'absolute',
    bottom: '15%',
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: (width * 0.7) / 2,
    backgroundColor: 'rgba(14, 165, 233, 0.08)'
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 28
  },
  iconContainer: {
    width: 110,
    height: 110,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
    position: 'relative'
  },
  iconGlowRing: {
    position: 'absolute',
    width: 126,
    height: 126,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.18)'
  },
  logoImage: {
    width: 104,
    height: 104,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)'
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10
  },
  titleGoalCast: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 1.5
  },
  titleStudio: {
    fontSize: 28,
    fontWeight: '900',
    color: '#10b981',
    letterSpacing: 1.5
  },
  pillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    marginBottom: 44
  },
  pillDot: {
    fontSize: 12,
    marginRight: 6
  },
  pillText: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1
  },
  progressSection: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center'
  },
  progressBarTrack: {
    width: '100%',
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 16
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 3
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10b981',
    marginRight: 8
  },
  statusText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.3
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 10
  },
  footerBrand: {
    color: 'rgba(255, 255, 255, 0.25)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 4
  },
  footerVersion: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 11,
    fontWeight: '500'
  }
});
