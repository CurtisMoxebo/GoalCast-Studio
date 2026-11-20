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
  Dimensions
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
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

  // Download Video Handler
  const handleDownloadVideo = async () => {
    if (!localVideoUri) return;
    try {
      const { Platform, ToastAndroid, Alert } = await import('react-native');
      const Sharing = await import('expo-sharing');
      const isAvailable = await Sharing.isAvailableAsync().catch(() => false);

      if (Platform.OS === 'android') {
        try {
          ToastAndroid.show('Video ready! Save or choose download location.', ToastAndroid.SHORT);
        } catch {}
      }

      if (isAvailable) {
        await Sharing.shareAsync(localVideoUri, {
          mimeType: 'video/mp4',
          dialogTitle: 'Download / Save Video',
          UTI: 'public.movie'
        });
      } else {
        Alert.alert('Video Downloaded', 'The video is saved on your device storage.');
      }
    } catch (err: any) {
      console.warn('[PreviewModal] Error downloading video:', err);
    }
  };

  // Social Share Handler
  const handleShare = async (platform: SocialPlatform) => {
    if (!localVideoUri) return;
    await shareToSocialMedia(platform, {
      videoUri: localVideoUri,
      description,
      thumbnailTimestamp
    });
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

            {/* Post-Accept View: 4 Direct Social Media Buttons at the bottom */}
            {isAccepted ? (
              <View style={styles.socialShareArea}>
                <View style={styles.socialDockRow}>
                  {SOCIAL_PLATFORMS.map((platform) => {
                    const tagLabel =
                      platform.id === 'youtube'
                        ? 'Shorts'
                        : platform.id === 'tiktok'
                        ? 'Video'
                        : 'Reel';
                    const isDark = platform.id === 'tiktok';

                    return (
                      <TouchableOpacity
                        key={platform.id}
                        style={styles.socialDockItem}
                        onPress={() => handleShare(platform.id)}
                        activeOpacity={0.75}
                      >
                        <View
                          style={[
                            styles.socialDockIconWrap,
                            { backgroundColor: platform.color },
                            isDark && styles.socialDockIconDark
                          ]}
                        >
                          <Image
                            source={SOCIAL_ICONS[platform.id]}
                            style={styles.socialDockIconImage}
                            resizeMode="contain"
                          />
                        </View>
                        <Text style={styles.socialDockLabel} numberOfLines={1}>
                          {platform.name}
                        </Text>
                        <View style={styles.socialTagBadge}>
                          <Text style={styles.socialTagText}>{tagLabel}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
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
  }
});
