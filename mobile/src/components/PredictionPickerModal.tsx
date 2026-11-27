import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';
import { UpcomingGame, PredictionSelection, BettingOption } from '../types';
import { getConflictingCodes } from '../utils/predictionUtils';
import { mobileApi } from '../services/api';

export { getConflictingCodes };

interface PredictionPickerModalProps {
  visible: boolean;
  game: UpcomingGame | null;
  currentSelections: PredictionSelection[];
  currentReason: string;
  availableOptions: BettingOption[];
  onClose: () => void;
  onConfirm: (selections: PredictionSelection[]) => void;
  onReasonChange: (reason: string) => void;
}

const GOAL_TOTALS = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5];
const TEAM_GOAL_TOTALS = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5];
const CORNER_TOTALS = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5, 18.5, 19.5];
const TEAM_CORNER_TOTALS = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5];


const RESULT_FALLBACKS: Record<string, { label: string; spokenTemplate: string }> = {
  '1': { label: 'Home Win', spokenTemplate: '{homeTeam} to win' },
  'X': { label: 'Draw', spokenTemplate: 'A draw between {homeTeam} and {awayTeam}' },
  '2': { label: 'Away Win', spokenTemplate: '{awayTeam} to win' },
  '1X': { label: 'Home or Draw', spokenTemplate: '{homeTeam} to win or draw' },
  'X2': { label: 'Away or Draw', spokenTemplate: '{awayTeam} to win or draw' },
  '12': { label: 'Home or Away', spokenTemplate: 'Either team to win' },
  '1 DNB': { label: 'Home Draw No Bet', spokenTemplate: '{homeTeam} draw no bet' },
  '2 DNB': { label: 'Away Draw No Bet', spokenTemplate: '{awayTeam} draw no bet' }
};

const GOALS_FALLBACKS: Record<string, { label: string; spokenTemplate: string }> = {
  BTTS_YES: { label: 'Both Teams to Score - Yes', spokenTemplate: 'Both teams to score' },
  BTTS_NO: { label: 'Both Teams to Score - No', spokenTemplate: 'Both teams not to score' },
  FIRST_GOAL_HOME: { label: 'Home to Score First', spokenTemplate: '{homeTeam} to score first' },
  FIRST_GOAL_AWAY: { label: 'Away to Score First', spokenTemplate: '{awayTeam} to score first' },
  LAST_GOAL_HOME: { label: 'Home to Score Last', spokenTemplate: '{homeTeam} to score last' },
  LAST_GOAL_AWAY: { label: 'Away to Score Last', spokenTemplate: '{awayTeam} to score last' }
};

for (const val of GOAL_TOTALS) {
  GOALS_FALLBACKS[`OVER_${val}_GOALS`] = {
    label: `Total Goals Over ${val}`,
    spokenTemplate: `Over ${val} total goals`
  };
  GOALS_FALLBACKS[`UNDER_${val}_GOALS`] = {
    label: `Total Goals Under ${val}`,
    spokenTemplate: `Under ${val} total goals`
  };
}

for (const val of TEAM_GOAL_TOTALS) {
  GOALS_FALLBACKS[`HOME_OVER_${val}_GOALS`] = {
    label: `Home Team Over ${val} Goals`,
    spokenTemplate: `{homeTeam} over ${val} goals`
  };
  GOALS_FALLBACKS[`HOME_UNDER_${val}_GOALS`] = {
    label: `Home Team Under ${val} Goals`,
    spokenTemplate: `{homeTeam} under ${val} goals`
  };
  GOALS_FALLBACKS[`AWAY_OVER_${val}_GOALS`] = {
    label: `Away Team Over ${val} Goals`,
    spokenTemplate: `{awayTeam} over ${val} goals`
  };
  GOALS_FALLBACKS[`AWAY_UNDER_${val}_GOALS`] = {
    label: `Away Team Under ${val} Goals`,
    spokenTemplate: `{awayTeam} under ${val} goals`
  };
}

const CORNERS_FALLBACKS: Record<string, { label: string; spokenTemplate: string }> = {};

for (const val of CORNER_TOTALS) {
  CORNERS_FALLBACKS[`OVER_${val}_CORNERS`] = {
    label: `Total Corners Over ${val}`,
    spokenTemplate: `Over ${val} corners`
  };
  CORNERS_FALLBACKS[`UNDER_${val}_CORNERS`] = {
    label: `Total Corners Under ${val}`,
    spokenTemplate: `Under ${val} corners`
  };
}

for (const val of TEAM_CORNER_TOTALS) {
  CORNERS_FALLBACKS[`HOME_OVER_${val}_CORNERS`] = {
    label: `Home Team Corners Over ${val}`,
    spokenTemplate: `{homeTeam} over ${val} corners`
  };
  CORNERS_FALLBACKS[`HOME_UNDER_${val}_CORNERS`] = {
    label: `Home Team Corners Under ${val}`,
    spokenTemplate: `{homeTeam} under ${val} corners`
  };
  CORNERS_FALLBACKS[`AWAY_OVER_${val}_CORNERS`] = {
    label: `Away Team Corners Over ${val}`,
    spokenTemplate: `{awayTeam} over ${val} corners`
  };
  CORNERS_FALLBACKS[`AWAY_UNDER_${val}_CORNERS`] = {
    label: `Away Team Corners Under ${val}`,
    spokenTemplate: `{awayTeam} under ${val} corners`
  };
}

export const PredictionPickerModal: React.FC<PredictionPickerModalProps> = ({
  visible,
  game,
  currentSelections,
  currentReason,
  availableOptions,
  onClose,
  onConfirm,
  onReasonChange
}) => {
  const [activeTab, setActiveTab] = useState<'RESULT' | 'GOALS' | 'CORNERS'>('RESULT');
  const [selectedCodes, setSelectedCodes] = useState<string[]>(
    currentSelections.map((s) => s.code)
  );
  const [isGeneratingReason, setIsGeneratingReason] = useState(false);

  // Sync state when modal becomes visible
  React.useEffect(() => {
    if (visible) {
      setSelectedCodes(currentSelections.map((s) => s.code));
      setIsGeneratingReason(false);
    }
  }, [visible, currentSelections]);

  if (!game) return null;

  const buildSelections = (codes: string[]): PredictionSelection[] => {
    return codes.map((code) => {
      const opt = availableOptions.find((o) => o.code === code);
      const resFallback = RESULT_FALLBACKS[code];
      const goalFallback = GOALS_FALLBACKS[code];
      const cornerFallback = CORNERS_FALLBACKS[code];
      const label = opt?.label || resFallback?.label || goalFallback?.label || cornerFallback?.label || code;
      const category: 'RESULT' | 'GOALS' | 'CORNERS' =
        opt?.category ||
        (code in RESULT_FALLBACKS
          ? 'RESULT'
          : code in GOALS_FALLBACKS
          ? 'GOALS'
          : 'CORNERS');

      let spokenText = opt?.spokenTemplate || resFallback?.spokenTemplate || goalFallback?.spokenTemplate || cornerFallback?.spokenTemplate || label;
      spokenText = spokenText
        .replace('{homeTeam}', game.homeTeam)
        .replace('{awayTeam}', game.awayTeam);

      return {
        code,
        label,
        category,
        spokenText
      };
    });
  };

  const updateSelectionsAndSave = (nextCodes: string[]) => {
    setSelectedCodes(nextCodes);
    onConfirm(buildSelections(nextCodes));
    if (nextCodes.length === 0 && currentReason) {
      onReasonChange('');
    }
  };

  const hasSelections = selectedCodes.length > 0;

  const handleGenerateAiReason = async () => {
    if (!hasSelections) {
      Alert.alert(
        'Prediction Required',
        'Please select at least 1 prediction before generating an AI reason.'
      );
      return;
    }

    setIsGeneratingReason(true);
    try {
      const selections = buildSelections(selectedCodes);
      const generatedReason = await mobileApi.requestPredictionReason(game, selections);
      if (generatedReason) {
        onReasonChange(generatedReason);
      }
    } catch (err: any) {
      Alert.alert('AI Reason Error', err?.message || 'Failed to generate AI reason');
    } finally {
      setIsGeneratingReason(false);
    }
  };

  const spokenPreview = (() => {
    const trimmed = currentReason.trim();
    if (!hasSelections || !trimmed) return '';
    const built = buildSelections(selectedCodes);
    const predText =
      built.length === 1
        ? built[0].spokenText
        : `${built[0].spokenText} and ${built[1].spokenText}`;
    const cleanedReason = trimmed.replace(/^because\s+/i, '');
    return `We expect ${predText} because ${cleanedReason}`;
  })();

  const toggleSelection = (code: string) => {
    // If already selected, deselect it
    if (selectedCodes.includes(code)) {
      const next = selectedCodes.filter((c) => c !== code);
      updateSelectionsAndSave(next);
      return;
    }

    // Find any conflicting selections (column-level in tables, or group-level in binary/result markets)
    const conflicts = getConflictingCodes(code, selectedCodes);
    if (conflicts.length > 0) {
      // Replace conflicting selection(s) without increasing total count
      const next = selectedCodes.filter((c) => !conflicts.includes(c)).concat(code);
      updateSelectionsAndSave(next);
      return;
    }

    // Not replacing an existing in-group selection; check 2-selection limit
    if (selectedCodes.length >= 2) {
      Alert.alert(
        'Maximum Reached',
        'You can make at most 2 betting predictions per match. Please deselect one first.'
      );
      return;
    }

    const next = [...selectedCodes, code];
    updateSelectionsAndSave(next);
  };

  const filteredOptions = availableOptions.filter((opt) => opt.category === activeTab);

  const renderOverUnderTable = (
    title: string,
    totals: number[],
    prefix: string,
    suffix: string = '_GOALS'
  ) => (
    <View style={styles.groupSection}>
      <Text style={styles.groupSectionTitle}>{title}</Text>
      <View style={styles.tableHeaderRow}>
        <View style={styles.tableHeaderCol}>
          <Text style={styles.tableHeaderTextOver}>OVER ↑</Text>
        </View>
        <View style={styles.tableHeaderCol}>
          <Text style={styles.tableHeaderTextUnder}>UNDER ↓</Text>
        </View>
      </View>

      {totals.map((val) => {
        const overCode = `${prefix}OVER_${val}${suffix}`;
        const underCode = `${prefix}UNDER_${val}${suffix}`;
        const isOverSelected = selectedCodes.includes(overCode);
        const isUnderSelected = selectedCodes.includes(underCode);

        return (
          <View key={val} style={styles.tableRow}>
            <TouchableOpacity
              style={[styles.tableCellBtn, isOverSelected && styles.tableCellBtnSelected]}
              onPress={() => toggleSelection(overCode)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tableCellText, isOverSelected && styles.tableCellTextSelected]}>
                {val}
              </Text>
              {isOverSelected && <View style={styles.tableCellActiveDot} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tableCellBtn, isUnderSelected && styles.tableCellBtnSelected]}
              onPress={() => toggleSelection(underCode)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tableCellText, isUnderSelected && styles.tableCellTextSelected]}>
                {val}
              </Text>
              {isUnderSelected && <View style={styles.tableCellActiveDot} />}
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Pick Betting Predictions</Text>
              <Text style={styles.subtitle}>
                {game.homeTeam} vs {game.awayTeam}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Selection counter badge */}
          <View style={styles.counterRow}>
            <Text style={styles.counterText}>
              Selected: <Text style={styles.counterHighlight}>{selectedCodes.length}/2 max</Text>
            </Text>
          </View>

          {/* Reason for Prediction (Spoken in Video) */}
          <View style={[styles.reasonCard, !hasSelections && styles.reasonCardDisabled]}>
            <View style={styles.reasonHeaderRow}>
              <Text style={styles.reasonTitle}>💬 Reason (Spoken in Video)</Text>
              <TouchableOpacity
                style={[
                  styles.aiReasonBtn,
                  (!hasSelections || isGeneratingReason) && styles.aiReasonBtnDisabled
                ]}
                onPress={handleGenerateAiReason}
                disabled={!hasSelections || isGeneratingReason}
                activeOpacity={0.75}
              >
                {isGeneratingReason ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <>
                    <Ionicons
                      name="sparkles"
                      size={13}
                      color={hasSelections ? '#000000' : THEME.colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.aiReasonBtnText,
                        !hasSelections && styles.aiReasonBtnTextDisabled
                      ]}
                    >
                      AI Reason
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {!hasSelections ? (
              <View style={styles.reasonLockedBox}>
                <Ionicons name="lock-closed-outline" size={14} color={THEME.colors.textMuted} />
                <Text style={styles.reasonLockedText}>
                  Select at least 1 prediction to write or generate a reason
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.reasonInputWrapper}>
                  <TextInput
                    style={styles.reasonInput}
                    value={currentReason}
                    onChangeText={onReasonChange}
                    placeholder="Optional: e.g. Arsenal have scored in 8 straight home matches"
                    placeholderTextColor={THEME.colors.textMuted}
                    multiline={true}
                    maxLength={240}
                    editable={hasSelections && !isGeneratingReason}
                  />
                  {currentReason.length > 0 && !isGeneratingReason && (
                    <TouchableOpacity
                      style={styles.reasonClearBtn}
                      onPress={() => onReasonChange('')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={18} color={THEME.colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
                {spokenPreview ? (
                  <Text style={styles.reasonPreviewText} numberOfLines={2}>
                    🗣️ "{spokenPreview}"
                  </Text>
                ) : null}
              </>
            )}
          </View>

          {/* Category Tabs: Result, Goals, Corners */}
          <View style={styles.tabBar}>
            {(['RESULT', 'GOALS', 'CORNERS'] as const).map((tab) => {
              const isActive = activeTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tabButton, isActive && styles.tabButtonActive]}
                  onPress={() => setActiveTab(tab)}
                >
                  <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                    {tab === 'RESULT' ? '🏆 Result' : tab === 'GOALS' ? '⚽ Goals' : '🚩 Corners'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Options Content */}
          <ScrollView style={styles.optionsList} contentContainerStyle={styles.optionsListContent}>
            {activeTab === 'RESULT' ? (
              <View style={styles.resultGroupsContainer}>
                {/* 1. Match Result (1X2) - 3 Buttons: [Home Win | Draw | Away Win] */}
                <View style={styles.groupSection}>
                  <Text style={styles.groupSectionTitle}>Match Result</Text>
                  <View style={styles.segmentedRow}>
                    {[
                      { code: '1', title: 'Home Win', subtitle: game.homeTeam },
                      { code: 'X', title: 'Draw', subtitle: 'Draw' },
                      { code: '2', title: 'Away Win', subtitle: game.awayTeam }
                    ].map((item) => {
                      const isSelected = selectedCodes.includes(item.code);
                      return (
                        <TouchableOpacity
                          key={item.code}
                          style={[styles.segmentBtn, isSelected && styles.segmentBtnSelected]}
                          onPress={() => toggleSelection(item.code)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[styles.segmentTitle, isSelected && styles.segmentTitleSelected]}
                            numberOfLines={2}
                          >
                            {item.title}
                          </Text>
                          <Text
                            style={[styles.segmentSubtitle, isSelected && styles.segmentSubtitleSelected]}
                            numberOfLines={1}
                          >
                            {item.subtitle}
                          </Text>
                          {isSelected && <View style={styles.segmentActiveDot} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* 2. Double Chance - 3 Buttons: [Home or Draw | Away or Draw | Home or Away] */}
                <View style={styles.groupSection}>
                  <Text style={styles.groupSectionTitle}>Double Chance</Text>
                  <View style={styles.segmentedRow}>
                    {[
                      { code: '1X', title: 'Home or Draw', codeBadge: '1X' },
                      { code: 'X2', title: 'Away or Draw', codeBadge: 'X2' },
                      { code: '12', title: 'Home or Away', codeBadge: '12' }
                    ].map((item) => {
                      const isSelected = selectedCodes.includes(item.code);
                      return (
                        <TouchableOpacity
                          key={item.code}
                          style={[styles.segmentBtn, isSelected && styles.segmentBtnSelected]}
                          onPress={() => toggleSelection(item.code)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[styles.segmentTitle, isSelected && styles.segmentTitleSelected]}
                            numberOfLines={2}
                          >
                            {item.title}
                          </Text>
                          <Text
                            style={[styles.segmentSubtitle, isSelected && styles.segmentSubtitleSelected]}
                            numberOfLines={1}
                          >
                            {item.codeBadge}
                          </Text>
                          {isSelected && <View style={styles.segmentActiveDot} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* 3. Draw No Bet - 2 Buttons: [Home Draw No Bet | Away Draw No Bet] */}
                <View style={styles.groupSection}>
                  <Text style={styles.groupSectionTitle}>Draw No Bet (DNB)</Text>
                  <View style={styles.segmentedRow}>
                    {[
                      { code: '1 DNB', title: 'Home Draw No Bet', subtitle: `${game.homeTeam}` },
                      { code: '2 DNB', title: 'Away Draw No Bet', subtitle: `${game.awayTeam}` }
                    ].map((item) => {
                      const isSelected = selectedCodes.includes(item.code);
                      return (
                        <TouchableOpacity
                          key={item.code}
                          style={[styles.segmentBtn, isSelected && styles.segmentBtnSelected]}
                          onPress={() => toggleSelection(item.code)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[styles.segmentTitle, isSelected && styles.segmentTitleSelected]}
                            numberOfLines={2}
                          >
                            {item.title}
                          </Text>
                          <Text
                            style={[styles.segmentSubtitle, isSelected && styles.segmentSubtitleSelected]}
                            numberOfLines={1}
                          >
                            {item.subtitle}
                          </Text>
                          {isSelected && <View style={styles.segmentActiveDot} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
            ) : activeTab === 'GOALS' ? (
              <View style={styles.resultGroupsContainer}>
                {/* 1. Both Teams to Score (BTTS) - 2 Buttons: [Yes | No] */}
                <View style={styles.groupSection}>
                  <Text style={styles.groupSectionTitle}>Both Teams to Score (BTTS)</Text>
                  <View style={styles.segmentedRow}>
                    {[
                      { code: 'BTTS_YES', title: 'Yes', subtitle: 'Both score' },
                      { code: 'BTTS_NO', title: 'No', subtitle: 'Clean sheet' }
                    ].map((item) => {
                      const isSelected = selectedCodes.includes(item.code);
                      return (
                        <TouchableOpacity
                          key={item.code}
                          style={[styles.segmentBtn, isSelected && styles.segmentBtnSelected]}
                          onPress={() => toggleSelection(item.code)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[styles.segmentTitle, isSelected && styles.segmentTitleSelected]}
                            numberOfLines={1}
                          >
                            {item.title}
                          </Text>
                          <Text
                            style={[styles.segmentSubtitle, isSelected && styles.segmentSubtitleSelected]}
                            numberOfLines={1}
                          >
                            {item.subtitle}
                          </Text>
                          {isSelected && <View style={styles.segmentActiveDot} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* 2. Team to Score First - 2 Buttons: [Home | Away] */}
                <View style={styles.groupSection}>
                  <Text style={styles.groupSectionTitle}>Team to Score First</Text>
                  <View style={styles.segmentedRow}>
                    {[
                      { code: 'FIRST_GOAL_HOME', title: 'Home', subtitle: game.homeTeam },
                      { code: 'FIRST_GOAL_AWAY', title: 'Away', subtitle: game.awayTeam }
                    ].map((item) => {
                      const isSelected = selectedCodes.includes(item.code);
                      return (
                        <TouchableOpacity
                          key={item.code}
                          style={[styles.segmentBtn, isSelected && styles.segmentBtnSelected]}
                          onPress={() => toggleSelection(item.code)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[styles.segmentTitle, isSelected && styles.segmentTitleSelected]}
                            numberOfLines={1}
                          >
                            {item.title}
                          </Text>
                          <Text
                            style={[styles.segmentSubtitle, isSelected && styles.segmentSubtitleSelected]}
                            numberOfLines={1}
                          >
                            {item.subtitle}
                          </Text>
                          {isSelected && <View style={styles.segmentActiveDot} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* 3. Team to Score Last - 2 Buttons: [Home | Away] */}
                <View style={styles.groupSection}>
                  <Text style={styles.groupSectionTitle}>Team to Score Last</Text>
                  <View style={styles.segmentedRow}>
                    {[
                      { code: 'LAST_GOAL_HOME', title: 'Home', subtitle: game.homeTeam },
                      { code: 'LAST_GOAL_AWAY', title: 'Away', subtitle: game.awayTeam }
                    ].map((item) => {
                      const isSelected = selectedCodes.includes(item.code);
                      return (
                        <TouchableOpacity
                          key={item.code}
                          style={[styles.segmentBtn, isSelected && styles.segmentBtnSelected]}
                          onPress={() => toggleSelection(item.code)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[styles.segmentTitle, isSelected && styles.segmentTitleSelected]}
                            numberOfLines={1}
                          >
                            {item.title}
                          </Text>
                          <Text
                            style={[styles.segmentSubtitle, isSelected && styles.segmentSubtitleSelected]}
                            numberOfLines={1}
                          >
                            {item.subtitle}
                          </Text>
                          {isSelected && <View style={styles.segmentActiveDot} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* 4. Total Goals Over / Under Table */}
                {renderOverUnderTable('Total Goals (Over / Under)', GOAL_TOTALS, '')}

                {/* 5. Home Team Goals Over / Under Table */}
                {renderOverUnderTable(`${game.homeTeam} Goals (Over / Under)`, TEAM_GOAL_TOTALS, 'HOME_')}

                {/* 6. Away Team Goals Over / Under Table */}
                {renderOverUnderTable(`${game.awayTeam} Goals (Over / Under)`, TEAM_GOAL_TOTALS, 'AWAY_')}
              </View>
            ) : (
              <View style={styles.resultGroupsContainer}>
                {/* 1. Total Corners (Over / Under) Table */}
                {renderOverUnderTable('Total Corners (Over / Under)', CORNER_TOTALS, '', '_CORNERS')}

                {/* 2. Home Team Corners Over / Under Table */}
                {renderOverUnderTable(`${game.homeTeam} Corners (Over / Under)`, TEAM_CORNER_TOTALS, 'HOME_', '_CORNERS')}

                {/* 3. Away Team Corners Over / Under Table */}
                {renderOverUnderTable(`${game.awayTeam} Corners (Over / Under)`, TEAM_CORNER_TOTALS, 'AWAY_', '_CORNERS')}
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end'
  },
  backdropTouch: {
    ...StyleSheet.absoluteFill
  },
  container: {
    backgroundColor: THEME.colors.cardBackground,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
    paddingTop: 20,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderColor: THEME.colors.cardBorder
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: THEME.colors.textPrimary
  },
  subtitle: {
    fontSize: 14,
    color: THEME.colors.primary,
    marginTop: 2
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center'
  },
  closeButtonText: {
    color: THEME.colors.textSecondary,
    fontSize: 16,
    fontWeight: 'bold'
  },
  counterRow: {
    paddingHorizontal: 20,
    marginBottom: 12
  },
  counterText: {
    fontSize: 13,
    color: THEME.colors.textSecondary
  },
  counterHighlight: {
    color: THEME.colors.accentGold,
    fontWeight: 'bold'
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderColor: THEME.colors.cardBorder
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderColor: 'transparent'
  },
  tabButtonActive: {
    borderColor: THEME.colors.primary
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.colors.textMuted
  },
  tabTextActive: {
    color: THEME.colors.primary,
    fontWeight: 'bold'
  },
  optionsList: {
    maxHeight: 380,
    paddingHorizontal: 16
  },
  optionsListContent: {
    paddingBottom: 20
  },
  resultGroupsContainer: {
    paddingBottom: 8
  },
  groupSection: {
    marginBottom: 16
  },
  groupSectionTitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: 8
  },
  segmentBtn: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderWidth: 1.5,
    borderColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
    position: 'relative'
  },
  segmentBtnSelected: {
    backgroundColor: '#0c4a6e',
    borderColor: THEME.colors.primary
  },
  segmentTitle: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 3
  },
  segmentTitleSelected: {
    color: '#ffffff'
  },
  segmentSubtitle: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center'
  },
  segmentSubtitleSelected: {
    color: '#7dd3fc'
  },
  segmentActiveDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.colors.accentGreen
  },
  tableHeaderRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
    paddingHorizontal: 2
  },
  tableHeaderCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4
  },
  tableHeaderTextOver: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  tableHeaderTextUnder: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  tableRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6
  },
  tableCellBtn: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#1e293b',
    position: 'relative'
  },
  tableCellBtnSelected: {
    backgroundColor: '#0c4a6e',
    borderColor: THEME.colors.primary
  },
  tableCellText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: 'bold'
  },
  tableCellTextSelected: {
    color: '#38bdf8'
  },
  tableCellActiveDot: {
    position: 'absolute',
    top: 5,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.colors.accentGreen
  },
  optionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: 'transparent'
  },
  optionCardSelected: {
    borderColor: THEME.colors.primary,
    backgroundColor: '#0c4a6e'
  },
  optionInfo: {
    flex: 1,
    marginRight: 10
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME.colors.textPrimary
  },
  optionLabelSelected: {
    color: '#38bdf8'
  },
  optionCode: {
    fontSize: 12,
    color: THEME.colors.textMuted,
    marginTop: 2
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: THEME.colors.textMuted,
    justifyContent: 'center',
    alignItems: 'center'
  },
  checkboxSelected: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary
  },
  checkmark: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '900'
  },
  reasonCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1e293b'
  },
  reasonCardDisabled: {
    opacity: 0.72
  },
  reasonHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  reasonTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4
  },
  aiReasonBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: THEME.colors.accentGold,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    minWidth: 88,
    justifyContent: 'center'
  },
  aiReasonBtnDisabled: {
    backgroundColor: '#1e293b'
  },
  aiReasonBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000000'
  },
  aiReasonBtnTextDisabled: {
    color: THEME.colors.textMuted
  },
  reasonLockedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#131d2f',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  reasonLockedText: {
    fontSize: 12,
    color: THEME.colors.textMuted,
    flex: 1
  },
  reasonInputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#334155'
  },
  reasonInput: {
    flex: 1,
    color: THEME.colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    minHeight: 36,
    maxHeight: 74,
    padding: 0,
    textAlignVertical: 'top'
  },
  reasonClearBtn: {
    marginLeft: 6,
    marginTop: 2
  },
  reasonPreviewText: {
    marginTop: 6,
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic'
  }
});
