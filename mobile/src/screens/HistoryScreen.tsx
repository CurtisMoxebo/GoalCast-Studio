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
  Alert
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { THEME } from '../constants/theme';
import { HistoryItem } from '../types';
import { mobileApi } from '../services/api';
import { deviceStorage } from '../services/deviceStorage';
import { sessionStore } from '../services/sessionStore';
import { formatOrdinalDate } from '../utils/dateUtils';

const { width } = Dimensions.get('window');

const HistoryVideoPlayer: React.FC<{ videoUri: string }> = ({ videoUri }) => {
  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = true;
    p.play();
  });

  return (
    <VideoView
      player={player}
      style={styles.modalVideo}
      nativeControls={true}
      contentFit="contain"
    />
  );
};

export const HistoryScreen: React.FC = () => {
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    return sessionStore.getHistory() || [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeVideoUri, setActiveVideoUri] = useState<string | null>(null);

  const loadHistory = async (forceRefresh = false) => {
    // If data is already in session and not an explicit refresh, don't re-fetch
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

  const handleWatchVideo = async (item: HistoryItem) => {
    // Check if video file exists in local storage
    const localFilename = `goalcast_${item.id}.mp4`;
    const exists = await deviceStorage.doesVideoExist(localFilename);

    if (exists) {
      setActiveVideoUri(localFilename);
    } else {
      // Stream/download from backend preview endpoint if local copy was moved
      const remoteUrl = mobileApi.getVideoDownloadUrl(item.id);
      setActiveVideoUri(remoteUrl);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Betting History</Text>
        <Text style={styles.subtitle}>Past accepted prediction reels</Text>
      </View>

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
            Accepted prediction groups will appear here with instant video playback.
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
            const formattedDate = formatOrdinalDate(item.targetDate);
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardDate}>{formattedDate}</Text>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>{item.status}</Text>
                  </View>
                </View>

                <Text style={styles.cardDesc} numberOfLines={2}>
                  {item.description}
                </Text>

                {/* Match Summary Badges */}
                <View style={styles.gamesList}>
                  {item.games?.map((g, idx) => (
                    <View key={idx} style={styles.gameItem}>
                      <Text style={styles.gameTitle} numberOfLines={1}>
                        • {g.homeTeam} vs {g.awayTeam}
                      </Text>
                      <Text style={styles.gamePicks}>
                        {g.selections?.map((s) => s.label).join(', ')}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Watch Video Button */}
                <TouchableOpacity
                  style={styles.watchBtn}
                  onPress={() => handleWatchVideo(item)}
                >
                  <Text style={styles.watchBtnText}>▶ Watch Video Reel</Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      {/* Video Playback Modal */}
      <Modal
        visible={activeVideoUri !== null}
        animationType="slide"
        onRequestClose={() => setActiveVideoUri(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Prediction Video</Text>
            <TouchableOpacity
              onPress={() => setActiveVideoUri(null)}
              style={styles.closeBtn}
            >
              <Text style={styles.closeBtnText}>✕ Close</Text>
            </TouchableOpacity>
          </View>

          {activeVideoUri && (
            <HistoryVideoPlayer videoUri={activeVideoUri} />
          )}
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
    padding: 20,
    borderBottomWidth: 1,
    borderColor: THEME.colors.cardBorder
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
    padding: 16
  },
  card: {
    backgroundColor: THEME.colors.cardBackground,
    borderRadius: THEME.borderRadius.lg,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  cardDate: {
    fontSize: 15,
    fontWeight: 'bold',
    color: THEME.colors.textPrimary
  },
  statusBadge: {
    backgroundColor: '#064e3b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  statusText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: 'bold'
  },
  cardDesc: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginBottom: 12
  },
  gamesList: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12
  },
  gameItem: {
    marginBottom: 6
  },
  gameTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: THEME.colors.textPrimary
  },
  gamePicks: {
    fontSize: 12,
    color: THEME.colors.primary,
    marginLeft: 12
  },
  watchBtn: {
    backgroundColor: '#0c4a6e',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.primary
  },
  watchBtnText: {
    color: '#e0f2fe',
    fontSize: 14,
    fontWeight: 'bold'
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000000',
    paddingTop: 40
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff'
  },
  closeBtn: {
    padding: 8
  },
  closeBtnText: {
    color: THEME.colors.primary,
    fontWeight: 'bold',
    fontSize: 16
  },
  modalVideo: {
    width: width,
    height: width * 1.77,
    backgroundColor: '#000000'
  }
});
