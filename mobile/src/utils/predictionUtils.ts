/**
 * Utility functions for betting prediction selection and conflicts.
 */

/**
 * Determine all conflicting selections for a given code:
 * 1. Fixed market groups: [1, X, 2], [1X, X2, 12], [1 DNB, 2 DNB], [BTTS_YES, BTTS_NO], [FIRST_GOAL_HOME, FIRST_GOAL_AWAY], [LAST_GOAL_HOME, LAST_GOAL_AWAY]
 * 2. Over/Under tables: only ONE selection allowed across all options in a column (e.g. Total Goals Over),
 *    plus row exclusivity (opposite on same line).
 */
export function getConflictingCodes(code: string, currentSelected: string[]): string[] {
  const conflicts: string[] = [];

  const FIXED_GROUPS: string[][] = [
    ['1', 'X', '2'],
    ['1X', 'X2', '12'],
    ['1 DNB', '2 DNB'],
    ['BTTS_YES', 'BTTS_NO'],
    ['FIRST_GOAL_HOME', 'FIRST_GOAL_AWAY'],
    ['LAST_GOAL_HOME', 'LAST_GOAL_AWAY']
  ];

  for (const group of FIXED_GROUPS) {
    if (group.includes(code)) {
      for (const c of currentSelected) {
        if (group.includes(c) && c !== code) {
          conflicts.push(c);
        }
      }
      return conflicts;
    }
  }

  // Parse table options: (HOME_|AWAY_|)(OVER|UNDER)_(val)(_GOALS|_CORNERS)
  const match = code.match(/^(HOME_|AWAY_|)(OVER|UNDER)_([0-9.]+)(_GOALS|_CORNERS)$/);
  if (match) {
    const [, prefix, type, val, suffix] = match;
    const oppositeType = type === 'OVER' ? 'UNDER' : 'OVER';
    const sameRowOppositeCode = `${prefix}${oppositeType}_${val}${suffix}`;

    for (const c of currentSelected) {
      if (c === code) continue;

      // Column-level exclusivity: only one selection allowed in the entire column of this table
      const cMatch = c.match(/^(HOME_|AWAY_|)(OVER|UNDER)_([0-9.]+)(_GOALS|_CORNERS)$/);
      if (cMatch) {
        const [, cPrefix, cType, , cSuffix] = cMatch;
        if (cPrefix === prefix && cType === type && cSuffix === suffix) {
          conflicts.push(c);
          continue;
        }
      }

      // Row-level exclusivity: opposite option on the same threshold
      if (c === sameRowOppositeCode) {
        conflicts.push(c);
      }
    }
  }

  return conflicts;
}
