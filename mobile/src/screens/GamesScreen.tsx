import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView
} from 'react-native';
import { THEME } from '../constants/theme';
import { UpcomingGame, PredictionSelection, BettingOption, MediaAsset, VoiceOption, VideoSettings } from '../types';
import { mobileApi } from '../services/api';
import { getUserTimezone, getSelectableFutureDates } from '../utils/dateUtils';
import { GameCard } from '../components/GameCard';
import { PredictionPickerModal } from '../components/PredictionPickerModal';
import { VideoSettingsWizard } from '../components/VideoSettingsWizard';
import { PreviewModal } from '../components/PreviewModal';

export const GamesScreen: React.FC = () => {
  const futureDates = getSelectableFutureDates(7);
  const userTimezone = getUserTimezone();

  const [selectedDate, setSelectedDate] = useState(futureDates[0].dateStr);
  const [games, setGames] = useState<UpcomingGame[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(false);

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
    loadGamesForDate(selectedDate);
  }, [selectedDate]);

  const loadGamesForDate = async (dateStr: string) => {
    setIsLoadingGames(true);
    try {
      const fetched = await mobileApi.fetchGames(dateStr, userTimezone);
      setGames(fetched);
    } catch (err: any) {
      Alert.alert('Load Error', err?.message || 'Could not load games');
      setGames([]);
    } finally {
      setIsLoadingGames(false);
    }
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
            // Keep preview modal open so user can share to FB, IG, TikTok, YT Shorts
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Date Selector Header: strictly next day onwards */}
      <View style={styles.dateSelectorContainer}>
        <Text style={styles.dateLabel}>Select Date (Next Day Onwards):</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateScroll}>
          {futureDates.map((item) => {
            const isSelected = selectedDate === item.dateStr;
            return (
              <TouchableOpacity
                key={item.dateStr}
                style={[styles.dateChip, isSelected && styles.dateChipActive]}
                onPress={() => setSelectedDate(item.dateStr)}
              >
                <Text style={[styles.dateChipText, isSelected && styles.dateChipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* AI & Multi-select Control Bar */}
      <View style={styles.controlsBar}>
        <TouchableOpacity
          style={[styles.modeBtn, isSelectionMode && styles.modeBtnActive]}
          onPress={() => {
            setIsSelectionMode(!isSelectionMode);
            setSelectedGameIdsForAi([]);
          }}
        >
          <Text style={[styles.modeBtnText, isSelectionMode && styles.modeBtnTextActive]}>
            {isSelectionMode ? 'Cancel Selection' : '☑ Enable Selection'}
          </Text>
        </TouchableOpacity>

        {isSelectionMode && (
          <TouchableOpacity
            style={[styles.aiPredictBtn, isGeneratingAi && styles.aiPredictBtnDisabled]}
            onPress={handleRunAiPrediction}
            disabled={isGeneratingAi}
          >
            {isGeneratingAi ? (
              <ActivityIndicator color="#020617" size="small" />
            ) : (
              <Text style={styles.aiPredictBtnText}>
                ✨ AI Predict ({selectedGameIdsForAi.length})
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Games List or Loading */}
      {isLoadingGames ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={THEME.colors.primary} />
          <Text style={styles.loadingText}>Fetching scheduled fixtures...</Text>
        </View>
      ) : games.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyIcon}>⚽</Text>
          <Text style={styles.emptyText}>No matches found for this date.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadGamesForDate(selectedDate)}>
            <Text style={styles.retryBtnText}>Reload Fixtures</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={games}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
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
  dateSelectorContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderColor: THEME.colors.cardBorder
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: THEME.colors.textSecondary,
    marginBottom: 8
  },
  dateScroll: {
    flexDirection: 'row'
  },
  dateChip: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  dateChipActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary
  },
  dateChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.textSecondary
  },
  dateChipTextActive: {
    color: '#020617',
    fontWeight: 'bold'
  },
  controlsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0a0f1d'
  },
  modeBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8
  },
  modeBtnActive: {
    backgroundColor: '#334155'
  },
  modeBtnText: {
    color: THEME.colors.primary,
    fontSize: 13,
    fontWeight: 'bold'
  },
  modeBtnTextActive: {
    color: '#f87171'
  },
  aiPredictBtn: {
    backgroundColor: THEME.colors.accentGold,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  aiPredictBtnDisabled: {
    opacity: 0.6
  },
  aiPredictBtnText: {
    color: '#020617',
    fontSize: 13,
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
    fontSize: 14
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12
  },
  emptyText: {
    color: THEME.colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16
  },
  retryBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
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
