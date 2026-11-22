import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  BackHandler,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';
import { UpcomingGame, PredictionSelection, BettingOption, MediaAsset, VoiceOption, VideoSettings } from '../types';
import { mobileApi } from '../services/api';
import { sessionStore } from '../services/sessionStore';
import {
  getUserTimezone,
  getTomorrowDateString,
  formatNavDisplayDate,
  getNextDayString,
  getPreviousDayString,
  canGoBackDate
} from '../utils/dateUtils';
import { filterGamesBySearchQuery, groupGamesByCompetition } from '../utils/gameUtils';
import { triggerHaptic } from '../utils/haptics';
import { CompetitionCard } from '../components/CompetitionCard';
import { PredictionPickerModal } from '../components/PredictionPickerModal';
import { VideoSettingsWizard } from '../components/VideoSettingsWizard';
import { PreviewModal } from '../components/PreviewModal';

export const GamesScreen: React.FC = () => {
  const userTimezone = getUserTimezone();

  // Selected date state: defaults to session stored date or strictly to tomorrow
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return sessionStore.getSelectedDate() || getTomorrowDateString();
  });
  const [games, setGames] = useState<UpcomingGame[]>(() => {
    const initialDate = sessionStore.getSelectedDate() || getTomorrowDateString();
    return sessionStore.getGames(initialDate) || [];
  });
  const [isLoadingGames, setIsLoadingGames] = useState(() => {
    const initialDate = sessionStore.getSelectedDate() || getTomorrowDateString();
    return !sessionStore.hasGames(initialDate);
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Search filter query & focus state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Predictions map: gameId -> PredictionSelection[] (restored from session store)
  const [gameSelections, setGameSelections] = useState<Record<string, PredictionSelection[]>>(() => {
    return sessionStore.getSelections();
  });

  // Sync selected date & selections to sessionStore
  useEffect(() => {
    sessionStore.setSelectedDate(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    sessionStore.setSelections(gameSelections);
  }, [gameSelections]);

  // Filter to show only games with predictions
  const [showOnlyPredicted, setShowOnlyPredicted] = useState(false);

  // Total games with at least one prediction
  const gamesWithPredictions = useMemo(() => {
    return Object.keys(gameSelections).filter(
      (gId) => (gameSelections[gId] || []).length > 0
    );
  }, [gameSelections]);

  const hasAnyPredictions = gamesWithPredictions.length > 0;

  // Auto-disable showOnlyPredicted if all predictions are cleared
  useEffect(() => {
    if (!hasAnyPredictions && showOnlyPredicted) {
      setShowOnlyPredicted(false);
    }
  }, [hasAnyPredictions, showOnlyPredicted]);

  // Selection mode for AI prediction batching
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedGameIdsForAi, setSelectedGameIdsForAi] = useState<string[]>([]);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Betting options from backend
  const [bettingOptions, setBettingOptions] = useState<BettingOption[]>([]);

  // Active game for modal picker
  const [activeGameForPicker, setActiveGameForPicker] = useState<UpcomingGame | null>(null);

  // Filter games based on predictions filter and search query
  const filteredGames = useMemo(() => {
    let list = games;
    if (showOnlyPredicted) {
      list = list.filter((g) => (gameSelections[g.id] || []).length > 0);
    }
    return filterGamesBySearchQuery(list, searchQuery);
  }, [games, searchQuery, showOnlyPredicted, gameSelections]);

  // Group filtered games into sections by competition
  const sections = useMemo(() => {
    return groupGamesByCompetition(filteredGames);
  }, [filteredGames]);

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
  const [previewScheduledTime, setPreviewScheduledTime] = useState<string | undefined>(undefined);
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

  // Fetch games whenever selectedDate changes (uses session cache if date is already loaded)
  useEffect(() => {
    loadGamesForDate(selectedDate, true, false);
  }, [selectedDate]);

  // Handle device back action to cancel selection mode if active
  useEffect(() => {
    if (!isSelectionMode) return;

    const onBackPress = () => {
      setIsSelectionMode(false);
      setSelectedGameIdsForAi([]);
      return true; // Prevents default back navigation / exiting the app
    };

    const backSubscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

    return () => {
      backSubscription.remove();
    };
  }, [isSelectionMode]);

  const loadGamesForDate = async (
    dateStr: string,
    showLoadingIndicator = true,
    forceRefresh = false
  ) => {
    // If not forcing refresh and games for this date exist in session cache, use them instantly!
    if (!forceRefresh && sessionStore.hasGames(dateStr)) {
      const cached = sessionStore.getGames(dateStr) || [];
      setGames(cached);
      setFetchError(null);
      setIsLoadingGames(false);
      return;
    }

    if (showLoadingIndicator) {
      setIsLoadingGames(true);
    }
    setFetchError(null);

    try {
      const fetched = await mobileApi.fetchGames(dateStr, userTimezone);
      sessionStore.setGames(dateStr, fetched);
      setGames(fetched);
    } catch (err: any) {
      setFetchError(err?.message || 'Could not load matches from server');
      if (forceRefresh || !sessionStore.hasGames(dateStr)) {
        setGames([]);
      }
    } finally {
      setIsLoadingGames(false);
    }
  };

  const handlePullToRefresh = async () => {
    setIsRefreshing(true);
    await loadGamesForDate(selectedDate, false, true);
    setIsRefreshing(false);
  };

  // Date Navigation
  const isLeftArrowBlocked = !canGoBackDate(selectedDate);
  const displayDateLabel = formatNavDisplayDate(selectedDate);

  const handlePreviousDay = () => {
    if (canGoBackDate(selectedDate)) {
      setSelectedDate(getPreviousDayString(selectedDate));
      setSelectedGameIdsForAi([]);
      setIsSelectionMode(false);
      setShowOnlyPredicted(false);
      setSearchQuery('');
    }
  };

  const handleNextDay = () => {
    setSelectedDate(getNextDayString(selectedDate));
    setSelectedGameIdsForAi([]);
    setIsSelectionMode(false);
    setShowOnlyPredicted(false);
    setSearchQuery('');
  };

  // Long press on a game enables selection mode and selects this game
  const handleLongPressGame = (gameId: string) => {
    triggerHaptic();
    setIsSelectionMode(true);
    setSelectedGameIdsForAi((prev) => {
      if (prev.includes(gameId)) {
        return prev;
      }
      if (prev.length >= 10) {
        Alert.alert('Limit Reached', 'You can select at most 10 games for AI prediction.');
        return prev;
      }
      return [...prev, gameId];
    });
  };

  const handleToggleSelectForAi = (gameId: string) => {
    setSelectedGameIdsForAi((prev) => {
      let next: string[];
      if (prev.includes(gameId)) {
        next = prev.filter((id) => id !== gameId);
      } else {
        if (prev.length >= 10) {
          Alert.alert('Limit Reached', 'You can select at most 10 games for AI prediction.');
          return prev;
        }
        next = [...prev, gameId];
      }

      // When no game is selected, disable selection mode automatically
      if (next.length === 0) {
        setIsSelectionMode(false);
      }
      return next;
    });
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
        description: settings.description,
        scheduledPostTime: settings.scheduledPostTime
      });

      setPreviewJobId(res.jobId);
      setPreviewGroupId(res.groupId);
      setPreviewDescription(settings.description);
      setPreviewThumbTime(settings.thumbnailTimestamp);
      setPreviewScheduledTime(settings.scheduledPostTime);
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
          scheduledPostTime={previewScheduledTime}
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
      {/* Search Bar: Placed at the top */}
      {!isLoadingGames && !fetchError && games.length > 0 && (
        <View style={styles.searchContainer}>
          <View style={[styles.searchBar, isSearchFocused && styles.searchBarFocused]}>
            <Text style={[styles.searchIcon, isSearchFocused && styles.searchIconFocused]}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search teams, clubs or leagues..."
              placeholderTextColor="#64748b"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <View style={styles.searchRightActions}>
                <View style={styles.searchCountBadge}>
                  <Text style={styles.searchCountText}>
                    {filteredGames.length}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.clearSearchBtn}
                  onPress={() => setSearchQuery('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.clearSearchText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Top Controls Row: Date Navigation on Left, Selection AI Actions on Right */}
      <View style={styles.topControlsRow}>
        {/* Date Change Section with Left/Right Arrows */}
        <View style={styles.dateNavSection}>
          <TouchableOpacity
            style={[styles.arrowButton, isLeftArrowBlocked && styles.arrowButtonDisabled]}
            onPress={handlePreviousDay}
            disabled={isLeftArrowBlocked}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.6}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={isLeftArrowBlocked ? THEME.colors.textMuted : THEME.colors.primary}
            />
          </TouchableOpacity>

          <View style={styles.dateBadge}>
            <Text style={styles.dateBadgeText}>{displayDateLabel}</Text>
          </View>

          <TouchableOpacity
            style={styles.arrowButton}
            onPress={handleNextDay}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.6}
          >
            <Ionicons
              name="chevron-forward"
              size={22}
              color={THEME.colors.primary}
            />
          </TouchableOpacity>
        </View>

        {/* Right Section: When selecting, show Cancel + AI; otherwise show Filter Predicted button */}
        {isSelectionMode ? (
          <View style={styles.selectionSection}>
            <TouchableOpacity
              style={styles.cancelSelectionBtn}
              onPress={() => {
                setIsSelectionMode(false);
                setSelectedGameIdsForAi([]);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelSelectionText}>✕ Cancel</Text>
            </TouchableOpacity>

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
          </View>
        ) : (
          <View style={styles.selectionSection}>
            <TouchableOpacity
              style={[
                styles.filterPredictedBtn,
                showOnlyPredicted && styles.filterPredictedBtnActive,
                !hasAnyPredictions && styles.filterPredictedBtnDisabled
              ]}
              onPress={() => {
                if (hasAnyPredictions) {
                  setShowOnlyPredicted(!showOnlyPredicted);
                }
              }}
              onLongPress={() => {
                triggerHaptic();
                setIsSelectionMode(true);
              }}
              delayLongPress={300}
              activeOpacity={hasAnyPredictions ? 0.7 : 0.9}
            >
              <Text style={styles.filterPredictedIcon}>🎯</Text>
              <Text
                style={[
                  styles.filterPredictedText,
                  showOnlyPredicted && styles.filterPredictedTextActive,
                  !hasAnyPredictions && styles.filterPredictedTextDisabled
                ]}
              >
                {showOnlyPredicted ? 'Predicted' : 'Predicted'}
              </Text>
              {hasAnyPredictions && (
                <View
                  style={[
                    styles.filterPredictedBadge,
                    showOnlyPredicted && styles.filterPredictedBadgeActive
                  ]}
                >
                  <Text
                    style={[
                      styles.filterPredictedBadgeText,
                      showOnlyPredicted && styles.filterPredictedBadgeTextActive
                    ]}
                  >
                    {gamesWithPredictions.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Main Content: Loading, Error, Empty List, Search Empty, or SectionList */}
      {isLoadingGames ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={THEME.colors.primary} />
          <Text style={styles.loadingText}>Loading scheduled matches...</Text>
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
            onPress={() => loadGamesForDate(selectedDate, true, true)}
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
            onPress={() => loadGamesForDate(selectedDate, true, true)}
            activeOpacity={0.7}
          >
            <Text style={styles.retryBtnText}>🔄 Refresh Fixtures</Text>
          </TouchableOpacity>
          <Text style={styles.pullHint}>Or pull down to refresh</Text>
        </ScrollView>
      ) : filteredGames.length === 0 ? (
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
          {showOnlyPredicted ? (
            <>
              <Text style={styles.emptyIcon}>🎯</Text>
              <Text style={styles.emptyTitle}>No Predictions Found</Text>
              <Text style={styles.emptyText}>
                {searchQuery.length > 0
                  ? `No predictions match "${searchQuery}".`
                  : 'No matches have predictions yet for this date.'}
              </Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => {
                  setShowOnlyPredicted(false);
                  setSearchQuery('');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.retryBtnText}>Show All Fixtures</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>No Matches Found</Text>
              <Text style={styles.emptyText}>
                No fixtures matching "{searchQuery}". Try searching for another team or league.
              </Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => setSearchQuery('')}
                activeOpacity={0.7}
              >
                <Text style={styles.retryBtnText}>✕ Clear Search</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={sections}
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
            <CompetitionCard
              section={item}
              gameSelections={gameSelections}
              selectedGameIdsForAi={selectedGameIdsForAi}
              selectionModeEnabled={isSelectionMode}
              onToggleSelectForAi={handleToggleSelectForAi}
              onLongPressGame={handleLongPressGame}
              onOpenPicker={setActiveGameForPicker}
              onRemoveSelection={handleRemoveSelection}
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

      {/* AI Loading Overlay */}
      <Modal
        visible={isGeneratingAi}
        transparent={true}
        animationType="fade"
        statusBarTranslucent={true}
        onRequestClose={() => {}}
      >
        <View style={styles.aiLoadingOverlay}>
          <View style={styles.aiLoadingCard}>
            <View style={styles.aiLoadingIconContainer}>
              <Ionicons name="sparkles" size={30} color={THEME.colors.primary} />
            </View>
            <ActivityIndicator size="large" color={THEME.colors.primary} style={styles.aiLoadingSpinner} />
            <Text style={styles.aiLoadingTitle}>Generating AI Predictions</Text>
            <Text style={styles.aiLoadingSubtitle}>
              Analyzing team stats and statistical betting models...
            </Text>
          </View>
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
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#070b16',
    borderBottomWidth: 1,
    borderColor: '#17223b'
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 24,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1.5,
    borderColor: '#1e293b'
  },
  searchBarFocused: {
    borderColor: THEME.colors.primary,
    backgroundColor: '#111e38'
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 10,
    opacity: 0.7
  },
  searchIconFocused: {
    opacity: 1
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 0
  },
  searchRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  searchCountBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155'
  },
  searchCountText: {
    color: THEME.colors.primary,
    fontSize: 11,
    fontWeight: 'bold'
  },
  clearSearchBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center'
  },
  clearSearchText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 13
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginTop: 5,
    marginBottom: 3,
    borderRadius: 5,
    borderLeftWidth: 2.5,
    borderLeftColor: THEME.colors.primary,
    borderWidth: 1,
    borderColor: '#1e293b'
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 6
  },
  sectionLogo: {
    width: 15,
    height: 15,
    marginRight: 5
  },
  sectionTrophy: {
    fontSize: 12,
    marginRight: 5
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1
  },
  sectionBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155'
  },
  sectionBadgeText: {
    color: THEME.colors.primary,
    fontSize: 9,
    fontWeight: 'bold'
  },
  dateNavSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0
  },
  arrowButton: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center'
  },
  arrowButtonDisabled: {
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
    gap: 8
  },
  cancelSelectionBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155'
  },
  cancelSelectionText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: 'bold'
  },
  filterPredictedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#1e293b',
    gap: 6
  },
  filterPredictedBtnActive: {
    backgroundColor: '#0369a1',
    borderColor: THEME.colors.primary
  },
  filterPredictedBtnDisabled: {
    backgroundColor: '#090e1a',
    borderColor: '#141d2e',
    opacity: 0.4
  },
  filterPredictedIcon: {
    fontSize: 13
  },
  filterPredictedText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700'
  },
  filterPredictedTextActive: {
    color: '#ffffff'
  },
  filterPredictedTextDisabled: {
    color: '#475569'
  },
  filterPredictedBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155'
  },
  filterPredictedBadgeActive: {
    backgroundColor: '#0284c7',
    borderColor: '#7dd3fc'
  },
  filterPredictedBadgeText: {
    color: THEME.colors.primary,
    fontSize: 10,
    fontWeight: 'bold'
  },
  filterPredictedBadgeTextActive: {
    color: '#ffffff'
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
    padding: 6,
    paddingBottom: 80
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
  },
  aiLoadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  aiLoadingCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#0f172a',
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12
  },
  aiLoadingIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)'
  },
  aiLoadingSpinner: {
    marginVertical: 14
  },
  aiLoadingTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 6
  },
  aiLoadingSubtitle: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18
  }
});
