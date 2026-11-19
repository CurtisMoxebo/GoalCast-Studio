import test from 'node:test';
import assert from 'node:assert/strict';
import { formatOrdinalDate } from '../utils/dateUtils';

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
  if (payload.thumbnailTimestamp < 0 || payload.thumbnailTimestamp > 20) {
    errors.push('Thumbnail frame must be between 00:00 and 00:20');
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

  // Invalid thumbnail timestamp (> 20s)
  const rThumb = validateVideoJobPayload({
    games: [{ id: 'g_1' }],
    thumbnailTimestamp: 25.0,
    description: 'test'
  });
  assert.equal(rThumb.valid, false);
  assert.ok(rThumb.errors.some((e) => e.includes('between 00:00 and 00:20')));

  // Valid payload with default 3.0s thumbnail
  const rValid = validateVideoJobPayload({
    games: [{ id: 'g_1' }, { id: 'g_2' }],
    thumbnailTimestamp: 3.0,
    description: `Football predictions for ${formatOrdinalDate('2026-11-20')} ⚽🔥`
  });
  assert.equal(rValid.valid, true);
  assert.equal(rValid.errors.length, 0);
});
