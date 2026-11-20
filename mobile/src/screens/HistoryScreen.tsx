import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Dimensions,
  Alert,
  ScrollView,
  Image,
  BackHandler
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { THEME } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { HistoryItem } from '../types';
import { mobileApi } from '../services/api';
import { deviceStorage } from '../services/deviceStorage';
import { sessionStore } from '../services/sessionStore';
import { sharePredictionVideo, shareMultiplePredictionVideos } from '../services/socialShare';
import { formatCreationDateTime, formatKickoffTime } from '../utils/dateUtils';

const { width } = Dimensions.get('window');

// Separate player component to handle expo-video hook lifecycle cleanly
const HistoryVideoPlayer: React.FC<{ videoUri: string }> = ({ videoUri }) => {
  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = true;
    p.play();
  });

  return (
    <View style={styles.videoPlayerContainer}>
      <VideoView
        player={player}
        style={styles.modalVideo}
        nativeControls={true}
        contentFit="contain"
      />
    </View>
  );
};

// Team Logo with Fallback Initials
const TeamLogoItem: React.FC<{ name: string; logoUrl?: string }> = ({ name, logoUrl }) => {
  const [hasError, setHasError] = useState(false);

  if (logoUrl && !hasError) {
    return (
      <Image
        source={{ uri: logoUrl }}
        style={styles.gameTeamLogo}
        resizeMode="contain"
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <View style={styles.gameTeamLogoPlaceholder}>
      <Text style={styles.gameTeamLogoText}>{(name || 'FC').substring(0, 2).toUpperCase()}</Text>
    </View>
  );
};

export const HistoryScreen: React.FC = () => {
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    return sessionStore.getHistory() || [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals state
  const [detailItem, setDetailItem] = useState<HistoryItem | null>(null);
  const [activeVideoUri, setActiveVideoUri] = useState<string | null>(null);
  const [currentPlayingItem, setCurrentPlayingItem] = useState<HistoryItem | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBatchSharing, setIsBatchSharing] = useState(false);

  const loadHistory = async (forceRefresh = false) => {
    if (!forceRefresh && sessionStore.hasHistory()) {
      setHistory(sessionStore.getHistory() || []);
      setIsLoading(false);
      return;
    }

    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const items = await mobileApi.fetchHistory();
      sessionStore.setHistory(items);
      setHistory(items);
    } catch (err: any) {
      console.warn('Error loading history:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadHistory(false);
  }, []);

  // Exit select mode on hardware/system back press
  useEffect(() => {
    if (!isSelectMode) return;

    const onBackPress = () => {
      handleExitSelectMode();
      return true; // Prevents default navigation / app close
    };

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress
    );

    return () => subscription.remove();
  }, [isSelectMode]);

  // --- Multi-select handlers ---
  const handleItemLongPress = (item: HistoryItem) => {
    if (!isSelectMode) {
      setIsSelectMode(true);
      setSelectedIds(new Set([item.id]));
    }
  };

  const handleItemPress = (item: HistoryItem) => {
    if (isSelectMode) {
      toggleSelectItem(item.id);
    } else {
      setDetailItem(item);
    }
  };

  const toggleSelectItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      // When none is selected, quit selection mode immediately
      if (next.size === 0) {
        setIsSelectMode(false);
      }
      return next;
    });
  };

  const handleExitSelectMode = () => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  };

  // --- Deletion handlers ---
  const handleDeleteSingle = (item: HistoryItem) => {
    Alert.alert(
      'Delete History',
      'Are you sure you want to delete this prediction history? This will also delete the video file from your device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeleting(true);
              await mobileApi.updatePredictionStatus(item.id, 'DELETED');
              // Delete video file(s) from device storage
              await deviceStorage.deleteVideoForGroup(item.id);
              sessionStore.removeHistoryItems(item.id);
              setHistory((prev) => prev.filter((h) => h.id !== item.id));
              setDetailItem(null);
            } catch (err: any) {
              Alert.alert('Error', 'Failed to delete history item. Please try again.');
            } finally {
              setIsDeleting(false);
            }
          }
        }
      ]
    );
  };

  const handleDeleteBatch = () => {
    const count = selectedIds.size;
    if (count === 0) return;

    Alert.alert(
      'Delete Histories',
      `Are you sure you want to delete ${count} selected ${count === 1 ? 'history' : 'histories'}? This will also delete the video files from your device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const idsToDelete = Array.from(selectedIds);
            try {
              setIsDeleting(true);
              await mobileApi.updatePredictionStatus(idsToDelete, 'DELETED');
              // Delete video file(s) from device storage
              await deviceStorage.deleteVideosForGroups(idsToDelete);
              sessionStore.removeHistoryItems(idsToDelete);
              setHistory((prev) => prev.filter((h) => !selectedIds.has(h.id)));
              handleExitSelectMode();
            } catch (err: any) {
              Alert.alert('Error', 'Failed to delete selected histories. Please try again.');
            } finally {
              setIsDeleting(false);
            }
          }
        }
      ]
    );
  };

  // --- Video Watch handler ---
  const handleWatchVideo = async (item: HistoryItem) => {
    try {
      setCurrentPlayingItem(item);
      // Close detail modal so two modals do not conflict on screen
      setDetailItem(null);

      const localFilename = `goalcast_${item.id}.mp4`;
      const exists = await deviceStorage.doesVideoExist(localFilename);

      if (exists) {
        const fullUri = deviceStorage.getVideoUri(localFilename);
        setActiveVideoUri(fullUri);
      } else {
        // Check if any local video matches in storage directory
        const savedFiles = await deviceStorage.listSavedVideos();
        const matching = savedFiles.find(
          (f) => f.includes(item.id) || (item.localVideoPath && f.includes(item.localVideoPath))
        );

        if (matching) {
          const fullUri = deviceStorage.getVideoUri(matching);
          setActiveVideoUri(fullUri);
        } else if (savedFiles.length > 0) {
          // If a saved video exists locally on device, use the newest one
          const newest = savedFiles[savedFiles.length - 1];
          const fullUri = deviceStorage.getVideoUri(newest);
          setActiveVideoUri(fullUri);
        } else {
          // Stream from backend with HTTP 206 Range support
          const remoteUrl = mobileApi.getVideoDownloadUrl(item.id);
          setActiveVideoUri(remoteUrl);
        }
      }
    } catch (e) {
      console.warn('[HistoryScreen] Error launching video:', e);
      setActiveVideoUri(mobileApi.getVideoDownloadUrl(item.id));
    }
  };

  // --- Video Share handler ---
  const handleShareVideo = async (item: HistoryItem) => {
    try {
      setIsSharing(true);
      let targetUri: string | null = null;
      const localFilename = `goalcast_${item.id}.mp4`;

      if (await deviceStorage.doesVideoExist(localFilename)) {
        targetUri = deviceStorage.getVideoUri(localFilename);
      } else {
        const savedFiles = await deviceStorage.listSavedVideos();
        const matching = savedFiles.find(
          (f) => f.includes(item.id) || (item.localVideoPath && f.includes(item.localVideoPath))
        );
        if (matching) {
          targetUri = deviceStorage.getVideoUri(matching);
        } else {
          // Download video to device storage first so it can be shared via native share sheet
          const downloadUrl = mobileApi.getVideoDownloadUrl(item.id);
          targetUri = await deviceStorage.saveVideoToDevice(downloadUrl, localFilename);
        }
      }

      const description =
        item.description ||
        `GoalCast football predictions for ${formatCreationDateTime(item.createdAt || item.targetDate)}`;

      if (targetUri && !targetUri.startsWith('file://')) {
        targetUri = deviceStorage.getVideoUri(targetUri);
      }

      await sharePredictionVideo({
        videoUri: targetUri,
        description,
        thumbnailTimestamp: item.thumbnailTimestamp
      });
    } catch (err: any) {
      console.warn('[HistoryScreen] Error sharing video:', err);
      Alert.alert('Share Failed', 'Could not share the video. Please check your connection and try again.');
    } finally {
      setIsSharing(false);
    }
  };

  // --- Multiple Video Share handler ---
  const handleBatchShare = async () => {
    if (selectedIds.size === 0) return;

    try {
      setIsBatchSharing(true);
      const selectedItems = history.filter((h) => selectedIds.has(h.id));
      const itemsToShare: { videoUri: string; description: string }[] = [];

      for (const item of selectedItems) {
        const localFilename = `goalcast_${item.id}.mp4`;
        let uri: string | null = null;

        if (await deviceStorage.doesVideoExist(localFilename)) {
          uri = deviceStorage.getVideoUri(localFilename);
        } else {
          const savedFiles = await deviceStorage.listSavedVideos();
          const matching = savedFiles.find(
            (f) => f.includes(item.id) || (item.localVideoPath && f.includes(item.localVideoPath))
          );
          if (matching) {
            uri = deviceStorage.getVideoUri(matching);
          } else {
            const downloadUrl = mobileApi.getVideoDownloadUrl(item.id);
            uri = await deviceStorage.saveVideoToDevice(downloadUrl, localFilename);
          }
        }

        const description =
          item.description ||
          `GoalCast football predictions reel for ${formatCreationDateTime(item.createdAt || item.targetDate)}`;

        if (uri) {
          if (!uri.startsWith('file://')) {
            uri = deviceStorage.getVideoUri(uri);
          }
          itemsToShare.push({ videoUri: uri, description });
        }
      }

      await shareMultiplePredictionVideos(itemsToShare);
    } catch (err: any) {
      console.warn('[HistoryScreen] Error batch sharing videos:', err);
      Alert.alert('Share Failed', 'Could not share the selected videos. Please try again.');
    } finally {
      setIsBatchSharing(false);
    }
  };

  return (
    <View style={styles.screen}>
      {/* Header bar */}
      {isSelectMode ? (
        <View style={[styles.header, styles.selectModeHeader]}>
          <TouchableOpacity
            onPress={handleExitSelectMode}
            style={styles.headerBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={24} color={THEME.colors.textPrimary} />
          </TouchableOpacity>

          <Text style={styles.selectedCountText}>
            {selectedIds.size} Selected
          </Text>

          <View style={styles.headerRightActions}>
            {/* Share Icon Button */}
            <TouchableOpacity
              onPress={handleBatchShare}
              disabled={selectedIds.size === 0 || isBatchSharing}
              style={[
                styles.iconActionBtn,
                (selectedIds.size === 0 || isBatchSharing) && styles.iconActionBtnDisabled
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isBatchSharing ? (
                <ActivityIndicator size="small" color={THEME.colors.primary} />
              ) : (
                <Ionicons
                  name="share-social-outline"
                  size={22}
                  color={selectedIds.size === 0 ? '#64748b' : THEME.colors.primary}
                />
              )}
            </TouchableOpacity>

            {/* Delete Icon Button */}
            <TouchableOpacity
              onPress={handleDeleteBatch}
              disabled={selectedIds.size === 0 || isDeleting}
              style={[
                styles.iconActionBtn,
                styles.deleteIconBtn,
                (selectedIds.size === 0 || isDeleting) && styles.iconActionBtnDisabled
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color="#ef4444" />
              ) : (
                <Ionicons
                  name="trash-outline"
                  size={22}
                  color={selectedIds.size === 0 ? '#64748b' : '#ef4444'}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.header}>
          <Text style={styles.title}>Betting History</Text>
          <Text style={styles.subtitle}>Past accepted prediction reels</Text>
        </View>
      )}

      {/* Content */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={THEME.colors.primary} />
          <Text style={styles.loadingText}>Loading betting history...</Text>
        </View>
      ) : history.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📜</Text>
          <Text style={styles.emptyTitle}>No Betting History Yet</Text>
          <Text style={styles.emptySub}>
            Accepted prediction groups will appear here with instant video playback and details.
          </Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => loadHistory(true)}>
            <Text style={styles.refreshBtnText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onRefresh={() => loadHistory(true)}
          refreshing={isRefreshing}
          renderItem={({ item }) => {
            const isSelected = selectedIds.has(item.id);
            const createdFormatted = formatCreationDateTime(item.createdAt || item.targetDate);
            const gamesCount = item.games?.length || 0;

            return (
              <TouchableOpacity
                style={[
                  styles.card,
                  isSelectMode && isSelected && styles.cardSelected
                ]}
                activeOpacity={0.7}
                onPress={() => handleItemPress(item)}
                onLongPress={() => handleItemLongPress(item)}
              >
                {/* Select Mode Checkbox Indicator */}
                {isSelectMode && (
                  <View style={[styles.checkboxCircle, isSelected && styles.checkboxCircleActive]}>
                    {isSelected && <Text style={styles.checkboxCheckmark}>✓</Text>}
                  </View>
                )}

                {/* Main Content: Created Date/Time and Games Count ONLY */}
                <View style={styles.cardContent}>
                  <View style={styles.dateRow}>
                    <Text style={styles.dateLabel}>📅 {createdFormatted}</Text>
                  </View>
                  <View style={styles.badgeRow}>
                    <View style={styles.gamesCountBadge}>
                      <Text style={styles.gamesCountText}>
                        {gamesCount} {gamesCount === 1 ? 'Game' : 'Games'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Right Arrow when not in select mode */}
                {!isSelectMode && (
                  <View style={styles.arrowContainer}>
                    <Text style={styles.arrowText}>›</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Details Modal */}
      <Modal
        visible={detailItem !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDetailItem(null)}
      >
        <View style={styles.detailModalOverlay}>
          <View style={styles.detailModalContent}>
            {/* Modal Header */}
            <View style={styles.detailModalHeader}>
              <View style={styles.detailModalTitleContainer}>
                <Text style={styles.detailModalTitle}>Prediction Details</Text>
                {detailItem && (
                  <Text style={styles.detailModalSubtitle}>
                    {formatCreationDateTime(detailItem.createdAt || detailItem.targetDate)} • {detailItem.games?.length || 0} Games
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.detailModalCloseBtn}
                onPress={() => setDetailItem(null)}
              >
                <Text style={styles.detailModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Games and Predictions List */}
            <ScrollView
              style={styles.detailModalScroll}
              contentContainerStyle={styles.detailModalScrollContent}
              showsVerticalScrollIndicator={true}
            >
              {detailItem?.games?.map((game, idx) => {
                const selections = game.selections || [];
                const formattedCombined = selections.map((s) => s.label).join(' & ');

                return (
                  <View key={idx} style={styles.gameCard}>
                    {/* Game header: match index & competition & time */}
                    <View style={styles.gameCardTop}>
                      <Text style={styles.gameCardIndex}>Game #{idx + 1}</Text>
                      {game.competition ? (
                        <View style={styles.competitionBadge}>
                          <Text style={styles.competitionBadgeText} numberOfLines={1}>
                            {game.competition}
                          </Text>
                        </View>
                      ) : null}
                      {game.kickoffTime ? (
                        <Text style={styles.gameKickoffTime}>
                          {formatKickoffTime(game.kickoffTime)}
                        </Text>
                      ) : null}
                    </View>

                    {/* Teams row */}
                    <View style={styles.teamsDisplayRow}>
                      {/* Home */}
                      <View style={styles.teamSide}>
                        <TeamLogoItem name={game.homeTeam} logoUrl={game.homeTeamLogo} />
                        <Text style={styles.teamSideName} numberOfLines={2}>
                          {game.homeTeam}
                        </Text>
                      </View>

                      {/* VS separator */}
                      <View style={styles.vsBadge}>
                        <Text style={styles.vsText}>VS</Text>
                      </View>

                      {/* Away */}
                      <View style={styles.teamSide}>
                        <TeamLogoItem name={game.awayTeam} logoUrl={game.awayTeamLogo} />
                        <Text style={styles.teamSideName} numberOfLines={2}>
                          {game.awayTeam}
                        </Text>
                      </View>
                    </View>

                    {/* Predictions Section */}
                    <View style={styles.predictionsContainer}>
                      <Text style={styles.predictionsHeaderLabel}>
                        {selections.length > 1 ? 'Predictions:' : 'Prediction:'}
                      </Text>

                      {/* If multiple predictions, show combined banner */}
                      {selections.length > 1 && (
                        <View style={styles.combinedPredictionBanner}>
                          <Text style={styles.combinedPredictionText}>
                            {formattedCombined}
                          </Text>
                        </View>
                      )}

                      {/* Individual selections chips */}
                      <View style={styles.chipsRow}>
                        {selections.map((sel, sIdx) => (
                          <View key={sIdx} style={styles.predictionChip}>
                            <Text style={styles.predictionChipCategory}>
                              {sel.category ? `${sel.category}: ` : ''}
                            </Text>
                            <Text style={styles.predictionChipLabel}>
                              {sel.label}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {/* Bottom Actions: Watch Video (full width top), Delete History (half width left), Share Video (half width right) */}
            {detailItem && (
              <View style={styles.detailModalFooter}>
                <TouchableOpacity
                  style={styles.watchVideoBtn}
                  onPress={() => handleWatchVideo(detailItem)}
                >
                  <Ionicons name="play" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.watchVideoBtnText}>Watch Video</Text>
                </TouchableOpacity>

                <View style={styles.detailModalBottomRow}>
                  <TouchableOpacity
                    style={styles.deleteHistoryBtn}
                    onPress={() => handleDeleteSingle(detailItem)}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <ActivityIndicator size="small" color="#ef4444" />
                    ) : (
                      <>
                        <Ionicons name="trash-outline" size={18} color="#ef4444" style={{ marginRight: 6 }} />
                        <Text style={styles.deleteHistoryBtnText}>Delete</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.shareVideoBtn}
                    onPress={() => handleShareVideo(detailItem)}
                    disabled={isSharing}
                  >
                    {isSharing ? (
                      <ActivityIndicator size="small" color={THEME.colors.primary} />
                    ) : (
                      <>
                        <Ionicons
                          name="share-social-outline"
                          size={18}
                          color={THEME.colors.primary}
                          style={{ marginRight: 6 }}
                        />
                        <Text style={styles.shareVideoBtnText}>Share</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Video Playback Modal */}
      <Modal
        visible={activeVideoUri !== null}
        animationType="slide"
        onRequestClose={() => {
          setActiveVideoUri(null);
          setCurrentPlayingItem(null);
        }}
      >
        <View style={styles.videoModalContainer}>
          <View style={styles.videoModalHeader}>
            <Text style={styles.videoModalTitle}>Prediction Reel</Text>
            <View style={styles.videoHeaderActions}>
              {currentPlayingItem && (
                <TouchableOpacity
                  onPress={() => handleShareVideo(currentPlayingItem)}
                  style={styles.videoShareHeaderBtn}
                  disabled={isSharing}
                >
                  {isSharing ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <View style={styles.videoShareHeaderInner}>
                      <Ionicons
                        name="share-social-outline"
                        size={16}
                        color="#ffffff"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.videoShareHeaderBtnText}>Share</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => {
                  setActiveVideoUri(null);
                  setCurrentPlayingItem(null);
                }}
                style={styles.videoCloseBtn}
              >
                <Text style={styles.videoCloseBtnText}>✕ Close</Text>
              </TouchableOpacity>
            </View>
          </View>

          {activeVideoUri && <HistoryVideoPlayer videoUri={activeVideoUri} />}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: THEME.colors.background
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: THEME.colors.cardBorder,
    backgroundColor: THEME.colors.background
  },
  selectModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    paddingVertical: 12
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
  headerBtn: {
    padding: 6,
    borderRadius: 8
  },
  selectedCountText: {
    color: THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold'
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  iconActionBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 38,
    minHeight: 38
  },
  deleteIconBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)'
  },
  iconActionBtnDisabled: {
    opacity: 0.4
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30
  },
  loadingText: {
    color: THEME.colors.textSecondary,
    marginTop: 12
  },
  emptyIcon: {
    fontSize: 54,
    marginBottom: 12
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: THEME.colors.textPrimary,
    marginBottom: 8
  },
  emptySub: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20
  },
  refreshBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.colors.primary
  },
  refreshBtnText: {
    color: THEME.colors.primary,
    fontWeight: 'bold'
  },
  listContent: {
    padding: 16,
    gap: 12
  },
  card: {
    backgroundColor: THEME.colors.cardBackground,
    borderRadius: THEME.borderRadius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  cardSelected: {
    borderColor: THEME.colors.primary,
    backgroundColor: 'rgba(56, 189, 248, 0.08)'
  },
  checkboxCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#64748b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14
  },
  checkboxCircleActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary
  },
  checkboxCheckmark: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: 'bold'
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center'
  },
  dateRow: {
    marginBottom: 6
  },
  dateLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.textPrimary
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  gamesCountBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)'
  },
  gamesCountText: {
    color: THEME.colors.primary,
    fontSize: 12,
    fontWeight: 'bold'
  },
  arrowContainer: {
    paddingLeft: 12
  },
  arrowText: {
    color: THEME.colors.textSecondary,
    fontSize: 22,
    fontWeight: 'bold'
  },

  // --- Detail Modal ---
  detailModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end'
  },
  detailModalContent: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder
  },
  detailModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderColor: THEME.colors.cardBorder
  },
  detailModalTitleContainer: {
    flex: 1
  },
  detailModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: THEME.colors.textPrimary
  },
  detailModalSubtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 4
  },
  detailModalCloseBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#1e293b'
  },
  detailModalCloseText: {
    color: THEME.colors.textSecondary,
    fontSize: 16,
    fontWeight: 'bold'
  },
  detailModalScroll: {
    maxHeight: Dimensions.get('window').height * 0.58
  },
  detailModalScrollContent: {
    padding: 16,
    gap: 14
  },
  gameCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder
  },
  gameCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  gameCardIndex: {
    fontSize: 12,
    fontWeight: 'bold',
    color: THEME.colors.primary
  },
  competitionBadge: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: '55%'
  },
  competitionBadgeText: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: '600'
  },
  gameKickoffTime: {
    fontSize: 11,
    color: THEME.colors.textSecondary
  },
  teamsDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    backgroundColor: '#0f172a',
    padding: 10,
    borderRadius: 10
  },
  teamSide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4
  },
  gameTeamLogo: {
    width: 38,
    height: 38,
    marginBottom: 6
  },
  gameTeamLogoPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6
  },
  gameTeamLogoText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: 'bold'
  },
  teamSideName: {
    color: THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  vsBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155'
  },
  vsText: {
    color: THEME.colors.primary,
    fontSize: 11,
    fontWeight: 'bold'
  },
  predictionsContainer: {
    marginTop: 2
  },
  predictionsHeaderLabel: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase'
  },
  combinedPredictionBanner: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    marginBottom: 8
  },
  combinedPredictionText: {
    color: THEME.colors.primary,
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  predictionChip: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center'
  },
  predictionChipCategory: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600'
  },
  predictionChipLabel: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: 'bold'
  },
  detailModalFooter: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
    borderTopWidth: 1,
    borderColor: THEME.colors.cardBorder
  },
  watchVideoBtn: {
    width: '100%',
    backgroundColor: '#0284c7',
    paddingVertical: 13,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  watchVideoBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold'
  },
  detailModalBottomRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%'
  },
  deleteHistoryBtn: {
    flex: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ef4444'
  },
  deleteHistoryBtnText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: 'bold'
  },
  shareVideoBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.primary
  },
  shareVideoBtnText: {
    color: THEME.colors.primary,
    fontSize: 14,
    fontWeight: 'bold'
  },

  // --- Video Modal ---
  videoModalContainer: {
    flex: 1,
    backgroundColor: '#000000',
    paddingTop: 40
  },
  videoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    zIndex: 10
  },
  videoModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff'
  },
  videoHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  videoShareHeaderBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  videoShareHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  videoShareHeaderBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold'
  },
  videoCloseBtn: {
    padding: 8
  },
  videoCloseBtnText: {
    color: THEME.colors.primary,
    fontWeight: 'bold',
    fontSize: 16
  },
  videoPlayerContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalVideo: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000'
  }
});
