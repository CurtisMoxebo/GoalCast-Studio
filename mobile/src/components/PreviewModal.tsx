import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { THEME } from '../constants/theme';
import { mobileApi } from '../services/api';
import { deviceStorage } from '../services/deviceStorage';
import { shareToSocialMedia, SOCIAL_PLATFORMS, SocialPlatform } from '../services/socialShare';

const { width } = Dimensions.get('window');

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

          // Save video directly to user's device storage
          const downloadUrl = mobileApi.getVideoDownloadUrl(jobId);
          const localUri = await deviceStorage.saveVideoToDevice(downloadUrl, `goalcast_${jobId}.mp4`);

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
      }
      setIsAccepted(true);
      onAccepted();
    } catch (e: any) {
      Alert.alert('Error', `Could not accept prediction: ${e?.message}`);
    } finally {
      setIsProcessingAction(false);
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {isRendering ? 'Generating Video...' : isAccepted ? 'Ready to Share! 🚀' : 'Video Preview 🎬'}
          </Text>
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
            <Video
              source={{ uri: localVideoUri }}
              rate={1.0}
              volume={1.0}
              isMuted={false}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={true}
              isLooping={true}
              useNativeControls
              style={styles.videoPlayer}
            />

            {/* Post-Accept View: 4 Branded Social Share Buttons */}
            {isAccepted ? (
              <View style={styles.socialShareArea}>
                <Text style={styles.socialTitle}>Select Platform to Post Video:</Text>
                <View style={styles.socialButtonsGrid}>
                  {SOCIAL_PLATFORMS.map((platform) => (
                    <TouchableOpacity
                      key={platform.id}
                      style={[styles.socialButton, { backgroundColor: platform.color }]}
                      onPress={() => handleShare(platform.id)}
                    >
                      <Text style={styles.socialButtonText}>
                        {platform.id === 'facebook'
                          ? '📘'
                          : platform.id === 'instagram'
                          ? '📸'
                          : platform.id === 'tiktok'
                          ? '🎵'
                          : '▶️'}{' '}
                        {platform.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity style={styles.doneBtn} onPress={onCancelled}>
                  <Text style={styles.doneBtnText}>Done</Text>
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
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: THEME.colors.cardBorder
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: THEME.colors.textPrimary,
    textAlign: 'center'
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
    paddingBottom: 20
  },
  videoPlayer: {
    width: width,
    height: width * 1.35,
    backgroundColor: '#000000',
    borderRadius: 16,
    marginTop: 10
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
    paddingHorizontal: 20,
    paddingTop: 16
  },
  socialTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: THEME.colors.textPrimary,
    marginBottom: 14,
    textAlign: 'center'
  },
  socialButtonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  socialButton: {
    width: '48%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12
  },
  socialButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold'
  },
  doneBtn: {
    backgroundColor: '#1e293b',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4
  },
  doneBtnText: {
    color: THEME.colors.textSecondary,
    fontSize: 14,
    fontWeight: 'bold'
  },
  errorText: {
    color: '#f87171',
    fontSize: 16,
    marginBottom: 16
  }
});
