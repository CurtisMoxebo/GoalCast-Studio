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

  const toggleSelection = (code: string) => {
    if (selectedCodes.includes(code)) {
      setSelectedCodes(selectedCodes.filter((c) => c !== code));
    } else {
      if (selectedCodes.length >= 2) {
        Alert.alert(
          'Maximum Reached',
          'You can make at most 2 betting predictions per match. Please deselect one first.'
        );
        return;
      }
      setSelectedCodes([...selectedCodes, code]);
    }
  };

  const handleConfirm = () => {
    const finalSelections: PredictionSelection[] = selectedCodes.map((code) => {
      const opt = availableOptions.find((o) => o.code === code);
      return {
        code,
        label: opt?.label || code,
        category: opt?.category || activeTab,
        spokenText: opt?.label || code
      };
    });
    onConfirm(finalSelections);
    onClose();
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

          {/* Options Grid */}
          <ScrollView style={styles.optionsList} contentContainerStyle={styles.optionsListContent}>
            {filteredOptions.map((opt) => {
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
            })}
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
              <Text style={styles.confirmBtnText}>
                Confirm ({selectedCodes.length})
              </Text>
            </TouchableOpacity>
          </View>
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
  container: {
    backgroundColor: THEME.colors.cardBackground,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
    paddingTop: 20,
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
  footer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderColor: THEME.colors.cardBorder,
    backgroundColor: THEME.colors.tabBarBackground
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    marginRight: 10,
    borderRadius: 12,
    backgroundColor: '#1e293b'
  },
  cancelBtnText: {
    color: THEME.colors.textSecondary,
    fontSize: 15,
    fontWeight: '600'
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: THEME.colors.primary
  },
  confirmBtnText: {
    color: '#020617',
    fontSize: 15,
    fontWeight: 'bold'
  }
});
