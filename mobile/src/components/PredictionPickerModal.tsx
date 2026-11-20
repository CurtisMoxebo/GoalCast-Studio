import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert
} from 'react-native';
import { THEME } from '../constants/theme';
import { UpcomingGame, PredictionSelection, BettingOption } from '../types';

interface PredictionPickerModalProps {
  visible: boolean;
  game: UpcomingGame | null;
  currentSelections: PredictionSelection[];
  availableOptions: BettingOption[];
  onClose: () => void;
  onConfirm: (selections: PredictionSelection[]) => void;
}

// Mutually exclusive button groups: only one can be selected at a time per group
const EXCLUSIVE_GROUPS: string[][] = [
  ['1', 'X', '2'],              // [Home Win | Draw | Away Win]
  ['1X', 'X2', '12'],           // [Home or Draw | Away or Draw | Home or Away]
  ['1 DNB', '2 DNB']            // [Home Draw No Bet | Away Draw No Bet]
];

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

export const PredictionPickerModal: React.FC<PredictionPickerModalProps> = ({
  visible,
  game,
  currentSelections,
  availableOptions,
  onClose,
  onConfirm
}) => {
  const [activeTab, setActiveTab] = useState<'RESULT' | 'GOALS' | 'CORNERS'>('RESULT');
  const [selectedCodes, setSelectedCodes] = useState<string[]>(
    currentSelections.map((s) => s.code)
  );

  // Sync state when modal becomes visible
  React.useEffect(() => {
    if (visible) {
      setSelectedCodes(currentSelections.map((s) => s.code));
    }
  }, [visible, currentSelections]);

  if (!game) return null;

  const buildSelections = (codes: string[]): PredictionSelection[] => {
    return codes.map((code) => {
      const opt = availableOptions.find((o) => o.code === code);
      const fallback = RESULT_FALLBACKS[code];
      const label = opt?.label || fallback?.label || code;
      const category = opt?.category || (code in RESULT_FALLBACKS ? 'RESULT' : activeTab);

      let spokenText = opt?.spokenTemplate || fallback?.spokenTemplate || label;
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
  };

  const toggleSelection = (code: string) => {
    // If already selected, deselect it
    if (selectedCodes.includes(code)) {
      const next = selectedCodes.filter((c) => c !== code);
      updateSelectionsAndSave(next);
      return;
    }

    // Check if code belongs to a mutually exclusive group
    const group = EXCLUSIVE_GROUPS.find((g) => g.includes(code));
    if (group) {
      const existingInGroup = group.find((c) => selectedCodes.includes(c));
      if (existingInGroup) {
        // Replace existing selection in this group without changing total count
        const next = selectedCodes.map((c) => (c === existingInGroup ? code : c));
        updateSelectionsAndSave(next);
        return;
      }
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

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
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
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selectedCodes.includes(opt.code);
                return (
                  <TouchableOpacity
                    key={opt.code}
                    style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                    onPress={() => toggleSelection(opt.code)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.optionInfo}>
                      <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                        {opt.label}
                      </Text>
                      <Text style={styles.optionCode}>{opt.code}</Text>
                    </View>
                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
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
  }
});
