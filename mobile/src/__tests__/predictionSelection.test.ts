import test from 'node:test';
import assert from 'node:assert/strict';
import { formatOrdinalDate } from '../utils/dateUtils';
import { getConflictingCodes } from '../utils/predictionUtils';

interface Selection {
  code: string;
  label: string;
}

function addSelectionToGame(
  current: Selection[],
  newSel: Selection,
  maxPerGame = 2
): { success: boolean; selections: Selection[]; error?: string } {
  if (current.some((s) => s.code === newSel.code)) {
    // Toggle off
    return {
      success: true,
      selections: current.filter((s) => s.code !== newSel.code)
    };
  }

  if (current.length >= maxPerGame) {
    return {
      success: false,
      selections: current,
      error: `Maximum of ${maxPerGame} selections allowed per match`
    };
  }

  return {
    success: true,
    selections: [...current, newSel]
  };
}

function toggleExclusiveSelection(
  current: string[],
  code: string,
  maxPerGame = 2
): { success: boolean; selected: string[]; error?: string } {
  if (current.includes(code)) {
    return { success: true, selected: current.filter((c) => c !== code) };
  }

  const conflicts = getConflictingCodes(code, current);
  if (conflicts.length > 0) {
    return {
      success: true,
      selected: current.filter((c) => !conflicts.includes(c)).concat(code)
    };
  }

  if (current.length >= maxPerGame) {
    return {
      success: false,
      selected: current,
      error: `Maximum of ${maxPerGame} selections allowed per match`
    };
  }

  return { success: true, selected: [...current, code] };
}

function validateVideoJobPayload(payload: {
  games: any[];
  thumbnailTimestamp: number;
  description: string;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!payload.games || payload.games.length === 0) {
    errors.push('At least 1 game prediction is required');
  }
  if (payload.games && payload.games.length > 10) {
    errors.push('Maximum 10 games allowed per video');
  }
  if (payload.thumbnailTimestamp < 0 || payload.thumbnailTimestamp > 60) {
    errors.push('Thumbnail frame must be between 00:00 and 01:00');
  }
  if (!payload.description || payload.description.trim().length === 0) {
    errors.push('Description cannot be empty');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

test('Mobile Regression: Add selection enforces max 2 per game', () => {
  let selections: Selection[] = [];

  // 1st selection
  const res1 = addSelectionToGame(selections, { code: 'BTTS_YES', label: 'BTTS' });
  assert.equal(res1.success, true);
  selections = res1.selections;
  assert.equal(selections.length, 1);

  // 2nd selection
  const res2 = addSelectionToGame(selections, { code: '1X', label: 'Home or Draw' });
  assert.equal(res2.success, true);
  selections = res2.selections;
  assert.equal(selections.length, 2);

  // 3rd selection rejected
  const res3 = addSelectionToGame(selections, { code: 'OVER_2_5_GOALS', label: 'Over 2.5' });
  assert.equal(res3.success, false);
  assert.ok(res3.error?.includes('Maximum of 2 selections'));
  assert.equal(res3.selections.length, 2);

  // Deselect 1st selection
  const resDeselect = addSelectionToGame(selections, { code: 'BTTS_YES', label: 'BTTS' });
  assert.equal(resDeselect.success, true);
  selections = resDeselect.selections;
  assert.equal(selections.length, 1);
});

test('Mobile Regression: Validate video job constraints', () => {
  // Empty games
  const rEmpty = validateVideoJobPayload({
    games: [],
    thumbnailTimestamp: 3.0,
    description: 'test'
  });
  assert.equal(rEmpty.valid, false);
  assert.ok(rEmpty.errors.some((e) => e.includes('At least 1 game')));

  // Over 10 games
  const elevenGames = Array.from({ length: 11 }, (_, i) => ({ id: `g_${i}` }));
  const rOver = validateVideoJobPayload({
    games: elevenGames,
    thumbnailTimestamp: 3.0,
    description: 'test'
  });
  assert.equal(rOver.valid, false);
  assert.ok(rOver.errors.some((e) => e.includes('Maximum 10 games')));

  // Invalid thumbnail timestamp (> 60s)
  const rThumb = validateVideoJobPayload({
    games: [{ id: 'g_1' }],
    thumbnailTimestamp: 65.0,
    description: 'test'
  });
  assert.equal(rThumb.valid, false);
  assert.ok(rThumb.errors.some((e) => e.includes('between 00:00 and 01:00')));

  // Valid thumbnail timestamp at 45.0s (within 0-60s)
  const rThumb45 = validateVideoJobPayload({
    games: [{ id: 'g_1' }],
    thumbnailTimestamp: 45.0,
    description: 'test'
  });
  assert.equal(rThumb45.valid, true);

  // Valid payload with default 3.0s thumbnail
  const rValid = validateVideoJobPayload({
    games: [{ id: 'g_1' }, { id: 'g_2' }],
    thumbnailTimestamp: 3.0,
    description: `Football predictions for ${formatOrdinalDate('2026-11-20')} ⚽🔥`
  });
  assert.equal(rValid.valid, true);
  assert.equal(rValid.errors.length, 0);
});

test('Mobile Regression: Mutually exclusive button groups [1|X|2], [1X|X2|12], [1 DNB|2 DNB]', () => {
  let selected: string[] = [];

  // Group 1: [Home Win (1) | Draw (X) | Away Win (2)]
  const step1 = toggleExclusiveSelection(selected, '1');
  assert.equal(step1.success, true);
  assert.deepEqual(step1.selected, ['1']);

  // Tapping 'X' swaps '1' -> only 1 can be selected at a time in this group
  const step2 = toggleExclusiveSelection(step1.selected, 'X');
  assert.equal(step2.success, true);
  assert.deepEqual(step2.selected, ['X']);

  // Group 2: [Home or Draw (1X) | Away or Draw (X2) | Home or Away (12)]
  // User selects '1X' alongside 'X' (total 2 selections)
  const step3 = toggleExclusiveSelection(step2.selected, '1X');
  assert.equal(step3.success, true);
  assert.deepEqual(step3.selected, ['X', '1X']);

  // User taps 'X2' in Group 2 -> swaps '1X' to 'X2' without exceeding max 2
  const step4 = toggleExclusiveSelection(step3.selected, 'X2');
  assert.equal(step4.success, true);
  assert.deepEqual(step4.selected, ['X', 'X2']);

  // User tries to select from Group 3 [1 DNB | 2 DNB] while having 2 selections -> rejected
  const step5 = toggleExclusiveSelection(step4.selected, '1 DNB');
  assert.equal(step5.success, false);
  assert.ok(step5.error?.includes('Maximum of 2 selections'));

  // Deselect 'X'
  const step6 = toggleExclusiveSelection(step4.selected, 'X');
  assert.equal(step6.success, true);
  assert.deepEqual(step6.selected, ['X2']);

  // Group 3: [Home Draw No Bet (1 DNB) | Away Draw No Bet (2 DNB)]
  const step7 = toggleExclusiveSelection(step6.selected, '1 DNB');
  assert.equal(step7.success, true);
  assert.deepEqual(step7.selected, ['X2', '1 DNB']);

  // Tapping '2 DNB' swaps '1 DNB' -> only 1 can be selected at a time in Group 3
  const step8 = toggleExclusiveSelection(step7.selected, '2 DNB');
  assert.equal(step8.success, true);
  assert.deepEqual(step8.selected, ['X2', '2 DNB']);
});

test('Mobile Regression: Goals section mutually exclusive groups and over/under table rows', () => {
  let selected: string[] = [];

  // 1. Both Teams to Score: [BTTS_YES | BTTS_NO]
  const btts1 = toggleExclusiveSelection(selected, 'BTTS_YES');
  assert.equal(btts1.success, true);
  assert.deepEqual(btts1.selected, ['BTTS_YES']);

  // Tapping BTTS_NO swaps BTTS_YES
  const btts2 = toggleExclusiveSelection(btts1.selected, 'BTTS_NO');
  assert.equal(btts2.success, true);
  assert.deepEqual(btts2.selected, ['BTTS_NO']);

  // 2. Total Goals Over/Under: selecting Over 2.5 on row 2.5
  const ou1 = toggleExclusiveSelection(btts2.selected, 'OVER_2.5_GOALS');
  assert.equal(ou1.success, true);
  assert.deepEqual(ou1.selected, ['BTTS_NO', 'OVER_2.5_GOALS']);

  // Tapping Under 2.5 on the same row swaps Over 2.5 to Under 2.5 without exceeding max 2
  const ou2 = toggleExclusiveSelection(ou1.selected, 'UNDER_2.5_GOALS');
  assert.equal(ou2.success, true);
  assert.deepEqual(ou2.selected, ['BTTS_NO', 'UNDER_2.5_GOALS']);

  // Deselect BTTS
  const clearBtts = toggleExclusiveSelection(ou2.selected, 'BTTS_NO');
  assert.equal(clearBtts.success, true);
  assert.deepEqual(clearBtts.selected, ['UNDER_2.5_GOALS']);

  // 3. Home Team Goals Over/Under row 1.5
  const homeOu1 = toggleExclusiveSelection(clearBtts.selected, 'HOME_OVER_1.5_GOALS');
  assert.equal(homeOu1.success, true);
  assert.deepEqual(homeOu1.selected, ['UNDER_2.5_GOALS', 'HOME_OVER_1.5_GOALS']);

  // Swapping to Home Under 1.5 on that row
  const homeOu2 = toggleExclusiveSelection(homeOu1.selected, 'HOME_UNDER_1.5_GOALS');
  assert.equal(homeOu2.success, true);
  assert.deepEqual(homeOu2.selected, ['UNDER_2.5_GOALS', 'HOME_UNDER_1.5_GOALS']);
});

test('Mobile Regression: Corners section over/under tables row-level mutual exclusivity', () => {
  let selected: string[] = [];

  // Total Corners: select Over 9.5
  const step1 = toggleExclusiveSelection(selected, 'OVER_9.5_CORNERS');
  assert.equal(step1.success, true);
  assert.deepEqual(step1.selected, ['OVER_9.5_CORNERS']);

  // Tapping Under 9.5 on that same row swaps Over 9.5 to Under 9.5
  const step2 = toggleExclusiveSelection(step1.selected, 'UNDER_9.5_CORNERS');
  assert.equal(step2.success, true);
  assert.deepEqual(step2.selected, ['UNDER_9.5_CORNERS']);

  // Selecting Away Corners Over 4.5
  const step3 = toggleExclusiveSelection(step2.selected, 'AWAY_OVER_4.5_CORNERS');
  assert.equal(step3.success, true);
  assert.deepEqual(step3.selected, ['UNDER_9.5_CORNERS', 'AWAY_OVER_4.5_CORNERS']);

  // Swapping Away Over 4.5 to Away Under 4.5 on that row without exceeding max 2
  const step4 = toggleExclusiveSelection(step3.selected, 'AWAY_UNDER_4.5_CORNERS');
  assert.equal(step4.success, true);
  assert.deepEqual(step4.selected, ['UNDER_9.5_CORNERS', 'AWAY_UNDER_4.5_CORNERS']);

  // Deselecting Away Under 4.5
  const step5 = toggleExclusiveSelection(step4.selected, 'AWAY_UNDER_4.5_CORNERS');
  assert.equal(step5.success, true);
  assert.deepEqual(step5.selected, ['UNDER_9.5_CORNERS']);
});

test('Mobile Regression: Column-level exclusivity across all Over/Under tables', () => {
  let selected: string[] = [];

  // 1. Total Goals Table - Over column
  // Select Over 0.5 Goals
  const gOver1 = toggleExclusiveSelection(selected, 'OVER_0.5_GOALS');
  assert.equal(gOver1.success, true);
  assert.deepEqual(gOver1.selected, ['OVER_0.5_GOALS']);

  // Tap Over 2.5 Goals -> replaces Over 0.5 Goals in the same column!
  const gOver2 = toggleExclusiveSelection(gOver1.selected, 'OVER_2.5_GOALS');
  assert.equal(gOver2.success, true);
  assert.deepEqual(gOver2.selected, ['OVER_2.5_GOALS']);

  // Tap Over 3.5 Goals -> replaces Over 2.5 Goals
  const gOver3 = toggleExclusiveSelection(gOver2.selected, 'OVER_3.5_GOALS');
  assert.equal(gOver3.success, true);
  assert.deepEqual(gOver3.selected, ['OVER_3.5_GOALS']);

  // 2. Total Goals Table - Under column
  // Select Under 1.5 Goals alongside Over 3.5 (2 selections max per match)
  const gUnder1 = toggleExclusiveSelection(gOver3.selected, 'UNDER_1.5_GOALS');
  assert.equal(gUnder1.success, true);
  assert.deepEqual(gUnder1.selected, ['OVER_3.5_GOALS', 'UNDER_1.5_GOALS']);

  // Tap Under 3.5 Goals -> row conflict with Over 3.5 AND column conflict with Under 1.5
  // Swapping column Under 1.5 -> Under 3.5, and Under 3.5 also conflicts with Over 3.5 on row
  const gUnder2 = toggleExclusiveSelection(gUnder1.selected, 'UNDER_2.5_GOALS');
  assert.equal(gUnder2.success, true);
  assert.deepEqual(gUnder2.selected, ['OVER_3.5_GOALS', 'UNDER_2.5_GOALS']);

  // Clear selections
  selected = [];

  // 3. Total Corners Table - Over column
  const cOver1 = toggleExclusiveSelection(selected, 'OVER_8.5_CORNERS');
  assert.equal(cOver1.success, true);
  assert.deepEqual(cOver1.selected, ['OVER_8.5_CORNERS']);

  // Tap Over 10.5 Corners -> replaces Over 8.5 Corners
  const cOver2 = toggleExclusiveSelection(cOver1.selected, 'OVER_10.5_CORNERS');
  assert.equal(cOver2.success, true);
  assert.deepEqual(cOver2.selected, ['OVER_10.5_CORNERS']);

  // 4. Away Team Corners Table - Under column
  const acUnder1 = toggleExclusiveSelection(cOver2.selected, 'AWAY_UNDER_4.5_CORNERS');
  assert.equal(acUnder1.success, true);
  assert.deepEqual(acUnder1.selected, ['OVER_10.5_CORNERS', 'AWAY_UNDER_4.5_CORNERS']);

  // Tap Away Under 6.5 Corners -> replaces Away Under 4.5 Corners in that column
  const acUnder2 = toggleExclusiveSelection(acUnder1.selected, 'AWAY_UNDER_6.5_CORNERS');
  assert.equal(acUnder2.success, true);
  assert.deepEqual(acUnder2.selected, ['OVER_10.5_CORNERS', 'AWAY_UNDER_6.5_CORNERS']);
});

