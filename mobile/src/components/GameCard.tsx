import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, Image, StyleSheet } from 'react-native';
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
    <Pressable
      style={({ pressed }) => [
        styles.card,
        isSelectedForAi && styles.cardSelectedForAi,
        pressed && styles.cardPressed
      ]}
      android_ripple={{ color: 'rgba(56, 189, 248, 0.15)' }}
      onPress={() => {
        if (selectionModeEnabled) {
          onToggleSelectForAi();
        } else {
          onOpenPicker();
        }
      }}
    >
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
          <Text style={styles.teamName} numberOfLines={1}>
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
          <Text style={styles.teamName} numberOfLines={1}>
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
                  onPress={(e) => {
                    // @ts-ignore
                    e?.stopPropagation?.();
                    onRemoveSelection(sel.code);
                  }}
                  style={styles.badgeRemove}
                >
                  <Text style={styles.badgeRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.noSelectionsText}>Tap match to make predictions</Text>
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: THEME.colors.cardBackground,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 5,
    borderWidth: 1,
    borderColor: THEME.colors.cardBorder,
    position: 'relative'
  },
  cardSelectedForAi: {
    borderColor: THEME.colors.primary,
    backgroundColor: '#0c2438'
  },
  cardPressed: {
    backgroundColor: '#13233a',
    opacity: 0.85
  },
  aiCheckboxTopRight: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 18,
    height: 18,
    borderRadius: 4,
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
    fontSize: 10,
    fontWeight: 'bold'
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 1
  },
  teamColumn: {
    flex: 1,
    alignItems: 'center'
  },
  teamLogo: {
    width: 24,
    height: 24,
    marginBottom: 2
  },
  teamLogoPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2
  },
  teamInitials: {
    color: THEME.colors.primary,
    fontWeight: 'bold',
    fontSize: 10
  },
  teamName: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
    textAlign: 'center'
  },
  timeCenterContainer: {
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2
  },
  timeCenterBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44
  },
  timeCenterText: {
    color: THEME.colors.primary,
    fontSize: 10,
    fontWeight: 'bold'
  },
  selectionsArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
    paddingTop: 5,
    borderTopWidth: 1,
    borderColor: '#1e293b'
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    marginRight: 6
  },
  predictionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0c4a6e',
    borderColor: THEME.colors.primary,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginRight: 3,
    marginBottom: 2
  },
  badgeLabel: {
    color: '#e0f2fe',
    fontSize: 10,
    fontWeight: 'bold',
    maxWidth: 100
  },
  badgeRemove: {
    marginLeft: 3,
    padding: 1
  },
  badgeRemoveText: {
    color: '#f87171',
    fontSize: 9,
    fontWeight: 'bold'
  },
  noSelectionsText: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    fontStyle: 'italic',
    flex: 1
  }
});
