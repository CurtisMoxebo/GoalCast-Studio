import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { THEME } from '../constants/theme';
import { UpcomingGame, PredictionSelection } from '../types';
import { formatKickoffTime } from '../utils/dateUtils';

interface GameCardProps {
  game: UpcomingGame;
  selections: PredictionSelection[];
  isSelectedForAi: boolean;
  selectionModeEnabled: boolean;
  onToggleSelectForAi: () => void;
  onOpenPicker: () => void;
  onRemoveSelection: (code: string) => void;
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  selections,
  isSelectedForAi,
  selectionModeEnabled,
  onToggleSelectForAi,
  onOpenPicker,
  onRemoveSelection
}) => {
  const kickoff = formatKickoffTime(game.kickoffTime);
  const [homeLogoError, setHomeLogoError] = useState(false);
  const [awayLogoError, setAwayLogoError] = useState(false);

  return (
    <View style={[styles.card, isSelectedForAi && styles.cardSelectedForAi]}>
      {/* Selection mode checkbox in top-right */}
      {selectionModeEnabled && (
        <TouchableOpacity
          style={[styles.aiCheckboxTopRight, isSelectedForAi && styles.aiCheckboxActive]}
          onPress={onToggleSelectForAi}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {isSelectedForAi && <Text style={styles.aiCheckboxCheck}>✓</Text>}
        </TouchableOpacity>
      )}

      {/* Teams Section with Kickoff Time in place of VS */}
      <View style={styles.teamsRow}>
        {/* Home Team */}
        <View style={styles.teamColumn}>
          {game.homeTeamLogo && !homeLogoError ? (
            <Image
              source={{ uri: game.homeTeamLogo }}
              style={styles.teamLogo}
              resizeMode="contain"
              onError={() => setHomeLogoError(true)}
            />
          ) : (
            <View style={styles.teamLogoPlaceholder}>
              <Text style={styles.teamInitials}>{game.homeTeam.substring(0, 2).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={2}>
            {game.homeTeam}
          </Text>
        </View>

        {/* Kickoff Time in place of VS */}
        <View style={styles.timeCenterContainer}>
          <View style={styles.timeCenterBadge}>
            <Text style={styles.timeCenterText}>{kickoff}</Text>
          </View>
        </View>

        {/* Away Team */}
        <View style={styles.teamColumn}>
          {game.awayTeamLogo && !awayLogoError ? (
            <Image
              source={{ uri: game.awayTeamLogo }}
              style={styles.teamLogo}
              resizeMode="contain"
              onError={() => setAwayLogoError(true)}
            />
          ) : (
            <View style={styles.teamLogoPlaceholder}>
              <Text style={styles.teamInitials}>{game.awayTeam.substring(0, 2).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={2}>
            {game.awayTeam}
          </Text>
        </View>
      </View>

      {/* Prediction Badges or Prompt */}
      <View style={styles.selectionsArea}>
        {selections.length > 0 ? (
          <View style={styles.badgeRow}>
            {selections.map((sel) => (
              <View key={sel.code} style={styles.predictionBadge}>
                <Text style={styles.badgeLabel} numberOfLines={1}>
                  {sel.label}
                </Text>
                <TouchableOpacity
                  onPress={() => onRemoveSelection(sel.code)}
                  style={styles.badgeRemove}
                >
                  <Text style={styles.badgeRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.noSelectionsText}>No prediction selected</Text>
        )}

        {/* Predict / Edit Button */}
        <TouchableOpacity style={styles.predictBtn} onPress={onOpenPicker}>
          <Text style={styles.predictBtnText}>
            {selections.length > 0 ? 'Edit Picks' : '➕ Predict'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: THEME.colors.cardBackground,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    position: 'relative'
  },
  cardSelectedForAi: {
    borderColor: THEME.colors.primary,
    backgroundColor: '#0c2438'
  },
  aiCheckboxTopRight: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: THEME.colors.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
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
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2
  },
  teamColumn: {
    flex: 1,
    alignItems: 'center'
  },
  teamLogo: {
    width: 34,
    height: 34,
    marginBottom: 4
  },
  teamLogoPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4
  },
  teamInitials: {
    color: THEME.colors.primary,
    fontWeight: 'bold',
    fontSize: 12
  },
  teamName: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
    textAlign: 'center',
    lineHeight: 16
  },
  timeCenterContainer: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2
  },
  timeCenterBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 50
  },
  timeCenterText: {
    color: THEME.colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3
  },
  selectionsArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: '#1e293b'
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    marginRight: 8
  },
  predictionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0c4a6e',
    borderColor: THEME.colors.primary,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
    marginBottom: 2
  },
  badgeLabel: {
    color: '#e0f2fe',
    fontSize: 11,
    fontWeight: 'bold',
    maxWidth: 110
  },
  badgeRemove: {
    marginLeft: 4,
    padding: 2
  },
  badgeRemoveText: {
    color: '#f87171',
    fontSize: 10,
    fontWeight: 'bold'
  },
  noSelectionsText: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    fontStyle: 'italic',
    flex: 1
  },
  predictBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: THEME.colors.primary
  },
  predictBtnText: {
    color: THEME.colors.primary,
    fontSize: 11,
    fontWeight: 'bold'
  }
});
