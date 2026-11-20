import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { UpcomingGame, PredictionSelection } from '../types';
import { THEME } from '../constants/theme';
import { formatMatchDate, formatMatchTime } from '../utils/dateUtils';
import { CompetitionSection } from '../utils/gameUtils';

interface CompetitionCardProps {
  section: CompetitionSection;
  gameSelections: Record<string, PredictionSelection[]>;
  selectedGameIdsForAi: string[];
  selectionModeEnabled: boolean;
  onToggleSelectForAi: (gameId: string) => void;
  onOpenPicker: (game: UpcomingGame) => void;
  onRemoveSelection: (gameId: string, code: string) => void;
}

export const CompetitionCard: React.FC<CompetitionCardProps> = ({
  section,
  gameSelections,
  selectedGameIdsForAi,
  selectionModeEnabled,
  onToggleSelectForAi,
  onOpenPicker,
  onRemoveSelection
}) => {
  const [logoError, setLogoError] = useState(false);

  return (
    <View style={styles.cardContainer}>
      {/* Competition Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {section.logo && !logoError ? (
            <Image
              source={{ uri: section.logo }}
              style={styles.compLogo}
              resizeMode="contain"
              onError={() => setLogoError(true)}
            />
          ) : (
            <View style={styles.compLogoPlaceholder}>
              <Text style={styles.compLogoIcon}>🏆</Text>
            </View>
          )}
          <View style={styles.headerTextCol}>
            <Text style={styles.compTitle} numberOfLines={1}>
              {section.title}
            </Text>
            <Text style={styles.compRegion} numberOfLines={1}>
              {section.region}
            </Text>
          </View>
        </View>

        {/* Match Count Badge */}
        <View style={styles.matchCountBadge}>
          <Text style={styles.matchCountText}>{section.data.length}</Text>
        </View>
      </View>

      {/* Matches List inside Competition Card */}
      {section.data.map((match, index) => {
        const matchDate = formatMatchDate(match.kickoffTime);
        const matchTime = formatMatchTime(match.kickoffTime);
        const selections = gameSelections[match.id] || [];
        const isSelectedForAi = selectedGameIdsForAi.includes(match.id);
        const hasPredictions = selections.length > 0;

        return (
          <View
            key={match.id}
            style={[
              styles.matchRow,
              index > 0 && styles.matchRowBorder,
              isSelectedForAi && styles.matchRowSelected
            ]}
          >
            {/* Left Column: Date & Time */}
            <View style={styles.timeCol}>
              <Text style={styles.dateText}>{matchDate}</Text>
              <Text style={styles.timeText}>{matchTime}</Text>
            </View>

            {/* Middle Column: Stacked Teams */}
            <View style={styles.teamsCol}>
              {/* Home Team */}
              <View style={styles.teamLine}>
                {match.homeTeamLogo ? (
                  <Image
                    source={{ uri: match.homeTeamLogo }}
                    style={styles.teamCrest}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.teamCrestPlaceholder}>
                    <Text style={styles.teamCrestInitials}>
                      {match.homeTeam.substring(0, 2).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={styles.teamName} numberOfLines={1}>
                  {match.homeTeam}
                </Text>
              </View>

              {/* Away Team */}
              <View style={styles.teamLine}>
                {match.awayTeamLogo ? (
                  <Image
                    source={{ uri: match.awayTeamLogo }}
                    style={styles.teamCrest}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.teamCrestPlaceholder}>
                    <Text style={styles.teamCrestInitials}>
                      {match.awayTeam.substring(0, 2).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={styles.teamName} numberOfLines={1}>
                  {match.awayTeam}
                </Text>
              </View>

              {/* Prediction Badges (if any selected) */}
              {hasPredictions && (
                <View style={styles.predictionPillsRow}>
                  {selections.map((sel) => (
                    <View key={sel.code} style={styles.predictionPill}>
                      <Text style={styles.predictionPillText} numberOfLines={1}>
                        {sel.code}
                      </Text>
                      <TouchableOpacity
                        onPress={() => onRemoveSelection(match.id, sel.code)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        style={styles.pillRemove}
                      >
                        <Text style={styles.pillRemoveText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Right Column: AI Checkbox (in selection mode) & Predict Button */}
            <View style={styles.actionsCol}>
              {selectionModeEnabled && (
                <TouchableOpacity
                  style={[styles.aiCheckbox, isSelectedForAi && styles.aiCheckboxActive]}
                  onPress={() => onToggleSelectForAi(match.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {isSelectedForAi && <Text style={styles.aiCheckboxCheck}>✓</Text>}
                </TouchableOpacity>
              )}

              {/* Predict Button (replaces the bell button) */}
              <TouchableOpacity
                style={[
                  styles.predictButton,
                  hasPredictions && styles.predictButtonActive
                ]}
                onPress={() => onOpenPicker(match)}
                activeOpacity={0.7}
              >
                {hasPredictions ? (
                  <Text style={styles.predictButtonTextActive}>🎯</Text>
                ) : (
                  <Text style={styles.predictButtonText}>🔮</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#0c1322',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden'
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderColor: '#192438'
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10
  },
  compLogo: {
    width: 28,
    height: 28,
    marginRight: 10
  },
  compLogoPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  compLogoIcon: {
    fontSize: 15
  },
  headerTextCol: {
    flex: 1
  },
  compTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700'
  },
  compRegion: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500'
  },
  matchCountBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155'
  },
  matchCountText: {
    color: THEME.colors.primary,
    fontSize: 11,
    fontWeight: 'bold'
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  matchRowBorder: {
    borderTopWidth: 1,
    borderColor: '#172236'
  },
  matchRowSelected: {
    backgroundColor: '#092138'
  },
  timeCol: {
    width: 68,
    justifyContent: 'center'
  },
  dateText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2
  },
  timeText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600'
  },
  teamsCol: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 6
  },
  teamLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2
  },
  teamCrest: {
    width: 18,
    height: 18,
    marginRight: 8
  },
  teamCrestPlaceholder: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8
  },
  teamCrestInitials: {
    color: THEME.colors.primary,
    fontSize: 9,
    fontWeight: 'bold'
  },
  teamName: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600',
    flex: 1
  },
  predictionPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 4
  },
  predictionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0c4a6e',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: THEME.colors.primary
  },
  predictionPillText: {
    color: '#e0f2fe',
    fontSize: 10,
    fontWeight: 'bold'
  },
  pillRemove: {
    marginLeft: 4,
    padding: 1
  },
  pillRemoveText: {
    color: '#f87171',
    fontSize: 9,
    fontWeight: 'bold'
  },
  actionsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 6
  },
  aiCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: THEME.colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b'
  },
  aiCheckboxActive: {
    backgroundColor: THEME.colors.accentGreen,
    borderColor: THEME.colors.accentGreen
  },
  aiCheckboxCheck: {
    color: '#000000',
    fontSize: 12,
    fontWeight: 'bold'
  },
  predictButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#172236',
    borderWidth: 1,
    borderColor: '#24344d',
    alignItems: 'center',
    justifyContent: 'center'
  },
  predictButtonActive: {
    backgroundColor: '#0369a1',
    borderColor: THEME.colors.primary
  },
  predictButtonText: {
    fontSize: 16
  },
  predictButtonTextActive: {
    fontSize: 16
  }
});
