import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  PanResponder
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { THEME } from '../constants/theme';
import { MediaAsset, VoiceOption, VideoSettings } from '../types';
import { formatOrdinalDate } from '../utils/dateUtils';
import { triggerHaptic } from '../utils/haptics';

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

const formatSecondsToMMSS = (sec: number): string => {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const remainingS = s % 60;
  return `${String(m).padStart(2, '0')}:${String(remainingS).padStart(2, '0')}`;
};

interface ThumbnailTimeSliderProps {
  seconds: number;
  min?: number;
  max?: number;
  onChange: (val: number) => void;
}

const ThumbnailTimeSlider: React.FC<ThumbnailTimeSliderProps> = ({
  seconds,
  min = 0,
  max = 20,
  onChange
}) => {
  const [trackWidth, setTrackWidth] = useState(0);
  const startValRef = useRef(seconds);
  const currentValRef = useRef(seconds);
  currentValRef.current = seconds;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const touchX = evt.nativeEvent.locationX;
          if (trackWidth > 0) {
            const ratio = Math.max(0, Math.min(1, touchX / trackWidth));
            const val = Math.round(min + ratio * (max - min));
            startValRef.current = val;
            if (val !== currentValRef.current) {
              triggerHaptic();
              onChange(val);
            }
          }
        },
        onPanResponderMove: (_, gestureState) => {
          if (trackWidth > 0) {
            const deltaRatio = gestureState.dx / trackWidth;
            const rawVal = startValRef.current + deltaRatio * (max - min);
            const clamped = Math.round(Math.max(min, Math.min(max, rawVal)));
            if (clamped !== currentValRef.current) {
              triggerHaptic();
              onChange(clamped);
            }
          }
        }
      }),
    [trackWidth, min, max, onChange]
  );

  const percentage = Math.max(0, Math.min(100, ((seconds - min) / (max - min)) * 100));
  const ticks = [0, 5, 10, 15, 20];

  return (
    <View style={sliderStyles.container}>
      {/* Interactive Track Area */}
      <View
        style={sliderStyles.touchArea}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <View style={sliderStyles.trackBackground}>
          <View style={[sliderStyles.trackActive, { width: `${percentage}%` }]} />
        </View>

        {/* Draggable Thumb Indicator */}
        <View style={[sliderStyles.thumbWrapper, { left: `${percentage}%` }]}>
          <View style={sliderStyles.thumbGlow} />
          <View style={sliderStyles.thumbCore}>
            <View style={sliderStyles.thumbCenterDot} />
          </View>
        </View>
      </View>

      {/* Markers / Milestone Ticks below track */}
      <View style={sliderStyles.ticksRow}>
        {ticks.map((t) => {
          const isSelected = Math.round(seconds) === t;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => {
                triggerHaptic();
                onChange(t);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={sliderStyles.tickItem}
            >
              <View style={[sliderStyles.tickMark, isSelected && sliderStyles.tickMarkActive]} />
              <Text style={[sliderStyles.tickText, isSelected && sliderStyles.tickTextActive]}>
                {formatSecondsToMMSS(t)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

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
  const insets = useSafeAreaInsets();
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
    <View style={styles.container}>
      {/* Scrollable Configuration Form */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Arrow to the left of the title */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <TouchableOpacity
              style={styles.backArrowBtn}
              onPress={onBack}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={24} color="#ffffff" />
            </TouchableOpacity>
            <Text style={styles.title}>Video Customization</Text>
          </View>
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
          <Text style={styles.sectionTitle}>🎙️ Voice Actor</Text>
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

        {/* 4. Thumbnail Frame Selector (Slider from 00:00 to 00:20) */}
        <View style={styles.section}>
          <View style={styles.thumbHeader}>
            <Text style={styles.sectionTitle}>📸 Thumbnail Frame Time</Text>
            <View style={styles.thumbTimeBadge}>
              <Text style={styles.thumbTimeDisplay}>
                {formatSecondsToMMSS(thumbnailSeconds)}
              </Text>
            </View>
          </View>
          <Text style={styles.sectionSubtitle}>
            Slide or tap to choose the exact frame timestamp (00:00 to 00:20)
          </Text>

          <ThumbnailTimeSlider
            seconds={thumbnailSeconds}
            min={0}
            max={20}
            onChange={setThumbnailSeconds}
          />
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
      </ScrollView>

      {/* Sticky Bottom Bar with Back to Games on the left and Generate Video on the right */}
      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: Math.max(insets.bottom, 14)
          }
        ]}
      >
        <TouchableOpacity
          style={styles.bottomBackBtn}
          onPress={onBack}
          disabled={isLoading}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color="#94a3b8" style={{ marginRight: 4 }} />
          <Text style={styles.bottomBackBtnText}>Games</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.previewBtn, isLoading && styles.previewBtnDisabled]}
          onPress={handleStartGeneration}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator color="#020617" size="small" />
          ) : (
            <Text style={styles.previewBtnText}>Generate Video ✨</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const sliderStyles = StyleSheet.create({
  container: {
    paddingVertical: 8
  },
  touchArea: {
    height: 44,
    justifyContent: 'center',
    position: 'relative'
  },
  trackBackground: {
    height: 8,
    backgroundColor: '#1e293b',
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155'
  },
  trackActive: {
    height: '100%',
    backgroundColor: THEME.colors.primary,
    borderRadius: 4
  },
  thumbWrapper: {
    position: 'absolute',
    width: 28,
    height: 28,
    marginLeft: -14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  thumbGlow: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.25)'
  },
  thumbCore: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: THEME.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4
  },
  thumbCenterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.colors.primary
  },
  ticksRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 2
  },
  tickItem: {
    alignItems: 'center',
    paddingVertical: 4
  },
  tickMark: {
    width: 2,
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 1,
    marginBottom: 4
  },
  tickMarkActive: {
    backgroundColor: THEME.colors.primary,
    height: 8
  },
  tickText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b'
  },
  tickTextActive: {
    color: THEME.colors.primary,
    fontWeight: 'bold'
  }
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background
  },
  scrollArea: {
    flex: 1
  },
  content: {
    padding: 18,
    paddingBottom: 28
  },
  header: {
    marginBottom: 20
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4
  },
  backArrowBtn: {
    padding: 2,
    marginRight: 2,
    justifyContent: 'center',
    alignItems: 'center'
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: THEME.colors.textPrimary
  },
  subtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 2
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
    marginBottom: 6
  },
  sectionSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginBottom: 10
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
    alignItems: 'center',
    marginBottom: 4
  },
  thumbTimeBadge: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.colors.primary
  },
  thumbTimeDisplay: {
    fontSize: 16,
    fontWeight: '900',
    color: THEME.colors.primary,
    letterSpacing: 0.5
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
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#0a0f1d',
    borderTopWidth: 1,
    borderColor: '#1e293b',
    gap: 12
  },
  bottomBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#334155'
  },
  bottomBackBtnText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: 'bold'
  },
  previewBtn: {
    flex: 1,
    backgroundColor: THEME.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: THEME.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4
  },
  previewBtnDisabled: {
    opacity: 0.6
  },
  previewBtnText: {
    color: '#020617',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5
  }
});
