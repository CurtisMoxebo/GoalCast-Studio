import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { THEME } from './src/constants/theme';
import { GamesScreen } from './src/screens/GamesScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

type Tab = 'GAMES' | 'HISTORY' | 'SETTINGS';

export default function App() {
  const [currentTab, setCurrentTab] = useState<Tab>('GAMES');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Main Screen Content */}
      <View style={styles.content}>
        {currentTab === 'GAMES' && <GamesScreen />}
        {currentTab === 'HISTORY' && <HistoryScreen />}
        {currentTab === 'SETTINGS' && <SettingsScreen />}
      </View>

      {/* Bottom Tab Bar (3 Tabs) */}
      <View style={styles.tabBar}>
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
    </SafeAreaView>
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
  tabBar: {
    flexDirection: 'row',
    height: 64,
    backgroundColor: THEME.colors.tabBarBackground,
    borderTopWidth: 1,
    borderColor: THEME.colors.tabBarBorder,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 4
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
  }
});
