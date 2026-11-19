import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import { THEME } from '../constants/theme';
import { MediaAsset, VoiceOption, VideoSettings } from '../types';
import { formatOrdinalDate } from '../utils/dateUtils';

interface VideoSettingsWizardProps {
  targetDate: string;
  selectedMatchesCount: number;
  availableVideos: MediaAsset[];
  availableAudio: MediaAsset[];
  availableVoices: VoiceOption[];
  onBack: () => void;
  onPreview: (settings: VideoSettings) => void;
  isLoading: boolean;
}

export const VideoSettingsWizard: React.FC<VideoSettingsWizardProps> = ({
  targetDate,
  selectedMatchesCount,
  availableVideos,
  availableAudio,
  availableVoices,
  onBack,
  onPreview,
  isLoading
}) => {
  const formattedDate = formatOrdinalDate(targetDate);
  const defaultDesc = `Football predictions for ${formattedDate} ⚽🔥\n#football #soccer #predictions #footballpredictions #fyp`;

  const [selectedVideo, setSelectedVideo] = useState(
    availableVideos[0]?.filename || 'background_video_1.mp4'
  );
  const [selectedAudio, setSelectedAudio] = useState(
    availableAudio[0]?.filename || 'background_track_1.mp3'
  );
  const [selectedVoice, setSelectedVoice] = useState('hearth');
  const [thumbnailSeconds, setThumbnailSeconds] = useState(3.0); // 00:03 default
  const [description, setDescription] = useState(defaultDesc);

  const formatSecondsToMMSS = (sec: number): string => {
    const s = Math.round(sec);
    const m = Math.floor(s / 60);
    const remainingS = s % 60;
    return `${String(m).padStart(2, '0')}:${String(remainingS).padStart(2, '0')}`;
  };

  const handleStartGeneration = () => {
    onPreview({
      backgroundVideo: selectedVideo,
      backgroundAudio: selectedAudio,
      voiceActor: selectedVoice,
      thumbnailTimestamp: thumbnailSeconds,
      description
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>← Back to Games</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Video Customization</Text>
        <Text style={styles.subtitle}>
          Configuring Reel for {selectedMatchesCount} selected matches
        </Text>
      </View>

      {/* 1. Background Video Selector */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎬 Background Video (Looped)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
          {availableVideos.map((video) => {
            const isSelected = selectedVideo === video.filename;
            return (
              <TouchableOpacity
                key={video.id}
                style={[styles.mediaCard, isSelected && styles.mediaCardSelected]}
                onPress={() => setSelectedVideo(video.filename)}
              >
                <Text style={styles.mediaIcon}>📹</Text>
                <Text style={[styles.mediaName, isSelected && styles.mediaNameSelected]}>
                  {video.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 2. Background Audio Selector */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎵 Background Beat (Low Volume)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
          {availableAudio.map((audio) => {
            const isSelected = selectedAudio === audio.filename;
            return (
              <TouchableOpacity
                key={audio.id}
                style={[styles.mediaCard, isSelected && styles.mediaCardSelected]}
                onPress={() => setSelectedAudio(audio.filename)}
              >
                <Text style={styles.mediaIcon}>🎧</Text>
                <Text style={[styles.mediaName, isSelected && styles.mediaNameSelected]}>
                  {audio.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 3. Voice Actor Selector */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎙️ Voice Actor (Kokoro TTS)</Text>
        <View style={styles.voiceGrid}>
          {availableVoices.map((voice) => {
            const isSelected = selectedVoice === voice.id;
            return (
              <TouchableOpacity
                key={voice.id}
                style={[styles.voiceCard, isSelected && styles.voiceCardSelected]}
                onPress={() => setSelectedVoice(voice.id)}
              >
                <Text style={[styles.voiceName, isSelected && styles.voiceNameSelected]}>
                  {voice.name}
                </Text>
                <Text style={styles.voiceGender}>{voice.gender} • {voice.accent || 'US'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 4. Thumbnail Frame Selector (00:00 to 00:20, default 00:03) */}
      <View style={styles.section}>
        <View style={styles.thumbHeader}>
          <Text style={styles.sectionTitle}>📸 Thumbnail Frame Time</Text>
          <Text style={styles.thumbTimeDisplay}>
            {formatSecondsToMMSS(thumbnailSeconds)}
          </Text>
        </View>
        <Text style={styles.sectionSubtitle}>
          Choose the exact frame timestamp to capture the video thumbnail (Range: 00:00 to 00:20)
        </Text>

        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => setThumbnailSeconds((s) => Math.max(0, s - 1))}
          >
            <Text style={styles.stepperBtnText}>- 1s</Text>
          </TouchableOpacity>

          {/* Quick preset chips */}
          <View style={styles.presetChips}>
            {[1, 3, 5, 10, 15].map((sec) => (
              <TouchableOpacity
                key={sec}
                style={[
                  styles.presetChip,
                  Math.round(thumbnailSeconds) === sec && styles.presetChipActive
                ]}
                onPress={() => setThumbnailSeconds(sec)}
              >
                <Text
                  style={[
                    styles.presetChipText,
                    Math.round(thumbnailSeconds) === sec && styles.presetChipTextActive
                  ]}
                >
                  {formatSecondsToMMSS(sec)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => setThumbnailSeconds((s) => Math.min(20, s + 1))}
          >
            <Text style={styles.stepperBtnText}>+ 1s</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 5. Description Input Field */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📝 Caption & Description</Text>
        <TextInput
          style={styles.descInput}
          multiline
          numberOfLines={4}
          value={description}
          onChangeText={setDescription}
          placeholder="Enter video description with hashtags..."
          placeholderTextColor={THEME.colors.textMuted}
        />
      </View>

      {/* Generate Preview Button */}
      <TouchableOpacity
        style={[styles.previewBtn, isLoading && styles.previewBtnDisabled]}
        onPress={handleStartGeneration}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#020617" />
        ) : (
          <Text style={styles.previewBtnText}>Generate Video Preview ✨</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
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
  backBtn: {
    paddingVertical: 6,
    marginBottom: 8
  },
  backBtnText: {
    color: THEME.colors.primary,
    fontSize: 14,
    fontWeight: 'bold'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: THEME.colors.textPrimary
  },
  subtitle: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    marginTop: 4
  },
  section: {
    backgroundColor: THEME.colors.cardBackground,
    borderRadius: THEME.borderRadius.lg,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: THEME.colors.textPrimary,
    marginBottom: 8
  },
  sectionSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginBottom: 12
  },
  horizontalScroll: {
    flexDirection: 'row',
    marginTop: 4
  },
  mediaCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginRight: 10,
    alignItems: 'center',
    width: 130,
    borderWidth: 2,
    borderColor: 'transparent'
  },
  mediaCardSelected: {
    borderColor: THEME.colors.primary,
    backgroundColor: '#0c4a6e'
  },
  mediaIcon: {
    fontSize: 26,
    marginBottom: 6
  },
  mediaName: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
    textAlign: 'center'
  },
  mediaNameSelected: {
    color: THEME.colors.primary,
    fontWeight: 'bold'
  },
  voiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 4
  },
  voiceCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    width: '48%',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent'
  },
  voiceCardSelected: {
    borderColor: THEME.colors.primary,
    backgroundColor: '#0c4a6e'
  },
  voiceName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: THEME.colors.textPrimary
  },
  voiceNameSelected: {
    color: THEME.colors.primary
  },
  voiceGender: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 2
  },
  thumbHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  thumbTimeDisplay: {
    fontSize: 18,
    fontWeight: '900',
    color: THEME.colors.accentGold,
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  stepperBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder
  },
  stepperBtnText: {
    color: THEME.colors.primary,
    fontSize: 14,
    fontWeight: 'bold'
  },
  presetChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    flex: 1,
    marginHorizontal: 8
  },
  presetChip: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    margin: 3
  },
  presetChipActive: {
    backgroundColor: THEME.colors.primary
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: THEME.colors.textSecondary
  },
  presetChipTextActive: {
    color: '#020617'
  },
  descInput: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 12,
    color: THEME.colors.textPrimary,
    fontSize: 14,
    textAlignVertical: 'top',
    minHeight: 100,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder
  },
  previewBtn: {
    backgroundColor: THEME.colors.primary,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: THEME.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6
  },
  previewBtnDisabled: {
    opacity: 0.6
  },
  previewBtnText: {
    color: '#020617',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5
  }
});
