import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { THEME } from '../constants/theme';
import * as FileSystem from 'expo-file-system/legacy';
import { mobileApi } from '../services/api';
import { deviceStorage } from '../services/deviceStorage';
import { sessionStore } from '../services/sessionStore';
import {
  shareToSocialMedia,
  sharePredictionVideo,
  SOCIAL_PLATFORMS,
  SocialPlatform
} from '../services/socialShare';

const { width, height } = Dimensions.get('window');

const SOCIAL_ICONS: Record<SocialPlatform, any> = {
  facebook: require('../../assets/icons/facebook.png'),
  instagram: require('../../assets/icons/instagram.png'),
  tiktok: require('../../assets/icons/tiktok.png'),
  youtube: require('../../assets/icons/youtube.png')
};

export interface SocialPlatformConfig {
  id: string;
  name: string;
  subtitle: string;
  icon: any;
  color: string;
}

export const AVAILABLE_SOCIAL_PLATFORMS: SocialPlatformConfig[] = [
  {
    id: 'facebook_reels',
    name: 'Facebook Reels',
    subtitle: 'Page Reel · Auto-publish & share to feed',
    icon: SOCIAL_ICONS.facebook,
    color: '#1877F2'
  },
  {
    id: 'instagram_reels',
    name: 'Instagram Reels',
    subtitle: 'Professional account · Reel container',
    icon: SOCIAL_ICONS.instagram,
    color: '#E1306C'
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    subtitle: 'Direct post video feed · Public',
    icon: SOCIAL_ICONS.tiktok,
    color: '#000000'
  },
  {
    id: 'youtube_shorts',
    name: 'YouTube Shorts',
    subtitle: '#Shorts upload · Custom thumbnail timeframe',
    icon: SOCIAL_ICONS.youtube,
    color: '#FF0000'
  }
];

const VideoPlayerComponent: React.FC<{ videoUri: string }> = ({ videoUri }) => {
  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = true;
    p.play();
  });

  return (
    <View style={styles.videoPlayerWrapper}>
      <VideoView
        player={player}
        style={styles.videoPlayer}
        nativeControls={true}
        contentFit="contain"
      />
    </View>
  );
};

interface PreviewModalProps {
  visible: boolean;
  jobId: string | null;
  groupId: string | null;
  description: string;
  thumbnailTimestamp: number;
  scheduledPostTime?: string;
  onModify: () => void;
  onCancelled: () => void;
  onAccepted: () => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({
  visible,
  jobId,
  groupId,
  description,
  thumbnailTimestamp,
  scheduledPostTime,
  onModify,
  onCancelled,
  onAccepted
}) => {
  const [progressPercent, setProgressPercent] = useState(5);
  const [progressMessage, setProgressMessage] = useState('Initiating video rendering...');
  const [isRendering, setIsRendering] = useState(true);
  const [localVideoUri, setLocalVideoUri] = useState<string | null>(null);
  const [isAccepted, setIsAccepted] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Social Platform Selection & Pipeline State
  // By default, they should all be selected
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    'facebook_reels',
    'instagram_reels',
    'tiktok',
    'youtube_shorts'
  ]);
  const [isPlatformPickerVisible, setIsPlatformPickerVisible] = useState(false);
  const [isPipelineModalVisible, setIsPipelineModalVisible] = useState(false);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const [pipelineSummary, setPipelineSummary] = useState<string | null>(null);
  const [pipelineItems, setPipelineItems] = useState<Array<{
    platform: string;
    name: string;
    icon: any;
    color: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED' | 'SIMULATED';
    isSimulated?: boolean;
    warning?: string;
    remotePostId?: string;
    remoteUrl?: string;
    error?: string;
  }>>([
    { platform: 'facebook_reels', name: 'Facebook Reels', icon: SOCIAL_ICONS.facebook, color: '#1877F2', status: 'PENDING' },
    { platform: 'instagram_reels', name: 'Instagram Reels', icon: SOCIAL_ICONS.instagram, color: '#E1306C', status: 'PENDING' },
    { platform: 'tiktok', name: 'TikTok', icon: SOCIAL_ICONS.tiktok, color: '#000000', status: 'PENDING' },
    { platform: 'youtube_shorts', name: 'YouTube Shorts', icon: SOCIAL_ICONS.youtube, color: '#FF0000', status: 'PENDING' }
  ]);

  const togglePlatform = (platformId: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platformId)
        ? prev.filter((id) => id !== platformId)
        : [...prev, platformId]
    );
  };

  // Poll video rendering progress
  useEffect(() => {
    if (!visible || !jobId) return;

    setIsRendering(true);
    setIsAccepted(false);
    setLocalVideoUri(null);

    let isMounted = true;
    let pollInterval: NodeJS.Timeout;

    const poll = async () => {
      try {
        const job = await mobileApi.getJobProgress(jobId);
        if (!isMounted) return;

        setProgressPercent(job.percent || 10);
        setProgressMessage(job.message || 'Processing...');

        if (job.status === 'COMPLETED') {
          clearInterval(pollInterval);
          setProgressMessage('Downloading video to device storage...');

          // Save video directly to user's device storage under groupId and jobId
          const downloadUrl = mobileApi.getVideoDownloadUrl(jobId);
          const primaryFilename = groupId ? `goalcast_${groupId}.mp4` : `goalcast_${jobId}.mp4`;
          const localUri = await deviceStorage.saveVideoToDevice(downloadUrl, primaryFilename);

          if (groupId && jobId && groupId !== jobId) {
            try {
              const jobDestination = deviceStorage.getVideoUri(`goalcast_${jobId}.mp4`);
              await FileSystem.copyAsync({ from: localUri, to: jobDestination });
            } catch (copyErr) {
              console.warn('[PreviewModal] Could not copy video to jobId destination:', copyErr);
            }
          }

          if (isMounted) {
            setLocalVideoUri(localUri);
            setIsRendering(false);
          }
        } else if (job.status === 'FAILED') {
          clearInterval(pollInterval);
          if (isMounted) {
            setIsRendering(false);
            Alert.alert('Render Failed', job.error || 'Video rendering failed');
          }
        }
      } catch (err: any) {
        console.warn('[PreviewModal] Polling error:', err);
      }
    };

    poll();
    pollInterval = setInterval(poll, 2000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [visible, jobId]);

  // Cancel Handler
  const handleCancelPress = () => {
    Alert.alert(
      'Cancel Preview',
      'Are you sure you want to cancel? Every change will be discarded and the saved video will be deleted.',
      [
        { text: 'Keep Editing', style: 'cancel' },
        {
          text: 'Yes, Discard All',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsProcessingAction(true);
              if (groupId) {
                await mobileApi.updatePredictionStatus(groupId, 'CANCELLED');
              }
              if (localVideoUri) {
                await deviceStorage.deleteVideoFromDevice(localVideoUri);
              }
            } catch (e) {
              console.warn('Error during cancellation:', e);
            } finally {
              setIsProcessingAction(false);
              onCancelled();
            }
          }
        }
      ]
    );
  };

  // Modify Handler
  const handleModifyPress = () => {
    onModify();
  };

  // Accept Handler
  const handleAcceptPress = async () => {
    try {
      setIsProcessingAction(true);
      if (groupId) {
        await mobileApi.updatePredictionStatus(groupId, 'ACCEPTED');
        sessionStore.invalidateHistory();
      }
      setIsAccepted(true);
      onAccepted();
    } catch (e: any) {
      Alert.alert('Error', `Could not accept prediction: ${e?.message}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // General Share Handler (Native Share Sheet with video & description)
  const handleGeneralShare = async () => {
    if (!localVideoUri) return;
    try {
      await sharePredictionVideo({
        videoUri: localVideoUri,
        description,
        thumbnailTimestamp
      });
    } catch (err: any) {
      console.warn('[PreviewModal] Error sharing video:', err);
    }
  };

  // Download Video Handler (Saves directly to device Gallery / Camera Roll)
  const handleDownloadVideo = async () => {
    if (!localVideoUri) return;
    try {
      const { Platform, ToastAndroid, Alert } = await import('react-native');
      const MediaLibrary = await import('expo-media-library');

      // Request media library permission
      const { status } = await MediaLibrary.requestPermissionsAsync();

      if (status === 'granted') {
        const asset = await MediaLibrary.createAssetAsync(localVideoUri);

        try {
          const album = await MediaLibrary.getAlbumAsync('GoalCast Studio');
          if (album == null) {
            await MediaLibrary.createAlbumAsync('GoalCast Studio', asset, false);
          } else {
            await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
          }
        } catch (albumErr) {
          // Album creation fallback - asset is already created in main gallery
          console.warn('[PreviewModal] Album organization fallback:', albumErr);
        }

        if (Platform.OS === 'android') {
          try {
            ToastAndroid.show('✅ Video saved to your Gallery!', ToastAndroid.LONG);
          } catch { }
        }
        Alert.alert(
          '✅ Video Saved',
          'The video has been saved directly to your phone’s Photos / Gallery in the "GoalCast Studio" album!'
        );
      } else {
        // Fallback to sharing / file save dialog if permission denied
        const Sharing = await import('expo-sharing');
        const isAvailable = await Sharing.isAvailableAsync().catch(() => false);
        if (isAvailable) {
          await Sharing.shareAsync(localVideoUri, {
            mimeType: 'video/mp4',
            dialogTitle: 'Save Video to Device',
            UTI: 'public.movie'
          });
        } else {
          Alert.alert(
            'Permission Required',
            'Storage permission is required to save videos directly to your device gallery.'
          );
        }
      }
    } catch (err: any) {
      console.warn('[PreviewModal] Error downloading video:', err);
      // Graceful fallback to native share
      try {
        const Sharing = await import('expo-sharing');
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(localVideoUri, {
            mimeType: 'video/mp4',
            dialogTitle: 'Save Video',
            UTI: 'public.movie'
          });
        }
      } catch (fallbackErr) {
        Alert.alert('Download Error', `Could not save video: ${err?.message || 'Unknown error'}`);
      }
    }
  };

  // Social Share Handler (Fallback direct platform share)
  const handleShare = async (platform: SocialPlatform) => {
    if (!localVideoUri) return;
    await shareToSocialMedia(platform, {
      videoUri: localVideoUri,
      description,
      thumbnailTimestamp
    });
  };

  // Schedule or Publish Selected Social Media Handler
  const handleScheduleAll = async (platformsToRun: string[] = selectedPlatforms) => {
    const targetGroupId = groupId || jobId;
    if (!targetGroupId) {
      Alert.alert('Error', 'No prediction group ID found to schedule.');
      return;
    }

    if (!platformsToRun || platformsToRun.length === 0) {
      Alert.alert('No Platform Selected', 'Please select at least one social media platform to publish to.');
      return;
    }

    const isInstant = !scheduledPostTime;

    // Reset pipeline state strictly for selected platforms
    const initialItems = AVAILABLE_SOCIAL_PLATFORMS
      .filter((p) => platformsToRun.includes(p.id))
      .map((p, idx) => ({
        platform: p.id,
        name: p.name,
        icon: p.icon,
        color: p.color,
        status: idx === 0 ? ('IN_PROGRESS' as const) : ('PENDING' as const)
      }));

    setPipelineItems(initialItems);
    setPipelineSummary(null);
    setIsPipelineModalVisible(true);
    setIsPipelineRunning(true);

    try {
      // Execute each selected social platform step-by-step
      for (let i = 0; i < platformsToRun.length; i++) {
        const currentPlatform = platformsToRun[i];

        // 1. Visually mark current platform as IN_PROGRESS with spinner
        setPipelineItems((prev) =>
          prev.map((item) =>
            item.platform === currentPlatform
              ? { ...item, status: 'IN_PROGRESS' }
              : item
          )
        );

        // 2. Dispatch request for this specific platform
        try {
          const res = await mobileApi.scheduleSocialPost({
            groupId: targetGroupId,
            scheduledPostTime: scheduledPostTime || undefined,
            isInstant,
            description,
            thumbnailTimestamp,
            platforms: [currentPlatform]
          });

          const matched = res?.pipeline?.items?.find((p: any) => p.platform === currentPlatform);
          if (matched) {
            const isSim = matched.status === 'SIMULATED' || matched.isSimulated === true;
            setPipelineItems((prev) =>
              prev.map((item) =>
                item.platform === currentPlatform
                  ? {
                      ...item,
                      status: isSim ? 'SIMULATED' : matched.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
                      isSimulated: isSim,
                      warning: matched.warning,
                      remotePostId: matched.remotePostId,
                      remoteUrl: matched.remoteUrl,
                      error: matched.error
                    }
                  : item
              )
            );
          } else {
            setPipelineItems((prev) =>
              prev.map((item) =>
                item.platform === currentPlatform
                  ? { ...item, status: 'FAILED', error: 'No response received from server' }
                  : item
              )
            );
          }
        } catch (stepErr: any) {
          console.warn(`[PreviewModal] Error publishing to ${currentPlatform}:`, stepErr);
          // If a platform fails, display its failure outcome and immediately proceed to the next platform!
          setPipelineItems((prev) =>
            prev.map((item) =>
              item.platform === currentPlatform
                ? {
                    ...item,
                    status: 'FAILED',
                    error: stepErr?.message || 'Failed to publish'
                  }
                : item
            )
          );
        }
      }

      // 3. Once all platforms have completed, summarize the overall pipeline result
      setPipelineItems((finalItems) => {
        const liveCount = finalItems.filter((i) => i.status === 'SUCCESS' && !i.isSimulated).length;
        const simulatedCount = finalItems.filter((i) => i.status === 'SIMULATED' || i.isSimulated).length;
        const failedCount = finalItems.filter((i) => i.status === 'FAILED').length;

        if (liveCount > 0 && failedCount === 0 && simulatedCount === 0) {
          setPipelineSummary(isInstant ? `✅ All ${liveCount} Selected Platforms Published Live!` : `📅 All ${liveCount} Selected Platforms Staged & Scheduled!`);
        } else if (liveCount > 0 && simulatedCount > 0) {
          setPipelineSummary(isInstant ? `${liveCount} Live Published, ${simulatedCount} Simulated (Missing API Keys)` : `${liveCount} Live Scheduled, ${simulatedCount} Simulated (Missing API Keys)`);
        } else if (simulatedCount > 0 && liveCount === 0) {
          setPipelineSummary(`⚠️ All Selected Platforms in Simulated Test Mode (Missing API Keys in .env)`);
        } else if (failedCount > 0) {
          setPipelineSummary(`⚠️ ${failedCount} Platform(s) Failed to Publish`);
        } else {
          setPipelineSummary('Pipeline processing completed.');
        }

        return finalItems;
      });
    } catch (err: any) {
      console.warn('[PreviewModal] Schedule error:', err);
      setPipelineSummary(`Pipeline result: ${err?.message || 'Error occurred'}`);
    } finally {
      setIsPipelineRunning(false);
    }
  };

  const handleViewRemotePost = async (item: { platform: string; remoteUrl?: string; remotePostId?: string }) => {
    if (!item.remoteUrl || item.remoteUrl.includes('scheduled_')) return;
    try {
      if (item.platform === 'facebook_reels') {
        // Facebook's native app has a known intent routing flaw where external https://facebook.com/*
        // links are intercepted but drop the user into the general news feed instead of playing the reel.
        // WebBrowser (Chrome Custom Tabs / SFSafariViewController) bypasses this app interception and
        // opens the Facebook Reel video player directly with immediate video playback!
        try {
          await WebBrowser.openBrowserAsync(item.remoteUrl, {
            presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
            toolbarColor: '#1877F2',
            controlsColor: '#ffffff'
          });
          return;
        } catch (browserErr) {
          console.warn('[PreviewModal] WebBrowser error for Facebook Reel, falling back to Linking:', browserErr);
        }
      } else if (item.platform === 'instagram_reels') {
        const match = item.remoteUrl.match(/\/reel\/([A-Za-z0-9_-]+)/);
        const shortcode = match ? match[1] : null;
        if (shortcode) {
          const igAppUrl = `instagram://media?id=${shortcode}`;
          const canOpen = await Linking.canOpenURL(igAppUrl).catch(() => false);
          if (canOpen) {
            await Linking.openURL(igAppUrl);
            return;
          }
        }
      }
      await Linking.openURL(item.remoteUrl);
    } catch (err) {
      console.warn('[PreviewModal] Failed to open remote URL:', err);
      try {
        await Linking.openURL(item.remoteUrl);
      } catch (_) {}
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleCancelPress}>
      <View style={styles.container}>
        {/* Header with Return Home, Download Icon, and General Share Icon */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={isAccepted ? onCancelled : handleCancelPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="home-outline" size={24} color={THEME.colors.textPrimary} />
          </TouchableOpacity>

          <Text style={styles.title} numberOfLines={1}>
            {isRendering ? 'Generating Video...' : isAccepted ? 'Ready to Share! 🚀' : 'Video Preview 🎬'}
          </Text>

          {localVideoUri && !isRendering ? (
            <View style={styles.headerRightActions}>
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={handleDownloadVideo}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="download-outline" size={24} color={THEME.colors.primary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={handleGeneralShare}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="share-social-outline" size={24} color={THEME.colors.primary} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.headerIconBtn} />
          )}
        </View>

        {/* Content Area */}
        {isRendering ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={THEME.colors.primary} />
            <Text style={styles.progressPercent}>{progressPercent}%</Text>
            <Text style={styles.progressMessage}>{progressMessage}</Text>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            </View>
          </View>
        ) : localVideoUri ? (
          <View style={styles.playerContainer}>
            {/* Video Player */}
            <VideoPlayerComponent videoUri={localVideoUri} />

            {/* Post-Accept View: Single Master Action Button */}
            {isAccepted ? (
              <View style={styles.socialShareArea}>
                <TouchableOpacity
                  style={styles.scheduleAllBtn}
                  onPress={() => setIsPlatformPickerVisible(true)}
                  activeOpacity={0.85}
                  disabled={isPipelineRunning}
                >
                  <Ionicons name={scheduledPostTime ? "rocket" : "flash"} size={20} color="#020617" style={{ marginRight: 8 }} />
                  <Text style={styles.scheduleAllBtnText}>
                    {scheduledPostTime
                      ? '🚀 Schedule Post to Social Media'
                      : '⚡ Post to Social Media'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Pre-Accept Actions: Accept, Modify, Cancel */
              <View style={styles.decisionActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={handleCancelPress}
                  disabled={isProcessingAction}
                >
                  <Text style={styles.cancelBtnText}>✕ Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modifyBtn}
                  onPress={handleModifyPress}
                  disabled={isProcessingAction}
                >
                  <Text style={styles.modifyBtnText}>✏️ Modify</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.acceptBtn}
                  onPress={handleAcceptPress}
                  disabled={isProcessingAction}
                >
                  {isProcessingAction ? (
                    <ActivityIndicator color="#020617" />
                  ) : (
                    <Text style={styles.acceptBtnText}>✓ Accept</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.loadingContainer}>
            <Text style={styles.errorText}>Video could not be loaded.</Text>
            <TouchableOpacity style={styles.modifyBtn} onPress={handleModifyPress}>
              <Text style={styles.modifyBtnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Platform Selection Modal: user chooses which social media to post on (all selected by default) */}
      <Modal
        visible={isPlatformPickerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsPlatformPickerVisible(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            {/* Header */}
            <View style={styles.pickerHeader}>
              <View style={styles.pickerTitleRow}>
                <Ionicons name="share-social" size={22} color={THEME.colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.pickerTitle}>Post to Social Media</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsPlatformPickerVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.pickerSubtitle}>
              Choose which social media platforms you want to publish your prediction video to:
            </Text>

            {/* Quick Actions (Select All / Clear) */}
            <View style={styles.pickerQuickActions}>
              <Text style={styles.pickerCountBadge}>
                {selectedPlatforms.length} of {AVAILABLE_SOCIAL_PLATFORMS.length} selected
              </Text>
              <TouchableOpacity
                onPress={() => {
                  if (selectedPlatforms.length === AVAILABLE_SOCIAL_PLATFORMS.length) {
                    setSelectedPlatforms([]);
                  } else {
                    setSelectedPlatforms(AVAILABLE_SOCIAL_PLATFORMS.map((p) => p.id));
                  }
                }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={styles.pickerSelectAllBtn}>
                  {selectedPlatforms.length === AVAILABLE_SOCIAL_PLATFORMS.length ? 'Clear All' : 'Select All'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Platform Options List */}
            <View style={styles.pickerList}>
              {AVAILABLE_SOCIAL_PLATFORMS.map((platform) => {
                const isSelected = selectedPlatforms.includes(platform.id);
                return (
                  <TouchableOpacity
                    key={platform.id}
                    style={[
                      styles.pickerItemRow,
                      isSelected && styles.pickerItemRowSelected
                    ]}
                    onPress={() => togglePlatform(platform.id)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.pickerItemIconWrap, { backgroundColor: platform.color }]}>
                      <Image source={platform.icon} style={styles.pickerItemIcon} resizeMode="contain" />
                    </View>

                    <View style={styles.pickerItemContent}>
                      <Text style={styles.pickerItemTitle}>{platform.name}</Text>
                      <Text style={styles.pickerItemSubtitle}>{platform.subtitle}</Text>
                    </View>

                    <View
                      style={[
                        styles.pickerCheckbox,
                        isSelected && styles.pickerCheckboxSelected
                      ]}
                    >
                      {isSelected && <Ionicons name="checkmark" size={16} color="#020617" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Bottom Action Buttons */}
            <View style={styles.pickerActionsRow}>
              <TouchableOpacity
                style={styles.pickerCancelBtn}
                onPress={() => setIsPlatformPickerVisible(false)}
              >
                <Text style={styles.pickerCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.pickerConfirmBtn,
                  selectedPlatforms.length === 0 && styles.pickerConfirmBtnDisabled
                ]}
                disabled={selectedPlatforms.length === 0}
                onPress={() => {
                  setIsPlatformPickerVisible(false);
                  handleScheduleAll(selectedPlatforms);
                }}
              >
                <Text style={styles.pickerConfirmBtnText}>
                  {selectedPlatforms.length === 0
                    ? 'Select at least 1'
                    : scheduledPostTime
                      ? `🚀 Schedule (${selectedPlatforms.length})`
                      : `⚡ Publish Now (${selectedPlatforms.length})`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Live Visual Social Pipeline Progress Modal */}
      <Modal
        visible={isPipelineModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          if (!isPipelineRunning) setIsPipelineModalVisible(false);
        }}
      >
        <View style={styles.pipelineOverlay}>
          <View style={styles.pipelineCard}>
            {/* Modal Header */}
            <View style={styles.pipelineHeader}>
              <View style={styles.pipelineTitleRow}>
                <Ionicons name="rocket" size={22} color={THEME.colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.pipelineTitle}>Social Media Publishing</Text>
              </View>
              {!isPipelineRunning && (
                <TouchableOpacity
                  onPress={() => setIsPipelineModalVisible(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={24} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.pipelineSubtitle}>
              Executing sequential fail-safe publishing across selected platforms ({pipelineItems.length})
            </Text>

            {/* Platform Items List */}
            <View style={styles.pipelineList}>
              {pipelineItems.map((item) => {
                const isPending = item.status === 'PENDING';
                const isInProgress = item.status === 'IN_PROGRESS';
                const isSuccess = item.status === 'SUCCESS';
                const isSimulated = item.status === 'SIMULATED';
                const isFailed = item.status === 'FAILED';

                return (
                  <View key={item.platform} style={styles.pipelineItemRow}>
                    {/* Platform Icon Badge */}
                    <View style={[styles.pipelineIconWrap, { backgroundColor: item.color }]}>
                      <Image source={item.icon} style={styles.pipelineIconImg} resizeMode="contain" />
                    </View>

                    {/* Platform Details */}
                    <View style={styles.pipelineItemContent}>
                      <Text style={styles.pipelineItemName}>{item.name}</Text>
                      {isPending && <Text style={styles.pipelineStatusPending}>Waiting in queue...</Text>}
                      {isInProgress && <Text style={styles.pipelineStatusInProgress}>Uploading &amp; Scheduling...</Text>}
                      {isSuccess && (
                        <Text style={styles.pipelineStatusSuccess}>
                          {item.remoteUrl && !item.remoteUrl.includes('scheduled_')
                            ? `✅ Published Live ${item.remotePostId ? `(#${item.remotePostId.substring(0, 8)})` : ''}`
                            : `📅 Staged & Scheduled ${item.remotePostId ? `(#${item.remotePostId.substring(0, 8)})` : ''}`}
                        </Text>
                      )}
                      {isSimulated && (
                        <Text style={styles.pipelineStatusSimulated} numberOfLines={2}>
                          ⚠️ Simulated (Missing API keys in .env)
                        </Text>
                      )}
                      {isFailed && (
                        <Text style={styles.pipelineStatusFailed} numberOfLines={2}>
                          ❌ {item.error || 'Failed to publish'}
                        </Text>
                      )}
                    </View>

                    {/* Action / State Right Indicator */}
                    <View style={styles.pipelineStatusRight}>
                      {isInProgress && <ActivityIndicator size="small" color={THEME.colors.primary} />}
                      {isPending && <Ionicons name="time-outline" size={20} color="#64748b" />}
                      {isSuccess && item.remoteUrl && !item.remoteUrl.includes('scheduled_') && (
                        <TouchableOpacity
                          style={styles.viewPostBtn}
                          onPress={() => handleViewRemotePost(item)}
                        >
                          <Text style={styles.viewPostBtnText}>View ↗</Text>
                        </TouchableOpacity>
                      )}
                      {isSuccess && (!item.remoteUrl || item.remoteUrl.includes('scheduled_')) && (
                        <Ionicons name="time-outline" size={22} color="#10b981" />
                      )}
                      {isSimulated && (
                        <Ionicons name="alert-circle-outline" size={22} color="#f59e0b" />
                      )}
                      {isFailed && <Ionicons name="alert-circle" size={22} color="#ef4444" />}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Pipeline Summary Banner */}
            {pipelineSummary && (
              <View
                style={[
                  styles.summaryBanner,
                  (pipelineSummary.includes('⚠️') || pipelineSummary.includes('halted') || pipelineSummary.includes('Simulated') || pipelineSummary.includes('Failed')) && styles.summaryBannerWarn
                ]}
              >
                <Text style={styles.summaryBannerText}>{pipelineSummary}</Text>
              </View>
            )}

            {/* Bottom Dismiss Button */}
            {!isPipelineRunning ? (
              <TouchableOpacity
                style={styles.pipelineDoneBtn}
                onPress={() => setIsPipelineModalVisible(false)}
              >
                <Text style={styles.pipelineDoneBtnText}>Done</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.pipelineRunningNotice}>
                <ActivityIndicator size="small" color="#94a3b8" style={{ marginRight: 8 }} />
                <Text style={styles.pipelineRunningNoticeText}>Publishing in progress (Fail-safe active)...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
    paddingTop: 40
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: THEME.colors.cardBorder
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  title: {
    flex: 1,
    fontSize: 19,
    fontWeight: 'bold',
    color: THEME.colors.textPrimary,
    textAlign: 'center',
    marginHorizontal: 8
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30
  },
  progressPercent: {
    fontSize: 36,
    fontWeight: '900',
    color: THEME.colors.primary,
    marginTop: 20
  },
  progressMessage: {
    fontSize: 15,
    color: THEME.colors.textSecondary,
    marginTop: 8,
    textAlign: 'center'
  },
  progressBarTrack: {
    width: '100%',
    height: 10,
    backgroundColor: '#1e293b',
    borderRadius: 5,
    marginTop: 24,
    overflow: 'hidden'
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: THEME.colors.primary,
    borderRadius: 5
  },
  playerContainer: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: 24
  },
  videoPlayerWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#1e293b'
  },
  decisionActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginRight: 8
  },
  cancelBtnText: {
    color: '#f87171',
    fontWeight: 'bold',
    fontSize: 14
  },
  modifyBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: THEME.colors.primary
  },
  modifyBtnText: {
    color: THEME.colors.primary,
    fontWeight: 'bold',
    fontSize: 14
  },
  acceptBtn: {
    flex: 1.2,
    backgroundColor: THEME.colors.accentGreen,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  acceptBtnText: {
    color: '#020617',
    fontWeight: '900',
    fontSize: 15
  },
  socialShareArea: {
    backgroundColor: '#0f172a',
    marginHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1e293b'
  },
  socialDockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 4
  },
  socialDockItem: {
    width: '23%',
    alignItems: 'center'
  },
  socialDockIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 4
  },
  socialDockIconDark: {
    borderWidth: 1.5,
    borderColor: '#334155'
  },
  socialDockIconImage: {
    width: 26,
    height: 26
  },
  socialDockLabel: {
    color: THEME.colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center'
  },
  socialTagBadge: {
    marginTop: 3,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
    backgroundColor: '#1e293b'
  },
  socialTagText: {
    color: THEME.colors.textSecondary,
    fontSize: 9,
    fontWeight: '600'
  },
  errorText: {
    color: '#f87171',
    fontSize: 16,
    marginBottom: 16
  },
  scheduleAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 16,
    shadowColor: THEME.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5
  },
  scheduleAllBtnText: {
    color: '#020617',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.3
  },
  pipelineOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  pipelineCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10
  },
  pipelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  pipelineTitleRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  pipelineTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#f8fafc'
  },
  pipelineSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 16,
    lineHeight: 16
  },
  pipelineList: {
    gap: 10,
    marginBottom: 16
  },
  pipelineItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155'
  },
  pipelineIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  pipelineIconImg: {
    width: 22,
    height: 22
  },
  pipelineItemContent: {
    flex: 1
  },
  pipelineItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 2
  },
  pipelineStatusPending: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500'
  },
  pipelineStatusInProgress: {
    fontSize: 11,
    color: '#38bdf8',
    fontWeight: '600'
  },
  pipelineStatusSuccess: {
    fontSize: 11,
    color: '#34d399',
    fontWeight: '600'
  },
  pipelineStatusSimulated: {
    fontSize: 11,
    color: '#f59e0b',
    fontWeight: '600'
  },
  pipelineStatusFailed: {
    fontSize: 11,
    color: '#f87171',
    fontWeight: '500'
  },
  pipelineStatusRight: {
    marginLeft: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  viewPostBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  viewPostBtnText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '700'
  },
  summaryBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  summaryBannerWarn: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.3)'
  },
  summaryBannerText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700'
  },
  pipelineDoneBtn: {
    backgroundColor: THEME.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center'
  },
  pipelineDoneBtnText: {
    color: '#020617',
    fontSize: 14,
    fontWeight: '800'
  },
  pipelineRunningNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10
  },
  pipelineRunningNoticeText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500'
  },
  // Platform Selection Picker Modal Styles
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  pickerCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0f172a',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  pickerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc'
  },
  pickerSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 12,
    lineHeight: 16
  },
  pickerQuickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    marginBottom: 12
  },
  pickerCountBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38bdf8'
  },
  pickerSelectAllBtn: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.primary
  },
  pickerList: {
    gap: 10,
    marginBottom: 18
  },
  pickerItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#334155'
  },
  pickerItemRowSelected: {
    borderColor: 'rgba(245, 158, 11, 0.6)',
    backgroundColor: 'rgba(30, 41, 59, 0.95)'
  },
  pickerItemIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  pickerItemIcon: {
    width: 24,
    height: 24
  },
  pickerItemContent: {
    flex: 1
  },
  pickerItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 2
  },
  pickerItemSubtitle: {
    fontSize: 11,
    color: '#94a3b8'
  },
  pickerCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#64748b',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10
  },
  pickerCheckboxSelected: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary
  },
  pickerActionsRow: {
    flexDirection: 'row',
    gap: 10
  },
  pickerCancelBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155'
  },
  pickerCancelBtnText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '700'
  },
  pickerConfirmBtn: {
    flex: 2,
    backgroundColor: THEME.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: THEME.colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4
  },
  pickerConfirmBtnDisabled: {
    opacity: 0.45,
    backgroundColor: '#334155'
  },
  pickerConfirmBtnText: {
    color: '#020617',
    fontSize: 14,
    fontWeight: '900'
  }
});
