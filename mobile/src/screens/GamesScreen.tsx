import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView
} from 'react-native';
import { THEME } from '../constants/theme';
import { UpcomingGame, PredictionSelection, BettingOption, MediaAsset, VoiceOption, VideoSettings } from '../types';
import { mobileApi } from '../services/api';
import {
  getUserTimezone,
  getTomorrowDateString,
  formatNavDisplayDate,
  getNextDayString,
  getPreviousDayString,
  canGoBackDate
} from '../utils/dateUtils';
import { GameCard } from '../components/GameCard';
import { PredictionPickerModal } from '../components/PredictionPickerModal';
import { VideoSettingsWizard } from '../components/VideoSettingsWizard';
import { PreviewModal } from '../components/PreviewModal';

export const GamesScreen: React.FC = () => {
  const userTimezone = getUserTimezone();

  // Selected date state: defaults strictly to tomorrow
  const [selectedDate, setSelectedDate] = useState<string>(getTomorrowDateString());
  const [games, setGames] = useState<UpcomingGame[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Predictions map: gameId -> PredictionSelection[]
  const [gameSelections, setGameSelections] = useState<Record<string, PredictionSelection[]>>({});

  // Selection mode for AI prediction batching
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedGameIdsForAi, setSelectedGameIdsForAi] = useState<string[]>([]);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Betting options from backend
  const [bettingOptions, setBettingOptions] = useState<BettingOption[]>([]);

  // Active game for modal picker
  const [activeGameForPicker, setActiveGameForPicker] = useState<UpcomingGame | null>(null);

  // Wizard & Preview State
  const [isWizardActive, setIsWizardActive] = useState(false);
  const [availableVideos, setAvailableVideos] = useState<MediaAsset[]>([]);
  const [availableAudio, setAvailableAudio] = useState<MediaAsset[]>([]);
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const [previewGroupId, setPreviewGroupId] = useState<string | null>(null);
  const [previewDescription, setPreviewDescription] = useState('');
  const [previewThumbTime, setPreviewThumbTime] = useState(3.0);
  const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);

  // Load betting options and media assets on mount
  useEffect(() => {
    mobileApi.fetchBettingOptions().then((res) => {
      setBettingOptions(res.options || []);
    }).catch(console.warn);

    mobileApi.fetchMediaAssets().then((res) => {
      setAvailableVideos(res.backgroundVideos || []);
      setAvailableAudio(res.backgroundAudio || []);
      setAvailableVoices(res.voices || []);
    }).catch(console.warn);
  }, []);

  // Fetch games whenever selectedDate changes
  useEffect(() => {
    loadGamesForDate(selectedDate, true);
  }, [selectedDate]);

  const loadGamesForDate = async (dateStr: string, showLoadingIndicator = true) => {
    if (showLoadingIndicator) {
      setIsLoadingGames(true);
    }
    setFetchError(null);

    try {
      const fetched = await mobileApi.fetchGames(dateStr, userTimezone);
      setGames(fetched);
    } catch (err: any) {
      setFetchError(err?.message || 'Could not load matches from server');
      setGames([]);
    } finally {
      setIsLoadingGames(false);
    }
  };

  const handlePullToRefresh = async () => {
    setIsRefreshing(true);
    await loadGamesForDate(selectedDate, false);
    setIsRefreshing(false);
  };

  // Date Navigation
  const isLeftArrowBlocked = !canGoBackDate(selectedDate);
  const displayDateLabel = formatNavDisplayDate(selectedDate);

  const handlePreviousDay = () => {
    if (canGoBackDate(selectedDate)) {
      setSelectedDate(getPreviousDayString(selectedDate));
      setSelectedGameIdsForAi([]);
    }
  };

  const handleNextDay = () => {
    setSelectedDate(getNextDayString(selectedDate));
    setSelectedGameIdsForAi([]);
  };

  const handleToggleSelectForAi = (gameId: string) => {
    if (selectedGameIdsForAi.includes(gameId)) {
      setSelectedGameIdsForAi(selectedGameIdsForAi.filter((id) => id !== gameId));
    } else {
      if (selectedGameIdsForAi.length >= 10) {
        Alert.alert('Limit Reached', 'You can select at most 10 games for AI prediction.');
        return;
      }
      setSelectedGameIdsForAi([...selectedGameIdsForAi, gameId]);
    }
  };

  const handleRunAiPrediction = async () => {
    if (selectedGameIdsForAi.length === 0) {
      Alert.alert('Selection Required', 'Please select at least 1 match for AI prediction.');
      return;
    }

    const matchesToPredict = games.filter((g) => selectedGameIdsForAi.includes(g.id));
    setIsGeneratingAi(true);

    try {
      const predictions = await mobileApi.requestAiPredictions(matchesToPredict);

      const updatedMap = { ...gameSelections };
      for (const item of predictions) {
        updatedMap[item.gameId] = item.predictions.map((p) => ({
          code: p.code,
          label: p.label,
          category: p.category,
          spokenText: p.spokenText
        }));
      }

      setGameSelections(updatedMap);
      setIsSelectionMode(false);
      setSelectedGameIdsForAi([]);
      Alert.alert('AI Success', 'AI predictions generated based on last 5 games statistics!');
    } catch (err: any) {
      Alert.alert('AI Error', err?.message || 'Failed to generate AI predictions');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleRemoveSelection = (gameId: string, code: string) => {
    const current = gameSelections[gameId] || [];
    setGameSelections({
      ...gameSelections,
      [gameId]: current.filter((s) => s.code !== code)
    });
  };

  const handleConfirmModalSelections = (selections: PredictionSelection[]) => {
    if (!activeGameForPicker) return;
    setGameSelections({
      ...gameSelections,
      [activeGameForPicker.id]: selections
    });
  };

  // Total games with at least one prediction
  const gamesWithPredictions = Object.keys(gameSelections).filter(
    (gId) => (gameSelections[gId] || []).length > 0
  );

  const handleNextToWizard = () => {
    if (gamesWithPredictions.length === 0) {
      Alert.alert('No Predictions', 'Please make predictions for at least 1 game before proceeding.');
      return;
    }
    if (gamesWithPredictions.length > 10) {
      Alert.alert('Limit Exceeded', 'A maximum of 10 games can be included in the video.');
      return;
    }
    setIsWizardActive(true);
  };

  const handleStartGeneration = async (settings: VideoSettings) => {
    setIsPreviewLoading(true);

    const formattedPayloadGames = gamesWithPredictions.map((gameId) => {
      const g = games.find((m) => m.id === gameId);
      return {
        homeTeam: g?.homeTeam || 'Home',
        homeTeamLogo: g?.homeTeamLogo,
        awayTeam: g?.awayTeam || 'Away',
        awayTeamLogo: g?.awayTeamLogo,
        competition: g?.competition || 'Competition',
        competitionLogo: g?.competitionLogo,
        kickoffTime: g?.kickoffTime || new Date().toISOString(),
        selections: gameSelections[gameId] || []
      };
    });

    try {
      const res = await mobileApi.generatePreviewVideo({
        targetDate: selectedDate,
        games: formattedPayloadGames,
        backgroundVideo: settings.backgroundVideo,
        backgroundAudio: settings.backgroundAudio,
        voiceActor: settings.voiceActor,
        thumbnailTimestamp: settings.thumbnailTimestamp,
        description: settings.description
      });

      setPreviewJobId(res.jobId);
      setPreviewGroupId(res.groupId);
      setPreviewDescription(settings.description);
      setPreviewThumbTime(settings.thumbnailTimestamp);
      setIsPreviewModalVisible(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not start video generation');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  if (isWizardActive) {
    return (
      <View style={styles.screen}>
        <VideoSettingsWizard
          targetDate={selectedDate}
          selectedMatchesCount={gamesWithPredictions.length}
          availableVideos={availableVideos}
          availableAudio={availableAudio}
          availableVoices={availableVoices}
          onBack={() => setIsWizardActive(false)}
          onPreview={handleStartGeneration}
          isLoading={isPreviewLoading}
        />

        <PreviewModal
          visible={isPreviewModalVisible}
          jobId={previewJobId}
          groupId={previewGroupId}
          description={previewDescription}
          thumbnailTimestamp={previewThumbTime}
          onModify={() => setIsPreviewModalVisible(false)}
          onCancelled={() => {
            setIsPreviewModalVisible(false);
            setIsWizardActive(false);
          }}
          onAccepted={() => {
            // Keep preview modal open so user can share
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Top Controls Row: Date Navigation on Left, Selection Controls on Right */}
      <View style={styles.topControlsRow}>
        {/* Left: Date Change Section with Left/Right Arrows */}
        <View style={styles.dateNavSection}>
          <TouchableOpacity
            style={[styles.arrowButton, isLeftArrowBlocked && styles.arrowButtonDisabled]}
            onPress={handlePreviousDay}
            disabled={isLeftArrowBlocked}
            activeOpacity={0.7}
          >
            <Text style={[styles.arrowText, isLeftArrowBlocked && styles.arrowTextDisabled]}>◀</Text>
          </TouchableOpacity>

          <View style={styles.dateBadge}>
            <Text style={styles.dateBadgeText}>{displayDateLabel}</Text>
          </View>

          <TouchableOpacity
            style={styles.arrowButton}
            onPress={handleNextDay}
            activeOpacity={0.7}
          >
            <Text style={styles.arrowText}>▶</Text>
          </TouchableOpacity>
        </View>

        {/* Right: Enable Selection & AI Predict */}
        <View style={styles.selectionSection}>
          <TouchableOpacity
            style={[styles.modeBtn, isSelectionMode && styles.modeBtnActive]}
            onPress={() => {
              setIsSelectionMode(!isSelectionMode);
              setSelectedGameIdsForAi([]);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.modeBtnText, isSelectionMode && styles.modeBtnTextActive]}>
              {isSelectionMode ? 'Cancel' : '☑ Enable Selection'}
            </Text>
          </TouchableOpacity>

          {isSelectionMode && (
            <TouchableOpacity
              style={[
                styles.aiPredictBtn,
                (isGeneratingAi || selectedGameIdsForAi.length === 0) && styles.aiPredictBtnDisabled
              ]}
              onPress={handleRunAiPrediction}
              disabled={isGeneratingAi || selectedGameIdsForAi.length === 0}
            >
              {isGeneratingAi ? (
                <ActivityIndicator color="#020617" size="small" />
              ) : (
                <Text style={styles.aiPredictBtnText}>
                  ✨ AI ({selectedGameIdsForAi.length})
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Main Content: Loading, Error, Empty List, or FlatList */}
      {isLoadingGames ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={THEME.colors.primary} />
          <Text style={styles.loadingText}>Querying AI for upcoming fixtures...</Text>
        </View>
      ) : fetchError ? (
        <ScrollView
          contentContainerStyle={styles.centerContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handlePullToRefresh}
              tintColor={THEME.colors.primary}
              colors={[THEME.colors.primary]}
            />
          }
        >
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Error Loading Matches</Text>
          <Text style={styles.errorDetails}>{fetchError}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => loadGamesForDate(selectedDate, true)}
            activeOpacity={0.7}
          >
            <Text style={styles.retryBtnText}>🔄 Retry Query</Text>
          </TouchableOpacity>
          <Text style={styles.pullHint}>Or pull down to refresh</Text>
        </ScrollView>
      ) : games.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.centerContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handlePullToRefresh}
              tintColor={THEME.colors.primary}
              colors={[THEME.colors.primary]}
            />
          }
        >
          <Text style={styles.emptyIcon}>⚽</Text>
          <Text style={styles.emptyTitle}>No Matches Scheduled</Text>
          <Text style={styles.emptyText}>
            No matches found for {displayDateLabel}. Use the right arrow above to check upcoming match days.
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => loadGamesForDate(selectedDate, true)}
            activeOpacity={0.7}
          >
            <Text style={styles.retryBtnText}>🔄 Refresh Fixtures</Text>
          </TouchableOpacity>
          <Text style={styles.pullHint}>Or pull down to refresh</Text>
        </ScrollView>
      ) : (
        <FlatList
          data={games}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handlePullToRefresh}
              tintColor={THEME.colors.primary}
              colors={[THEME.colors.primary]}
            />
          }
          renderItem={({ item }) => (
            <GameCard
              game={item}
              selections={gameSelections[item.id] || []}
              isSelectedForAi={selectedGameIdsForAi.includes(item.id)}
              selectionModeEnabled={isSelectionMode}
              onToggleSelectForAi={() => handleToggleSelectForAi(item.id)}
              onOpenPicker={() => setActiveGameForPicker(item)}
              onRemoveSelection={(code) => handleRemoveSelection(item.id, code)}
            />
          )}
        />
      )}

      {/* Bottom Sticky Action: Next to Video Settings */}
      {gamesWithPredictions.length > 0 && (
        <View style={styles.bottomBar}>
          <View>
            <Text style={styles.bottomBarCount}>
              {gamesWithPredictions.length}/10 matches predicted
            </Text>
            <Text style={styles.bottomBarSub}>Ready to generate Reel</Text>
          </View>
          <TouchableOpacity style={styles.nextBtn} onPress={handleNextToWizard}>
            <Text style={styles.nextBtnText}>Next: Video Setup →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Prediction Picker Modal */}
      <PredictionPickerModal
        visible={activeGameForPicker !== null}
        game={activeGameForPicker}
        currentSelections={activeGameForPicker ? gameSelections[activeGameForPicker.id] || [] : []}
        availableOptions={bettingOptions}
        onClose={() => setActiveGameForPicker(null)}
        onConfirm={handleConfirmModalSelections}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: THEME.colors.background
  },
  topControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#0a0f1d',
    borderBottomWidth: 1,
    borderColor: THEME.colors.cardBorder
  },
  dateNavSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0
  },
  arrowButton: {
    backgroundColor: '#1e293b',
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155'
  },
  arrowButtonDisabled: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    opacity: 0.35
  },
  arrowText: {
    color: THEME.colors.primary,
    fontSize: 13,
    fontWeight: 'bold'
  },
  arrowTextDisabled: {
    color: THEME.colors.textMuted
  },
  dateBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 92
  },
  dateBadgeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  selectionSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  modeBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155'
  },
  modeBtnActive: {
    backgroundColor: '#334155',
    borderColor: '#f87171'
  },
  modeBtnText: {
    color: THEME.colors.primary,
    fontSize: 12,
    fontWeight: 'bold'
  },
  modeBtnTextActive: {
    color: '#f87171'
  },
  aiPredictBtn: {
    backgroundColor: THEME.colors.accentGold,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8
  },
  aiPredictBtnDisabled: {
    opacity: 0.4
  },
  aiPredictBtnText: {
    color: '#020617',
    fontSize: 12,
    fontWeight: '900'
  },
  listContent: {
    padding: 16,
    paddingBottom: 90
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  loadingText: {
    color: THEME.colors.textSecondary,
    marginTop: 12,
    fontSize: 14,
    textAlign: 'center'
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 12
  },
  errorTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center'
  },
  errorDetails: {
    color: '#f87171',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
    maxWidth: 320
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center'
  },
  emptyText: {
    color: THEME.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
    maxWidth: 300
  },
  pullHint: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    marginTop: 16
  },
  retryBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.colors.primary
  },
  retryBtnText: {
    color: THEME.colors.primary,
    fontWeight: 'bold',
    fontSize: 14
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderColor: THEME.colors.cardBorder,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  bottomBarCount: {
    fontSize: 15,
    fontWeight: 'bold',
    color: THEME.colors.accentGold
  },
  bottomBarSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary
  },
  nextBtn: {
    backgroundColor: THEME.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12
  },
  nextBtnText: {
    color: '#020617',
    fontSize: 14,
    fontWeight: '900'
  }
});
