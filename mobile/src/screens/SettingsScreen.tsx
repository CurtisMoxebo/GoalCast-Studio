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

export const SettingsScreen: React.FC = () => {
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
  const [cloudProvider, setCloudProvider] = useState('AWS S3');
  const [defaultThumbnailTime, setDefaultThumbnailTime] = useState('00:03');
  const [defaultDescription, setDefaultDescription] = useState(
    'Football predictions for {date} ⚽🔥\n#football #soccer #predictions #fyp'
  );

  const handleSave = () => {
    Alert.alert('Settings Saved', 'Your studio preferences have been updated.');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Studio Settings</Text>
        <Text style={styles.subtitle}>Configure generation defaults & upcoming cloud sync</Text>
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
