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

  const handleStartGeneration = () => {
    if (isScheduled && !isScheduleValid) {
      Alert.alert(
        'Invalid Scheduled Time',
        'A post cannot be created within 30 minutes of the current time. Please select a time at least 30 minutes in the future.'
      );
      return;
    }
    onPreview({
      backgroundVideo: selectedVideo,
      backgroundAudio: selectedAudio,
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
          <Text style={styles.thumbGuidanceText}>
            💡 Tip: Match cards appear between 00:05 and 00:25. If the time exceeds the video length, the last prediction card is used.
          </Text>
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
          onPress={onBack}
          disabled={isLoading}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color="#94a3b8" style={{ marginRight: 4 }} />
          <Text style={styles.bottomBackBtnText}>Games</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.previewBtn, (!isScheduleValid || isLoading) && styles.previewBtnDisabled]}
          onPress={handleStartGeneration}
          disabled={isLoading || !isScheduleValid}
          activeOpacity={0.8}
        >
          {isLoading ? (
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
  thumbGuidanceText: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 8,
    fontStyle: 'italic',
    lineHeight: 16
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
