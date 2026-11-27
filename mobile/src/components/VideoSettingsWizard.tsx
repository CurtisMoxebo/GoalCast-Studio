import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  PanResponder,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { THEME } from '../constants/theme';
import {
  DEFAULT_BACKGROUND_VIDEO,
  DEFAULT_BACKGROUND_AUDIO,
  DEFAULT_VOICE_ACTOR,
  DEFAULT_THUMBNAIL_TIMESTAMP,
  MIN_SCHEDULE_ADVANCE_MINUTES,
  DEFAULT_SCHEDULE_HOUR,
  DEFAULT_SCHEDULE_MINUTE
} from '../constants/config';
import { mobileApi } from '../services/api';
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

export const getDefaultScheduledDate = (now: Date = new Date()): Date => {
  const today19 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DEFAULT_SCHEDULE_HOUR, DEFAULT_SCHEDULE_MINUTE, 0, 0);
  const diffMinutes = (today19.getTime() - now.getTime()) / (1000 * 60);

  // If the current time is more than MIN_SCHEDULE_ADVANCE_MINUTES before scheduled hour today, default date is today.
  // Otherwise, default date is tomorrow.
  if (diffMinutes > MIN_SCHEDULE_ADVANCE_MINUTES) {
    return today19;
  } else {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, DEFAULT_SCHEDULE_HOUR, DEFAULT_SCHEDULE_MINUTE, 0, 0);
  }
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
  max = 60,
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
  const ticks = [0, 15, 30, 45, 60];

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

const BackgroundVideoPreviewPlayer: React.FC<{ uri: string; compact?: boolean }> = ({
  uri,
  compact = false
}) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });

  return (
    <View style={[styles.previewModalVideoWrap, compact && styles.previewModalVideoWrapCompact]}>
      <VideoView
        player={player}
        style={styles.previewModalVideo}
        nativeControls={true}
        contentFit="contain"
      />
    </View>
  );
};

const BackgroundAudioPreviewPlayer: React.FC<{
  uri: string;
  loop?: boolean;
  onEnded?: () => void;
}> = ({ uri, loop = true, onEnded }) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = loop;
    p.play();
  });

  React.useEffect(() => {
    if (!onEnded) return;
    const sub = player.addListener('playToEnd', () => {
      onEnded();
    });
    return () => {
      sub.remove();
    };
  }, [player, onEnded]);

  return null;
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
  const scrollViewRef = useRef<any>(null);
  const formattedDate = formatOrdinalDate(targetDate);
  const defaultDesc = `Football predictions for ${formattedDate} ⚽🔥\n#football #soccer #predictions #fyp`;

  const [selectedVideo, setSelectedVideo] = useState(
    availableVideos[0]?.filename || DEFAULT_BACKGROUND_VIDEO
  );
  const [selectedAudio, setSelectedAudio] = useState(
    availableAudio[0]?.filename || DEFAULT_BACKGROUND_AUDIO
  );
  const [selectedVoice, setSelectedVoice] = useState(DEFAULT_VOICE_ACTOR);
  const [thumbnailSeconds, setThumbnailSeconds] = useState(DEFAULT_THUMBNAIL_TIMESTAMP);
  const [description, setDescription] = useState(defaultDesc);
  const [activePicker, setActivePicker] = useState<'video' | 'audio' | 'voice' | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [previewingVideo, setPreviewingVideo] = useState<(MediaAsset & { localUri?: string }) | null>(null);
  const [previewingAudio, setPreviewingAudio] = useState<(MediaAsset & { localUri?: string }) | null>(null);
  const [previewingVoice, setPreviewingVoice] = useState<VoiceOption | null>(null);
  const [customVideo, setCustomVideo] = useState<{ uri: string; name: string; uploadedToken?: string } | null>(null);
  const [customAudio, setCustomAudio] = useState<{ uri: string; name: string; uploadedToken?: string } | null>(null);
  const [isUploadingCustom, setIsUploadingCustom] = useState(false);

  const selectedVideoAsset = useMemo(
    () =>
      availableVideos.find((v) => v.filename === selectedVideo) || {
        id: selectedVideo,
        filename: selectedVideo,
        name: selectedVideo,
        type: 'video' as const
      },
    [availableVideos, selectedVideo]
  );

  const selectedAudioAsset = useMemo(
    () =>
      availableAudio.find((a) => a.filename === selectedAudio) || {
        id: selectedAudio,
        filename: selectedAudio,
        name: selectedAudio,
        type: 'audio' as const
      },
    [availableAudio, selectedAudio]
  );

  const selectedVoiceOption = useMemo<VoiceOption>(
    () =>
      availableVoices.find((v) => v.id === selectedVoice) || {
        id: selectedVoice,
        name: selectedVoice,
        gender: 'female',
        accent: 'American',
        description: ''
      },
    [availableVoices, selectedVoice]
  );

  const filteredPickerItems = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (activePicker === 'voice') {
      if (!q) return availableVoices;
      return availableVoices.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.gender.toLowerCase().includes(q) ||
          (v.accent || '').toLowerCase().includes(q) ||
          (v.description || '').toLowerCase().includes(q)
      );
    }
    const source = activePicker === 'video' ? availableVideos : availableAudio;
    if (!q) return source;
    return source.filter(
      (item) =>
        item.name.toLowerCase().includes(q) || item.filename.toLowerCase().includes(q)
    );
  }, [activePicker, availableVideos, availableAudio, availableVoices, pickerSearch]);

  // Option to schedule the post or create it instantly
  const [isScheduled, setIsScheduled] = useState<boolean>(true);

  // Scheduled Post Time: Defaults to 19:00 (Today if > 30m before 19:00, or Tomorrow)
  const [scheduledDate, setScheduledDate] = useState<Date>(() => getDefaultScheduledDate());

  // Strict Validation: Must be strictly at least 30 minutes in the future if scheduled
  const diffMinutes = useMemo(() => {
    return (scheduledDate.getTime() - Date.now()) / (1000 * 60);
  }, [scheduledDate]);

  const isScheduleValid = !isScheduled || diffMinutes >= MIN_SCHEDULE_ADVANCE_MINUTES;

  // Next 10 days for rapid day picking
  const selectableDays = useMemo(() => {
    const list: { key: string; label: string; subLabel: string; date: Date }[] = [];
    const now = new Date();
    for (let i = 0; i < 10; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const isToday = i === 0;
      const isTomorrow = i === 1;
      const label = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short' });
      const subLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      list.push({ key: d.toISOString().split('T')[0], label, subLabel, date: d });
    }
    return list;
  }, []);

  const selectDay = (dayDate: Date) => {
    triggerHaptic();
    setScheduledDate((prev) => {
      const d = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), prev.getHours(), prev.getMinutes(), 0, 0);
      return d;
    });
  };

  const adjustMinutes = (delta: number) => {
    triggerHaptic();
    setScheduledDate((prev) => new Date(prev.getTime() + delta * 60 * 1000));
  };

  const adjustHours = (delta: number) => {
    triggerHaptic();
    setScheduledDate((prev) => new Date(prev.getTime() + delta * 60 * 60 * 1000));
  };

  const resetToDefaultSchedule = () => {
    triggerHaptic();
    setScheduledDate(getDefaultScheduledDate());
  };

  const handleBackPress = () => {
    setActivePicker(null);
    setPreviewingAudio(null);
    setPreviewingVideo(null);
    setPreviewingVoice(null);
    onBack();
  };

  const handleOpenPicker = (type: 'video' | 'audio' | 'voice') => {
    triggerHaptic();
    setPickerSearch('');
    setPreviewingAudio(null);
    setPreviewingVideo(null);
    setPreviewingVoice(null);
    setActivePicker(type);
  };

  const handleClosePicker = () => {
    setActivePicker(null);
    setPickerSearch('');
    setPreviewingAudio(null);
    setPreviewingVideo(null);
    setPreviewingVoice(null);
  };

  const handleOpenVideoPreview = (video: MediaAsset & { localUri?: string }) => {
    triggerHaptic();
    setPreviewingAudio(null);
    setPreviewingVoice(null);
    setPreviewingVideo((prev) => (prev?.filename === video.filename && activePicker === 'video' ? null : video));
  };

  const handleToggleAudioPreview = (audio: MediaAsset & { localUri?: string }) => {
    triggerHaptic();
    setPreviewingVideo(null);
    setPreviewingVoice(null);
    setPreviewingAudio((prev) => (prev?.filename === audio.filename ? null : audio));
  };

  const handleToggleVoicePreview = (voice: VoiceOption) => {
    triggerHaptic();
    setPreviewingVideo(null);
    setPreviewingAudio(null);
    setPreviewingVoice((prev) => (prev?.id === voice.id ? null : voice));
  };

  const handlePickCustomMedia = async (type: 'video' | 'audio') => {
    triggerHaptic();
    setPreviewingAudio(null);
    setPreviewingVideo(null);
    setPreviewingVoice(null);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: type === 'video' ? 'video/*' : 'audio/*',
        copyToCacheDirectory: true,
        multiple: false
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const picked = result.assets[0];
      const displayName = picked.name || (type === 'video' ? 'custom_video.mp4' : 'custom_audio.mp3');

      if (type === 'video') {
        setCustomVideo({ uri: picked.uri, name: displayName });
      } else {
        setCustomAudio({ uri: picked.uri, name: displayName });
      }
      setActivePicker(null);
      setPickerSearch('');
    } catch (err: any) {
      Alert.alert('File Picker Error', err?.message || `Could not pick custom ${type} file.`);
    }
  };

  const handleStartGeneration = async () => {
    setActivePicker(null);
    setPreviewingAudio(null);
    setPreviewingVideo(null);
    setPreviewingVoice(null);
    if (isScheduled && !isScheduleValid) {
      Alert.alert(
        'Invalid Scheduled Time',
        'A post cannot be created within 30 minutes of the current time. Please select a time at least 30 minutes in the future.'
      );
      return;
    }

    let finalVideo = selectedVideo;
    let finalAudio = selectedAudio;

    try {
      if (customVideo || customAudio) {
        setIsUploadingCustom(true);
      }

      if (customVideo) {
        if (customVideo.uploadedToken) {
          finalVideo = customVideo.uploadedToken;
        } else {
          const uploaded = await mobileApi.uploadCustomMedia(
            customVideo.uri,
            'video',
            customVideo.name
          );
          finalVideo = uploaded.token;
          setCustomVideo((prev) => (prev ? { ...prev, uploadedToken: uploaded.token } : null));
        }
      }

      if (customAudio) {
        if (customAudio.uploadedToken) {
          finalAudio = customAudio.uploadedToken;
        } else {
          const uploaded = await mobileApi.uploadCustomMedia(
            customAudio.uri,
            'audio',
            customAudio.name
          );
          finalAudio = uploaded.token;
          setCustomAudio((prev) => (prev ? { ...prev, uploadedToken: uploaded.token } : null));
        }
      }
    } catch (uploadErr: any) {
      Alert.alert(
        'Custom Media Upload Failed',
        uploadErr?.message || 'Could not upload your custom media file to the server.'
      );
      return;
    } finally {
      setIsUploadingCustom(false);
    }

    onPreview({
      backgroundVideo: finalVideo,
      backgroundAudio: finalAudio,
      voiceActor: selectedVoice,
      thumbnailTimestamp: thumbnailSeconds,
      description,
      scheduledPostTime: isScheduled ? scheduledDate.toISOString() : undefined
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Scrollable Configuration Form */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollArea}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
        keyboardDismissMode="interactive"
      >
        {/* Header with Arrow to the left of the title */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <TouchableOpacity
              style={styles.backArrowBtn}
              onPress={handleBackPress}
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

        {/* 1. Background Video Compact Selector (Opens Scrollable Picker Sheet or Custom Upload) */}
        <View style={styles.section}>
          <View style={styles.mediaSectionHeader}>
            <Text style={styles.sectionTitle}>🎬 Background Video</Text>
            <TouchableOpacity
              style={styles.customHeaderBtn}
              onPress={() => handlePickCustomMedia('video')}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Add custom background video"
            >
              <Ionicons name="add" size={20} color={THEME.colors.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.compactSelectorRow}>
            <TouchableOpacity
              style={[styles.compactSelectorMain, customVideo && styles.compactSelectorMainCustom]}
              onPress={() => handleOpenPicker('video')}
              activeOpacity={0.75}
            >
              <View style={styles.compactIconBox}>
                <Ionicons
                  name={customVideo ? 'cloud-upload' : 'videocam'}
                  size={20}
                  color={customVideo ? '#10b981' : THEME.colors.primary}
                />
              </View>
              <View style={styles.mediaListTextWrap}>
                <Text style={styles.mediaListName} numberOfLines={1}>
                  {customVideo ? customVideo.name : selectedVideoAsset.name}
                </Text>
                <Text style={styles.mediaListFilename} numberOfLines={1}>
                  {customVideo ? 'Custom file · This video only' : selectedVideoAsset.filename}
                </Text>
              </View>
              {customVideo ? (
                <TouchableOpacity
                  onPress={() => {
                    triggerHaptic();
                    setPreviewingVideo(null);
                    setCustomVideo(null);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ marginLeft: 8 }}
                >
                  <Ionicons name="close-circle" size={20} color="#94a3b8" />
                </TouchableOpacity>
              ) : (
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" style={{ marginLeft: 8 }} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.compactPreviewBtn}
              onPress={() =>
                handleOpenVideoPreview(
                  customVideo
                    ? {
                        id: customVideo.uri,
                        filename: customVideo.name,
                        name: customVideo.name,
                        localUri: customVideo.uri
                      }
                    : selectedVideoAsset
                )
              }
              activeOpacity={0.75}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="play-circle" size={20} color={THEME.colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. Background Audio Compact Selector (Opens Scrollable Picker Sheet or Custom Upload) */}
        <View style={styles.section}>
          <View style={styles.mediaSectionHeader}>
            <Text style={styles.sectionTitle}>🎵 Background Beat</Text>
            <TouchableOpacity
              style={styles.customHeaderBtn}
              onPress={() => handlePickCustomMedia('audio')}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Add custom background audio"
            >
              <Ionicons name="add" size={20} color={THEME.colors.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.compactSelectorRow}>
            <TouchableOpacity
              style={[styles.compactSelectorMain, customAudio && styles.compactSelectorMainCustom]}
              onPress={() => handleOpenPicker('audio')}
              activeOpacity={0.75}
            >
              <View style={styles.compactIconBox}>
                <Ionicons
                  name={customAudio ? 'cloud-upload' : 'musical-notes'}
                  size={20}
                  color={customAudio ? '#10b981' : THEME.colors.primary}
                />
              </View>
              <View style={styles.mediaListTextWrap}>
                <Text style={styles.mediaListName} numberOfLines={1}>
                  {customAudio ? customAudio.name : selectedAudioAsset.name}
                </Text>
                <Text style={styles.mediaListFilename} numberOfLines={1}>
                  {customAudio ? 'Custom file · This video only' : selectedAudioAsset.filename}
                </Text>
              </View>
              {customAudio ? (
                <TouchableOpacity
                  onPress={() => {
                    triggerHaptic();
                    setPreviewingAudio(null);
                    setCustomAudio(null);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ marginLeft: 8 }}
                >
                  <Ionicons name="close-circle" size={20} color="#94a3b8" />
                </TouchableOpacity>
              ) : (
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" style={{ marginLeft: 8 }} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.compactPreviewBtn,
                previewingAudio?.filename === (customAudio ? customAudio.name : selectedAudioAsset.filename) &&
                  activePicker === null &&
                  styles.mediaPreviewBtnActive
              ]}
              onPress={() =>
                handleToggleAudioPreview(
                  customAudio
                    ? {
                        id: customAudio.uri,
                        filename: customAudio.name,
                        name: customAudio.name,
                        localUri: customAudio.uri
                      }
                    : selectedAudioAsset
                )
              }
              activeOpacity={0.75}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons
                name={
                  previewingAudio?.filename === (customAudio ? customAudio.name : selectedAudioAsset.filename) &&
                  activePicker === null
                    ? 'stop-circle'
                    : 'play-circle'
                }
                size={20}
                color={
                  previewingAudio?.filename === (customAudio ? customAudio.name : selectedAudioAsset.filename) &&
                  activePicker === null
                    ? '#020617'
                    : THEME.colors.primary
                }
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* 3. Voice Actor Compact Selector (Opens Scrollable Picker Sheet) */}
        <View style={styles.section}>
          <View style={styles.mediaSectionHeader}>
            <Text style={styles.sectionTitle}>🎙️ Voice Actor</Text>
          </View>
          <View style={styles.compactSelectorRow}>
            <TouchableOpacity
              style={styles.compactSelectorMain}
              onPress={() => handleOpenPicker('voice')}
              activeOpacity={0.75}
            >
              <View style={styles.compactIconBox}>
                <Ionicons name="mic" size={20} color={THEME.colors.primary} />
              </View>
              <View style={styles.mediaListTextWrap}>
                <Text style={styles.mediaListName} numberOfLines={1}>
                  {selectedVoiceOption.name}
                </Text>
                <Text style={styles.mediaListFilename} numberOfLines={1}>
                  {selectedVoiceOption.gender} • {selectedVoiceOption.accent || 'US'}
                  {selectedVoiceOption.description ? ` • ${selectedVoiceOption.description}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" style={{ marginLeft: 8 }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.compactPreviewBtn,
                previewingVoice?.id === selectedVoiceOption.id &&
                  activePicker === null &&
                  styles.mediaPreviewBtnActive
              ]}
              onPress={() => handleToggleVoicePreview(selectedVoiceOption)}
              activeOpacity={0.75}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons
                name={
                  previewingVoice?.id === selectedVoiceOption.id && activePicker === null
                    ? 'stop-circle'
                    : 'play-circle'
                }
                size={20}
                color={
                  previewingVoice?.id === selectedVoiceOption.id && activePicker === null
                    ? '#020617'
                    : THEME.colors.primary
                }
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. Description Input Field */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📝 Caption & Description</Text>
          <TextInput
            style={styles.descInput}
            multiline
            numberOfLines={4}
            value={description}
            onChangeText={setDescription}
            onFocus={() => {
              setTimeout(() => {
                scrollViewRef.current?.scrollTo({ y: 320, animated: true });
              }, 180);
            }}
            placeholder="Enter video description with hashtags..."
            placeholderTextColor={THEME.colors.textMuted}
          />
        </View>

        {/* 5. Thumbnail Frame Selector (Slider from 0 to 60 seconds) */}
        <View style={styles.section}>
          <View style={styles.thumbHeader}>
            <Text style={styles.sectionTitle}>📸 Thumbnail Frame Time</Text>
            <View style={styles.thumbTimeBadge}>
              <Text style={styles.thumbTimeDisplay}>
                {formatSecondsToMMSS(thumbnailSeconds)} ({Math.round(thumbnailSeconds)}s)
              </Text>
            </View>
          </View>
          <Text style={styles.sectionSubtitle}>
            Slide or tap to choose the video timestamp (0 to 60s) that social media will use for the thumbnail
          </Text>

          <ThumbnailTimeSlider
            seconds={thumbnailSeconds}
            min={0}
            max={60}
            onChange={setThumbnailSeconds}
          />
        </View>

        {/* 6. Post Timing: Instant vs DateTime Picker */}
        <View style={styles.section}>
          <View style={styles.scheduleHeaderRow}>
            <Text style={styles.sectionTitle}>📅 Publishing Time &amp; Schedule</Text>
            {isScheduled ? (
              isScheduleValid ? (
                <View style={styles.validBadge}>
                  <Ionicons name="checkmark-circle" size={13} color="#10b981" style={{ marginRight: 4 }} />
                  <Text style={styles.validBadgeText}>Valid ({Math.round(diffMinutes)}m)</Text>
                </View>
              ) : (
                <View style={styles.invalidBadge}>
                  <Ionicons name="alert-circle" size={13} color="#ef4444" style={{ marginRight: 4 }} />
                  <Text style={styles.invalidBadgeText}>Must be ≥ 30m</Text>
                </View>
              )
            ) : (
              <View style={[styles.validBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Ionicons name="flash" size={13} color="#10b981" style={{ marginRight: 4 }} />
                <Text style={styles.validBadgeText}>Instant</Text>
              </View>
            )}
          </View>
          <Text style={styles.sectionSubtitle}>
            Choose whether to publish immediately upon approval or schedule for a specific date and time.
          </Text>

          {/* Schedule vs Instant Toggle Selector */}
          <View style={styles.modeToggleRow}>
            <TouchableOpacity
              style={[styles.modeToggleCard, isScheduled && styles.modeToggleCardActive]}
              onPress={() => {
                triggerHaptic();
                setIsScheduled(true);
              }}
              activeOpacity={0.8}
            >
              <View style={styles.modeToggleRadio}>
                {isScheduled && <View style={styles.modeToggleRadioInner} />}
              </View>
              <Ionicons
                name="calendar"
                size={20}
                color={isScheduled ? THEME.colors.primary : '#94a3b8'}
                style={{ marginRight: 8 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.modeToggleTitle, isScheduled && styles.modeToggleTitleActive]}>
                  Schedule
                </Text>
                <Text style={styles.modeToggleSub}>Pick future date &amp; time</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeToggleCard, !isScheduled && styles.modeToggleCardActiveInstant]}
              onPress={() => {
                triggerHaptic();
                setIsScheduled(false);
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.modeToggleRadio, !isScheduled && { borderColor: '#10b981' }]}>
                {!isScheduled && <View style={[styles.modeToggleRadioInner, { backgroundColor: '#10b981' }]} />}
              </View>
              <Ionicons
                name="flash"
                size={20}
                color={!isScheduled ? '#10b981' : '#94a3b8'}
                style={{ marginRight: 8 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.modeToggleTitle, !isScheduled && { color: '#10b981' }]}>
                  Instant
                </Text>
                <Text style={styles.modeToggleSub}>Create &amp; publish now</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* If Instant Selected */}
          {!isScheduled && (
            <View style={styles.instantNoticeCard}>
              <Ionicons name="flash-outline" size={24} color="#10b981" style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.instantNoticeTitle}>Instant Post Selected ⚡</Text>
                <Text style={styles.instantNoticeText}>
                  Your video will be queued and published immediately to YouTube Shorts, Facebook Reels, Instagram Reels &amp; TikTok once you click Accept.
                </Text>
              </View>
            </View>
          )}

          {/* If Schedule Selected: DateTimePicker Component */}
          {isScheduled && (
            <View style={styles.dateTimePickerContainer}>
              {/* 1. Date Picker Row */}
              <Text style={styles.pickerSectionLabel}>📅 Select Date:</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.daysScrollList}
              >
                {selectableDays.map((d) => {
                  const isSelected =
                    scheduledDate.getFullYear() === d.date.getFullYear() &&
                    scheduledDate.getMonth() === d.date.getMonth() &&
                    scheduledDate.getDate() === d.date.getDate();

                  return (
                    <TouchableOpacity
                      key={d.key}
                      style={[styles.dayCard, isSelected && styles.dayCardActive]}
                      onPress={() => selectDay(d.date)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dayCardLabel, isSelected && styles.dayCardLabelActive]}>
                        {d.label}
                      </Text>
                      <Text style={[styles.dayCardSub, isSelected && styles.dayCardSubActive]}>
                        {d.subLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* 2. Time Picker Row (Default 19:00) */}
              <View style={styles.timePickerHeaderRow}>
                <Text style={styles.pickerSectionLabel}>🕒 Select Time (Default 19:00):</Text>
                <TouchableOpacity onPress={resetToDefaultSchedule} style={styles.defaultTimeChip}>
                  <Ionicons name="star" size={12} color={THEME.colors.primary} style={{ marginRight: 4 }} />
                  <Text style={styles.defaultTimeChipText}>Default (19:00)</Text>
                </TouchableOpacity>
              </View>

              {/* Digital Time Dial Display with Steppers */}
              <View style={styles.digitalClockWrap}>
                {/* Hour Box */}
                <View style={styles.clockUnitCol}>
                  <Text style={styles.clockUnitLabel}>HOUR</Text>
                  <View style={styles.clockStepperRow}>
                    <TouchableOpacity
                      style={styles.stepperArrow}
                      onPress={() => adjustHours(-1)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="chevron-down" size={20} color="#94a3b8" />
                    </TouchableOpacity>
                    <View style={styles.clockBox}>
                      <Text style={styles.clockBoxText}>
                        {String(scheduledDate.getHours()).padStart(2, '0')}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.stepperArrow}
                      onPress={() => adjustHours(1)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="chevron-up" size={20} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Separator */}
                <Text style={styles.clockColon}>:</Text>

                {/* Minute Box */}
                <View style={styles.clockUnitCol}>
                  <Text style={styles.clockUnitLabel}>MINUTE</Text>
                  <View style={styles.clockStepperRow}>
                    <TouchableOpacity
                      style={styles.stepperArrow}
                      onPress={() => adjustMinutes(-15)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="chevron-down" size={20} color="#94a3b8" />
                    </TouchableOpacity>
                    <View style={styles.clockBox}>
                      <Text style={styles.clockBoxText}>
                        {String(scheduledDate.getMinutes()).padStart(2, '0')}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.stepperArrow}
                      onPress={() => adjustMinutes(15)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="chevron-up" size={20} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 12-hour AM/PM indicator */}
                <View style={styles.ampmBadge}>
                  <Text style={styles.ampmBadgeText}>
                    {scheduledDate.getHours() >= 12 ? 'PM' : 'AM'}
                  </Text>
                  <Text style={styles.ampmSubText}>
                    {scheduledDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
              </View>

              {/* 30-min validation error banner */}
              {!isScheduleValid && (
                <View style={styles.warningBanner}>
                  <Ionicons name="warning" size={18} color="#ef4444" style={{ marginRight: 8 }} />
                  <Text style={styles.warningBannerText}>
                    A post cannot be created within 30 mins of the current time. Please select a time at least 30 minutes in the future.
                  </Text>
                </View>
              )}
            </View>
          )}
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
          onPress={handleBackPress}
          disabled={isLoading}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color="#94a3b8" style={{ marginRight: 4 }} />
          <Text style={styles.bottomBackBtnText}>Games</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.previewBtn,
            (!isScheduleValid || isLoading || isUploadingCustom) && styles.previewBtnDisabled
          ]}
          onPress={handleStartGeneration}
          disabled={isLoading || isUploadingCustom || !isScheduleValid}
          activeOpacity={0.8}
        >
          {isUploadingCustom ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator color="#020617" size="small" />
              <Text style={styles.previewBtnText}>Uploading custom media...</Text>
            </View>
          ) : isLoading ? (
            <ActivityIndicator color="#020617" size="small" />
          ) : !isScheduleValid ? (
            <Text style={styles.previewBtnText}>Must be ≥ 30m in future ⚠️</Text>
          ) : isScheduled ? (
            <Text style={styles.previewBtnText}>Generate &amp; Schedule 📅</Text>
          ) : (
            <Text style={styles.previewBtnText}>Generate &amp; Post Instantly ⚡</Text>
          )}
        </TouchableOpacity>
      </View>
      {/* Inline Background Audio Preview Player */}
      {previewingAudio && (
        <BackgroundAudioPreviewPlayer
          key={`audio_${previewingAudio.localUri || previewingAudio.filename}`}
          uri={previewingAudio.localUri || mobileApi.getMediaAssetUrl(previewingAudio.filename)}
          loop={true}
        />
      )}

      {/* Inline Voice Actor Preview Player (plays first intro sentence once) */}
      {previewingVoice && (
        <BackgroundAudioPreviewPlayer
          key={`voice_${previewingVoice.id}`}
          uri={mobileApi.getVoicePreviewUrl(previewingVoice.id)}
          loop={false}
          onEnded={() => setPreviewingVoice(null)}
        />
      )}

      {/* Scrollable Media Picker Bottom Sheet (Scales cleanly to any number of videos/audios/voices) */}
      <Modal
        visible={activePicker !== null}
        transparent={true}
        animationType="slide"
        onRequestClose={handleClosePicker}
      >
        <View style={styles.pickerSheetOverlay}>
          <TouchableOpacity
            style={styles.pickerSheetBackdrop}
            activeOpacity={1}
            onPress={handleClosePicker}
          />
          <View style={[styles.pickerSheetCard, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.pickerSheetHandle} />

            {/* Sheet Header */}
            <View style={styles.previewModalHeader}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.previewModalTitle}>
                  {activePicker === 'video'
                    ? '🎬 Select Background Video'
                    : activePicker === 'audio'
                      ? '🎵 Select Background Beat'
                      : '🎙️ Select Voice Actor'}
                </Text>
                <Text style={styles.previewModalSubtitle}>
                  {(activePicker === 'video'
                    ? availableVideos
                    : activePicker === 'audio'
                      ? availableAudio
                      : availableVoices
                  ).length}{' '}
                  items • Tap Preview to audition
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleClosePicker}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Search Filter */}
            <View style={styles.pickerSearchWrap}>
              <Ionicons name="search" size={16} color="#64748b" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.pickerSearchInput}
                value={pickerSearch}
                onChangeText={setPickerSearch}
                placeholder={`Search ${
                  activePicker === 'video'
                    ? 'videos'
                    : activePicker === 'audio'
                      ? 'audio tracks'
                      : 'voice actors'
                }...`}
                placeholderTextColor="#64748b"
                autoCorrect={false}
              />
              {pickerSearch.length > 0 && (
                <TouchableOpacity onPress={() => setPickerSearch('')}>
                  <Ionicons name="close-circle" size={18} color="#64748b" />
                </TouchableOpacity>
              )}
            </View>

            {/* One-Time Custom Upload Action inside Video/Audio Picker Sheet */}
            {(activePicker === 'video' || activePicker === 'audio') && (
              <TouchableOpacity
                style={styles.sheetCustomUploadBtn}
                onPress={() => handlePickCustomMedia(activePicker)}
                activeOpacity={0.8}
              >
                <Ionicons name="cloud-upload-outline" size={18} color="#10b981" style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetCustomUploadTitle}>
                    {activePicker === 'video'
                      ? 'Choose Custom Video from Device'
                      : 'Choose Custom Audio from Device'}
                  </Text>
                  <Text style={styles.sheetCustomUploadSub}>
                    Used only for this generated video (not saved to library)
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#10b981" />
              </TouchableOpacity>
            )}

            {/* Embedded Live Video Preview Stage (when previewing a video inside the sheet) */}
            {activePicker === 'video' && previewingVideo && (
              <View style={styles.sheetVideoStage}>
                <View style={styles.sheetVideoStageHeader}>
                  <Text style={styles.sheetVideoStageLabel} numberOfLines={1}>
                    Previewing: {previewingVideo.name}
                  </Text>
                  <TouchableOpacity onPress={() => setPreviewingVideo(null)}>
                    <Text style={styles.sheetVideoHideText}>Hide</Text>
                  </TouchableOpacity>
                </View>
                <BackgroundVideoPreviewPlayer
                  key={previewingVideo.filename}
                  uri={mobileApi.getMediaAssetUrl(previewingVideo.filename)}
                  compact={true}
                />
              </View>
            )}

            {/* Scrollable Media / Voice List */}
            <ScrollView
              style={styles.pickerSheetScroll}
              contentContainerStyle={styles.mediaList}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {filteredPickerItems.length === 0 ? (
                <Text style={styles.pickerEmptyText}>No matching items found.</Text>
              ) : activePicker === 'voice' ? (
                (filteredPickerItems as VoiceOption[]).map((voice) => {
                  const isSelected = selectedVoice === voice.id;
                  const isPreviewing = previewingVoice?.id === voice.id;

                  return (
                    <View
                      key={voice.id}
                      style={[styles.mediaListRow, isSelected && styles.mediaListRowSelected]}
                    >
                      <TouchableOpacity
                        style={styles.mediaListSelectArea}
                        onPress={() => {
                          triggerHaptic();
                          setSelectedVoice(voice.id);
                          handleClosePicker();
                        }}
                        activeOpacity={0.75}
                      >
                        <View style={[styles.mediaRadio, isSelected && styles.mediaRadioSelected]}>
                          {isSelected && <Ionicons name="checkmark" size={13} color="#020617" />}
                        </View>
                        <View style={styles.mediaListTextWrap}>
                          <Text
                            style={[styles.mediaListName, isSelected && styles.mediaListNameSelected]}
                            numberOfLines={1}
                          >
                            {voice.name}
                          </Text>
                          <Text style={styles.mediaListFilename} numberOfLines={1}>
                            {voice.gender} • {voice.accent || 'US'}
                            {voice.description ? ` • ${voice.description}` : ''}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.mediaPreviewBtn, isPreviewing && styles.mediaPreviewBtnActive]}
                        onPress={() => handleToggleVoicePreview(voice)}
                        activeOpacity={0.75}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        accessibilityLabel={isPreviewing ? 'Stop voice preview' : 'Preview voice'}
                      >
                        <Ionicons
                          name={isPreviewing ? 'stop-circle' : 'play-circle-outline'}
                          size={20}
                          color={isPreviewing ? '#020617' : THEME.colors.primary}
                        />
                      </TouchableOpacity>
                    </View>
                  );
                })
              ) : (
                (filteredPickerItems as MediaAsset[]).map((item) => {
                  const isVideo = activePicker === 'video';
                  const isSelected = isVideo
                    ? selectedVideo === item.filename
                    : selectedAudio === item.filename;
                  const isPreviewing = isVideo
                    ? previewingVideo?.filename === item.filename
                    : previewingAudio?.filename === item.filename;

                  return (
                    <View
                      key={item.id}
                      style={[styles.mediaListRow, isSelected && styles.mediaListRowSelected]}
                    >
                      <TouchableOpacity
                        style={styles.mediaListSelectArea}
                        onPress={() => {
                          triggerHaptic();
                          if (isVideo) {
                            setCustomVideo(null);
                            setSelectedVideo(item.filename);
                          } else {
                            setCustomAudio(null);
                            setSelectedAudio(item.filename);
                          }
                          handleClosePicker();
                        }}
                        activeOpacity={0.75}
                      >
                        <View style={[styles.mediaRadio, isSelected && styles.mediaRadioSelected]}>
                          {isSelected && <Ionicons name="checkmark" size={13} color="#020617" />}
                        </View>
                        <View style={styles.mediaListTextWrap}>
                          <Text
                            style={[styles.mediaListName, isSelected && styles.mediaListNameSelected]}
                            numberOfLines={1}
                          >
                            {item.name}
                          </Text>
                          <Text style={styles.mediaListFilename} numberOfLines={1}>
                            {item.filename}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.mediaPreviewBtn, isPreviewing && styles.mediaPreviewBtnActive]}
                        onPress={() =>
                          isVideo ? handleOpenVideoPreview(item) : handleToggleAudioPreview(item)
                        }
                        activeOpacity={0.75}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        accessibilityLabel={isPreviewing ? 'Stop preview' : 'Preview'}
                      >
                        <Ionicons
                          name={isPreviewing ? 'stop-circle' : 'play-circle-outline'}
                          size={20}
                          color={isPreviewing ? '#020617' : THEME.colors.primary}
                        />
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Quick Standalone Background Video Preview Modal (when triggered directly from main screen) */}
      <Modal
        visible={previewingVideo !== null && activePicker === null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPreviewingVideo(null)}
      >
        <View style={styles.previewModalOverlay}>
          <View style={styles.previewModalCard}>
            <View style={styles.previewModalHeader}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.previewModalTitle} numberOfLines={1}>
                  {previewingVideo?.name || 'Video Preview'}
                </Text>
                <Text style={styles.previewModalSubtitle} numberOfLines={1}>
                  {previewingVideo?.filename}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setPreviewingVideo(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {previewingVideo && (
              <BackgroundVideoPreviewPlayer
                key={previewingVideo.localUri || previewingVideo.filename}
                uri={previewingVideo.localUri || mobileApi.getMediaAssetUrl(previewingVideo.filename)}
              />
            )}

            <View style={styles.previewModalActions}>
              <TouchableOpacity
                style={styles.previewModalCloseBtn}
                onPress={() => setPreviewingVideo(null)}
              >
                <Text style={styles.previewModalCloseBtnText}>Close</Text>
              </TouchableOpacity>

              {previewingVideo && (
                <TouchableOpacity
                  style={styles.previewModalUseBtn}
                  onPress={() => {
                    triggerHaptic();
                    if (!previewingVideo.localUri) {
                      setCustomVideo(null);
                      setSelectedVideo(previewingVideo.filename);
                    }
                    setPreviewingVideo(null);
                  }}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#020617" style={{ marginRight: 6 }} />
                  <Text style={styles.previewModalUseBtnText}>Use This Video</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
    paddingBottom: 60
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
  mediaSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  customHeaderBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center'
  },
  compactSelectorMainCustom: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)'
  },
  sheetCustomUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12
  },
  sheetCustomUploadTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#34d399'
  },
  sheetCustomUploadSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1
  },
  compactSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  compactSelectorMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.35)'
  },
  compactIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(14, 165, 233, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  compactPreviewBtn: {
    width: 46,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.45)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  pickerSheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2, 6, 23, 0.78)'
  },
  pickerSheetBackdrop: {
    flex: 1
  },
  pickerSheetCard: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    maxHeight: '82%',
    borderTopWidth: 1,
    borderColor: '#334155'
  },
  pickerSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#475569',
    alignSelf: 'center',
    marginBottom: 12
  },
  pickerSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155'
  },
  pickerSearchInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 14,
    padding: 0
  },
  sheetVideoStage: {
    marginBottom: 12
  },
  sheetVideoStageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  sheetVideoStageLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.primary,
    flex: 1,
    marginRight: 8
  },
  sheetVideoHideText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8'
  },
  pickerSheetScroll: {
    maxHeight: 360
  },
  pickerEmptyText: {
    textAlign: 'center',
    color: '#64748b',
    paddingVertical: 24,
    fontSize: 14
  },
  mediaList: {
    marginTop: 6,
    gap: 8
  },
  mediaListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#334155'
  },
  mediaListRowSelected: {
    borderColor: THEME.colors.primary,
    backgroundColor: 'rgba(14, 165, 233, 0.12)'
  },
  mediaListSelectArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10
  },
  mediaRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#64748b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  mediaRadioSelected: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary
  },
  mediaListTextWrap: {
    flex: 1
  },
  mediaListName: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary
  },
  mediaListNameSelected: {
    color: THEME.colors.primary
  },
  mediaListFilename: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 2
  },
  mediaPreviewBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.45)',
    borderRadius: 10
  },
  mediaPreviewBtnActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary
  },
  previewModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18
  },
  previewModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155'
  },
  previewModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  previewModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#f8fafc'
  },
  previewModalSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2
  },
  previewModalVideoWrap: {
    width: '100%',
    height: 360,
    backgroundColor: '#020617',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 14
  },
  previewModalVideoWrapCompact: {
    height: 220,
    marginBottom: 4
  },
  previewModalVideo: {
    width: '100%',
    height: '100%'
  },
  previewModalActions: {
    flexDirection: 'row',
    gap: 10
  },
  previewModalCloseBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  previewModalCloseBtnText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '700'
  },
  previewModalUseBtn: {
    flex: 1.5,
    flexDirection: 'row',
    backgroundColor: THEME.colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  previewModalUseBtnText: {
    color: '#020617',
    fontSize: 14,
    fontWeight: '800'
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
  },
  scheduleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  validBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  validBadgeText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '700'
  },
  invalidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)'
  },
  invalidBadgeText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '700'
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    marginBottom: 12
  },
  warningBannerText: {
    color: '#fca5a5',
    fontSize: 12,
    flex: 1,
    lineHeight: 16
  },
  presetLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    marginBottom: 8
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12
  },
  presetChip: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#334155'
  },
  presetChipText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600'
  },
  adjustRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8
  },
  adjustBtn: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155'
  },
  adjustBtnText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700'
  },
  modeToggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14
  },
  modeToggleCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#334155'
  },
  modeToggleCardActive: {
    borderColor: THEME.colors.primary,
    backgroundColor: 'rgba(234, 179, 8, 0.08)'
  },
  modeToggleCardActiveInstant: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.08)'
  },
  modeToggleRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#64748b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8
  },
  modeToggleRadioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: THEME.colors.primary
  },
  modeToggleTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#94a3b8'
  },
  modeToggleTitleActive: {
    color: THEME.colors.primary
  },
  modeToggleSub: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 1
  },
  instantNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    marginBottom: 10
  },
  instantNoticeTitle: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2
  },
  instantNoticeText: {
    color: '#a7f3d0',
    fontSize: 12,
    lineHeight: 16
  },
  dateTimePickerContainer: {
    marginTop: 4
  },
  pickerSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#cbd5e1',
    marginBottom: 8,
    marginTop: 6
  },
  daysScrollList: {
    gap: 8,
    paddingBottom: 6
  },
  dayCard: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    minWidth: 70,
    borderWidth: 1,
    borderColor: '#334155'
  },
  dayCardActive: {
    borderColor: THEME.colors.primary,
    backgroundColor: 'rgba(234, 179, 8, 0.12)'
  },
  dayCardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8'
  },
  dayCardLabelActive: {
    color: THEME.colors.primary
  },
  dayCardSub: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2
  },
  dayCardSubActive: {
    color: '#f8fafc',
    fontWeight: '600'
  },
  timePickerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10
  },
  defaultTimeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(234, 179, 8, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  defaultTimeChipText: {
    color: THEME.colors.primary,
    fontSize: 11,
    fontWeight: '700'
  },
  digitalClockWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginVertical: 10
  },
  clockUnitCol: {
    alignItems: 'center'
  },
  clockUnitLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 1,
    marginBottom: 4
  },
  clockStepperRow: {
    alignItems: 'center',
    gap: 4
  },
  stepperArrow: {
    padding: 2
  },
  clockBox: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 54,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#475569'
  },
  clockBoxText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#f8fafc',
    fontVariant: ['tabular-nums']
  },
  clockColon: {
    fontSize: 26,
    fontWeight: '900',
    color: THEME.colors.primary,
    marginHorizontal: 10,
    marginTop: 14
  },
  ampmBadge: {
    marginLeft: 16,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 14,
    borderLeftWidth: 1,
    borderColor: '#334155'
  },
  ampmBadgeText: {
    fontSize: 16,
    fontWeight: '900',
    color: THEME.colors.primary
  },
  ampmSubText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
    marginTop: 2
  }
});
