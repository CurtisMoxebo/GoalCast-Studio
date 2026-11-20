import React, { useState, Component, ErrorInfo, ReactNode } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  StatusBar as RNStatusBar
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { THEME } from './src/constants/theme';
import { GamesScreen } from './src/screens/GamesScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { AppInitialLoadingScreen } from './src/components/AppInitialLoadingScreen';
import * as SplashScreen from 'expo-splash-screen';

// Keep the native splash screen visible while JS bundle initializes
SplashScreen.preventAutoHideAsync().catch(() => {});

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[GoalCast ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <ScrollView contentContainerStyle={styles.errorContent}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorMessage}>{this.state.error?.message || 'Unknown error'}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={this.handleReset}>
              <Text style={styles.retryButtonText}>🔄 Reload Studio</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

type Tab = 'GAMES' | 'HISTORY' | 'SETTINGS';

function MainApp() {
  const [currentTab, setCurrentTab] = useState<Tab>('GAMES');
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Main Screen Content */}
      <View style={styles.content}>
        <View style={[styles.tabContent, currentTab !== 'GAMES' && styles.hiddenTab]}>
          <GamesScreen />
        </View>
        <View style={[styles.tabContent, currentTab !== 'HISTORY' && styles.hiddenTab]}>
          <HistoryScreen />
        </View>
        <View style={[styles.tabContent, currentTab !== 'SETTINGS' && styles.hiddenTab]}>
          <SettingsScreen />
        </View>
      </View>

      {/* Bottom Tab Bar (3 Tabs) with Device Safe Area Insets */}
      <View
        style={[
          styles.tabBar,
          {
            paddingBottom: Math.max(insets.bottom, 10),
            height: 58 + Math.max(insets.bottom, 10)
          }
        ]}
      >
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setCurrentTab('GAMES')}
          activeOpacity={0.7}
        >
          <Text style={styles.tabIcon}>⚽</Text>
          <Text style={[styles.tabLabel, currentTab === 'GAMES' && styles.tabLabelActive]}>
            Games
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setCurrentTab('HISTORY')}
          activeOpacity={0.7}
        >
          <Text style={styles.tabIcon}>📜</Text>
          <Text style={[styles.tabLabel, currentTab === 'HISTORY' && styles.tabLabelActive]}>
            History
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setCurrentTab('SETTINGS')}
          activeOpacity={0.7}
        >
          <Text style={styles.tabIcon}>⚙️</Text>
          <Text style={[styles.tabLabel, currentTab === 'SETTINGS' && styles.tabLabelActive]}>
            Settings
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function App() {
  const [isAppReady, setIsAppReady] = useState(false);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <MainApp />
        {!isAppReady && (
          <AppInitialLoadingScreen onFinish={() => setIsAppReady(true)} />
        )}
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background
  },
  content: {
    flex: 1
  },
  tabContent: {
    flex: 1
  },
  hiddenTab: {
    display: 'none'
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.tabBarBackground,
    borderTopWidth: 1,
    borderColor: THEME.colors.tabBarBorder,
    alignItems: 'center',
    justifyContent: 'space-around'
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    flex: 1
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: 2
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME.colors.textMuted
  },
  tabLabelActive: {
    color: THEME.colors.primary,
    fontWeight: 'bold'
  },
  errorContainer: {
    flex: 1,
    backgroundColor: THEME.colors.background
  },
  errorContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 12
  },
  errorMessage: {
    fontSize: 14,
    color: '#f87171',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20
  },
  retryButton: {
    backgroundColor: THEME.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10
  },
  retryButtonText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 15
  }
});
