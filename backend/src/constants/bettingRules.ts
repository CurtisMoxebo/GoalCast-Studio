export interface BettingOptionDefinition {
  id: string;
  category: 'RESULT' | 'GOALS' | 'CORNERS';
  code: string;
  label: string;
  spokenTemplate: string; // Dynamic format like "{homeTeam} to win or draw" or static like "Both teams to score"
  description?: string;
}

export interface BettingCategoryDefinition {
  id: 'RESULT' | 'GOALS' | 'CORNERS';
  title: string;
  description: string;
}

export const BETTING_RULES = {
  maxSelectionsPerGame: 2,
  maxGamesPredicted: 10,
  minGamesPredicted: 1,
} as const;

export const BETTING_CATEGORIES: BettingCategoryDefinition[] = [
  { id: 'RESULT', title: 'Result', description: 'Match outcome and double chance options' },
  { id: 'GOALS', title: 'Goals', description: 'Over/under totals, team goals, BTTS and scoring order' },
  { id: 'CORNERS', title: 'Corners', description: 'Match and team corner over/under totals' },
];

export const BETTING_OPTIONS: BettingOptionDefinition[] = [
  // --- RESULT OPTIONS ---
  { id: 'res_1', category: 'RESULT', code: '1', label: 'Home Win (1)', spokenTemplate: '{homeTeam} to win' },
  { id: 'res_2', category: 'RESULT', code: '2', label: 'Away Win (2)', spokenTemplate: '{awayTeam} to win' },
  { id: 'res_x', category: 'RESULT', code: 'X', label: 'Draw (X)', spokenTemplate: 'A draw between {homeTeam} and {awayTeam}' },
  { id: 'res_1x', category: 'RESULT', code: '1X', label: 'Home or Draw (1X)', spokenTemplate: '{homeTeam} to win or draw' },
  { id: 'res_x2', category: 'RESULT', code: 'X2', label: 'Draw or Away (X2)', spokenTemplate: '{awayTeam} to win or draw' },
  { id: 'res_12', category: 'RESULT', code: '12', label: 'Either Team to Win (12)', spokenTemplate: 'Either team to win' },
  { id: 'res_1dnb', category: 'RESULT', code: '1 DNB', label: 'Home Draw No Bet (1 DNB)', spokenTemplate: '{homeTeam} draw no bet' },
  { id: 'res_2dnb', category: 'RESULT', code: '2 DNB', label: 'Away Draw No Bet (2 DNB)', spokenTemplate: '{awayTeam} draw no bet' },

  // --- GOALS: BTTS ---
  { id: 'goal_btts_yes', category: 'GOALS', code: 'BTTS_YES', label: 'Both Teams to Score - Yes', spokenTemplate: 'Both teams to score' },
  { id: 'goal_btts_no', category: 'GOALS', code: 'BTTS_NO', label: 'Both Teams to Score - No', spokenTemplate: 'Both teams not to score' },

  // --- GOALS: First / Last Goal ---
  { id: 'goal_first_home', category: 'GOALS', code: 'FIRST_GOAL_HOME', label: 'Home to Score First', spokenTemplate: '{homeTeam} to score first' },
  { id: 'goal_first_away', category: 'GOALS', code: 'FIRST_GOAL_AWAY', label: 'Away to Score First', spokenTemplate: '{awayTeam} to score first' },
  { id: 'goal_last_home', category: 'GOALS', code: 'LAST_GOAL_HOME', label: 'Home to Score Last', spokenTemplate: '{homeTeam} to score last' },
  { id: 'goal_last_away', category: 'GOALS', code: 'LAST_GOAL_AWAY', label: 'Away to Score Last', spokenTemplate: '{awayTeam} to score last' },
];

// Helper to generate Over/Under goals options (0.5 to 9.5)
const goalTotals: number[] = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5];
for (const val of goalTotals) {
  BETTING_OPTIONS.push({
    id: `goal_over_${val}`.replace('.', '_'),
    category: 'GOALS',
    code: `OVER_${val}_GOALS`,
    label: `Total Goals Over ${val}`,
    spokenTemplate: `Over ${val} total goals`,
  });
  BETTING_OPTIONS.push({
    id: `goal_under_${val}`.replace('.', '_'),
    category: 'GOALS',
    code: `UNDER_${val}_GOALS`,
    label: `Total Goals Under ${val}`,
    spokenTemplate: `Under ${val} total goals`,
  });
}

// Helper to generate Home / Away team total goals options (0.5 to 6.5)
const teamGoalTotals: number[] = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5];
for (const val of teamGoalTotals) {
  BETTING_OPTIONS.push({
    id: `goal_home_over_${val}`.replace('.', '_'),
    category: 'GOALS',
    code: `HOME_OVER_${val}_GOALS`,
    label: `Home Team Over ${val} Goals`,
    spokenTemplate: `{homeTeam} over ${val} goals`,
  });
  BETTING_OPTIONS.push({
    id: `goal_home_under_${val}`.replace('.', '_'),
    category: 'GOALS',
    code: `HOME_UNDER_${val}_GOALS`,
    label: `Home Team Under ${val} Goals`,
    spokenTemplate: `{homeTeam} under ${val} goals`,
  });
  BETTING_OPTIONS.push({
    id: `goal_away_over_${val}`.replace('.', '_'),
    category: 'GOALS',
    code: `AWAY_OVER_${val}_GOALS`,
    label: `Away Team Over ${val} Goals`,
    spokenTemplate: `{awayTeam} over ${val} goals`,
  });
  BETTING_OPTIONS.push({
    id: `goal_away_under_${val}`.replace('.', '_'),
    category: 'GOALS',
    code: `AWAY_UNDER_${val}_GOALS`,
    label: `Away Team Under ${val} Goals`,
    spokenTemplate: `{awayTeam} under ${val} goals`,
  });
}

// Helper to generate Corners Over/Under (0.5 to 19.5 total)
const cornerTotals: number[] = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5, 18.5, 19.5];
for (const val of cornerTotals) {
  BETTING_OPTIONS.push({
    id: `corners_over_${val}`.replace('.', '_'),
    category: 'CORNERS',
    code: `OVER_${val}_CORNERS`,
    label: `Total Corners Over ${val}`,
    spokenTemplate: `Over ${val} corners`,
  });
  BETTING_OPTIONS.push({
    id: `corners_under_${val}`.replace('.', '_'),
    category: 'CORNERS',
    code: `UNDER_${val}_CORNERS`,
    label: `Total Corners Under ${val}`,
    spokenTemplate: `Under ${val} corners`,
  });
}

// Helper to generate Team Corners Over/Under (0.5 to 15.5)
const teamCornerTotals: number[] = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5];
for (const val of teamCornerTotals) {
  BETTING_OPTIONS.push({
    id: `corners_home_over_${val}`.replace('.', '_'),
    category: 'CORNERS',
    code: `HOME_OVER_${val}_CORNERS`,
    label: `Home Team Corners Over ${val}`,
    spokenTemplate: `{homeTeam} over ${val} corners`,
  });
  BETTING_OPTIONS.push({
    id: `corners_home_under_${val}`.replace('.', '_'),
    category: 'CORNERS',
    code: `HOME_UNDER_${val}_CORNERS`,
    label: `Home Team Corners Under ${val}`,
    spokenTemplate: `{homeTeam} under ${val} corners`,
  });
  BETTING_OPTIONS.push({
    id: `corners_away_over_${val}`.replace('.', '_'),
    category: 'CORNERS',
    code: `AWAY_OVER_${val}_CORNERS`,
    label: `Away Team Corners Over ${val}`,
    spokenTemplate: `{awayTeam} over ${val} corners`,
  });
  BETTING_OPTIONS.push({
    id: `corners_away_under_${val}`.replace('.', '_'),
    category: 'CORNERS',
    code: `AWAY_UNDER_${val}_CORNERS`,
    label: `Away Team Corners Under ${val}`,
    spokenTemplate: `{awayTeam} under ${val} corners`,
  });
}

/**
 * Format spoken text replacing {homeTeam} and {awayTeam}
 */
export function formatSpokenPrediction(template: string, homeTeam: string, awayTeam: string): string {
  return template.replace(/\{homeTeam\}/g, homeTeam).replace(/\{awayTeam\}/g, awayTeam);
}

/**
 * Find option by code
 */
export function findBettingOptionByCode(code: string): BettingOptionDefinition | undefined {
  return BETTING_OPTIONS.find((opt) => opt.code === code);
}
