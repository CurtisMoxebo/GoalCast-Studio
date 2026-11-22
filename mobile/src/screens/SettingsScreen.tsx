import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  StyleSheet,
  Alert
} from 'react-native';
import { THEME } from '../constants/theme';
import { PROD_API_HOST, LOCAL_DEV_FALLBACK } from '../constants/config';
import { mobileApi } from '../services/api';

export const SettingsScreen: React.FC = () => {
  const [apiUrl, setApiUrl] = useState(mobileApi.getBaseUrl());
  const [pingStatus, setPingStatus] = useState<'idle' | 'checking' | 'online' | 'offline'>('idle');
  const [pingMessage, setPingMessage] = useState<string>('');
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
  const [cloudProvider, setCloudProvider] = useState('AWS S3');
  const [defaultThumbnailTime, setDefaultThumbnailTime] = useState('00:03');
  const [defaultDescription, setDefaultDescription] = useState(
    'Football predictions for {date} ⚽🔥\n#football #soccer #predictions #fyp'
  );

  const handleSave = () => {
    mobileApi.setBaseUrl(apiUrl);
    Alert.alert('Settings Saved', 'Your studio preferences and API server URL have been updated.');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Studio Settings</Text>
        <Text style={styles.subtitle}>Configure server connection, generation defaults & cloud sync</Text>
      </View>

      {/* Backend API Server Connectivity */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>🌐 API Server Connection</Text>
          <View
            style={[
              styles.statusPill,
              pingStatus === 'online'
                ? styles.statusOnline
                : pingStatus === 'offline'
                ? styles.statusOffline
                : styles.statusIdle
            ]}
          >
            <Text style={styles.statusPillText}>
              {pingStatus === 'checking'
                ? '⏳ Checking...'
                : pingStatus === 'online'
                ? '🟢 Online'
                : pingStatus === 'offline'
                ? '🔴 Offline'
                : '⚪ Ready'}
            </Text>
          </View>
        </View>
        <Text style={styles.cardDesc}>
          Configure which backend your device connects to. On real phones, use your local Wi-Fi IP or the cloud server.
        </Text>

        <TextInput
          style={styles.input}
          value={apiUrl}
          onChangeText={setApiUrl}
          placeholder="http://192.168.0.15:5000"
          placeholderTextColor={THEME.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.presetRow}>
          <TouchableOpacity
            style={[styles.presetBtn, apiUrl === LOCAL_DEV_FALLBACK && styles.presetBtnActive]}
            onPress={() => {
              setApiUrl(LOCAL_DEV_FALLBACK);
              mobileApi.setBaseUrl(LOCAL_DEV_FALLBACK);
            }}
          >
            <Text style={styles.presetBtnText}>💻 Local Wi-Fi (192.168.0.15)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.presetBtn, apiUrl === PROD_API_HOST && styles.presetBtnActive]}
            onPress={() => {
              setApiUrl(PROD_API_HOST);
              mobileApi.setBaseUrl(PROD_API_HOST);
            }}
          >
            <Text style={styles.presetBtnText}>🌐 Production Server</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.testBtn}
          onPress={async () => {
            mobileApi.setBaseUrl(apiUrl);
            setPingStatus('checking');
            const res = await mobileApi.checkHealth();
            if (res.ok) {
              setPingStatus('online');
              setPingMessage('Successfully connected to server (HTTP 200)');
            } else {
              setPingStatus('offline');
              setPingMessage(res.error || 'Connection failed');
            }
          }}
        >
          <Text style={styles.testBtnText}>⚡ Test & Apply Connection</Text>
        </TouchableOpacity>
        {pingMessage ? (
          <Text style={[styles.pingResult, pingStatus === 'online' ? styles.pingSuccess : styles.pingError]}>
            {pingMessage}
          </Text>
        ) : null}
      </View>

      {/* Cloud Storage Setup Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>☁️ Cloud Storage (Upcoming)</Text>
          <Switch
            value={cloudSyncEnabled}
            onValueChange={setCloudSyncEnabled}
            trackColor={{ false: '#334155', true: THEME.colors.primary }}
          />
        </View>
        <Text style={styles.cardDesc}>
          Enable automatic backup and sync of generated prediction videos to the cloud. Currently all videos are saved locally to your device storage.
        </Text>
        {cloudSyncEnabled && (
          <View style={styles.cloudOptions}>
            <Text style={styles.inputLabel}>Storage Provider:</Text>
            <View style={styles.pillRow}>
              {['AWS S3', 'Google Cloud', 'Cloudflare R2'].map((provider) => (
                <TouchableOpacity
                  key={provider}
                  style={[styles.pill, cloudProvider === provider && styles.pillActive]}
                  onPress={() => setCloudProvider(provider)}
                >
                  <Text style={[styles.pillText, cloudProvider === provider && styles.pillTextActive]}>
                    {provider}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Video Defaults */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>⏱️ Default Thumbnail Timeframe</Text>
        <Text style={styles.cardDesc}>
          Default frame timestamp for capturing reel thumbnails (Range 00:00 to 00:20).
        </Text>
        <TextInput
          style={styles.input}
          value={defaultThumbnailTime}
          onChangeText={setDefaultThumbnailTime}
          placeholder="00:03"
          placeholderTextColor={THEME.colors.textMuted}
        />
      </View>

      {/* Caption Template */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📝 Default Caption Template</Text>
        <Text style={styles.cardDesc}>
          Use &#123;date&#125; as placeholder for formatted match date.
        </Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          multiline
          numberOfLines={3}
          value={defaultDescription}
          onChangeText={setDefaultDescription}
          placeholderTextColor={THEME.colors.textMuted}
        />
      </View>

      {/* Media Management Placeholders */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🎬 Background Assets Manager</Text>
        <Text style={styles.cardDesc}>
          Upload or manage custom vertical background video loops and low-volume background beats.
        </Text>
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => Alert.alert('Media Manager', 'Add background videos will be enabled in next release.')}
          >
            <Text style={styles.actionBtnText}>+ Add Videos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => Alert.alert('Media Manager', 'Add background audio tracks will be enabled in next release.')}
          >
            <Text style={styles.actionBtnText}>+ Add Audio</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Save Preferences</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: THEME.colors.background
  },
  content: {
    padding: 20,
    paddingBottom: 40
  },
  header: {
    marginBottom: 20
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: THEME.colors.textPrimary
  },
  subtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 4
  },
  card: {
    backgroundColor: THEME.colors.cardBackground,
    borderRadius: THEME.borderRadius.lg,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: THEME.colors.textPrimary,
    marginBottom: 4
  },
  cardDesc: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12
  },
  cloudOptions: {
    marginTop: 8
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: THEME.colors.textSecondary,
    marginBottom: 6
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  pill: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 6
  },
  pillActive: {
    backgroundColor: THEME.colors.primary
  },
  pillText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: '600'
  },
  pillTextActive: {
    color: '#020617',
    fontWeight: 'bold'
  },
  input: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 12,
    color: THEME.colors.textPrimary,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    fontSize: 14
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top'
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: THEME.colors.primary
  },
  actionBtnText: {
    color: THEME.colors.primary,
    fontSize: 13,
    fontWeight: 'bold'
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  statusOnline: {
    backgroundColor: '#064e3b'
  },
  statusOffline: {
    backgroundColor: '#450a0a'
  },
  statusIdle: {
    backgroundColor: '#334155'
  },
  statusPillText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '700'
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 8
  },
  presetBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: 'center'
  },
  presetBtnActive: {
    borderColor: '#38bdf8',
    backgroundColor: '#0c4a6e'
  },
  presetBtnText: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '600'
  },
  testBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6
  },
  testBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  pingResult: {
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center'
  },
  pingSuccess: {
    color: '#34d399'
  },
  pingError: {
    color: '#f87171'
  },
  saveBtn: {
    backgroundColor: THEME.colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10
  },
  saveBtnText: {
    color: '#020617',
    fontSize: 16,
    fontWeight: '900'
  }
});
