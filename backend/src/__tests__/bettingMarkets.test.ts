import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BETTING_CATEGORIES,
  BETTING_OPTIONS,
  BETTING_RULES,
  findBettingOptionByCode,
  formatSpokenPrediction
} from '../constants/bettingRules';

test('Regression: Betting Categories structure', () => {
  assert.equal(BETTING_CATEGORIES.length, 3);
  const ids = BETTING_CATEGORIES.map((c) => c.id);
  assert.ok(ids.includes('RESULT'));
  assert.ok(ids.includes('GOALS'));
  assert.ok(ids.includes('CORNERS'));
});

test('Regression: Result markets completeness', () => {
  const expectedCodes = ['1', '2', 'X', '1X', 'X2', '12', '1 DNB', '2 DNB'];
  for (const code of expectedCodes) {
    const opt = findBettingOptionByCode(code);
    assert.ok(opt, `Option with code "${code}" must exist in betting rules`);
    assert.equal(opt?.category, 'RESULT');
    assert.ok(opt?.spokenTemplate.length > 0);
  }
});

test('Regression: Goal markets completeness', () => {
  // BTTS
  assert.ok(findBettingOptionByCode('BTTS_YES'));
  assert.ok(findBettingOptionByCode('BTTS_NO'));

  // First / Last goal
  assert.ok(findBettingOptionByCode('FIRST_GOAL_HOME'));
  assert.ok(findBettingOptionByCode('FIRST_GOAL_AWAY'));
  assert.ok(findBettingOptionByCode('LAST_GOAL_HOME'));
  assert.ok(findBettingOptionByCode('LAST_GOAL_AWAY'));

  // Over / Under goals totals from 0.5 to 9.5
  const goalTotals = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5];
  for (const val of goalTotals) {
    assert.ok(findBettingOptionByCode(`OVER_${val}_GOALS`), `OVER_${val}_GOALS must exist`);
    assert.ok(findBettingOptionByCode(`UNDER_${val}_GOALS`), `UNDER_${val}_GOALS must exist`);
  }

  // Home / Away team goals from 0.5 to 6.5
  const teamTotals = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5];
  for (const val of teamTotals) {
    assert.ok(findBettingOptionByCode(`HOME_OVER_${val}_GOALS`));
    assert.ok(findBettingOptionByCode(`HOME_UNDER_${val}_GOALS`));
    assert.ok(findBettingOptionByCode(`AWAY_OVER_${val}_GOALS`));
    assert.ok(findBettingOptionByCode(`AWAY_UNDER_${val}_GOALS`));
  }
});

test('Regression: Corner markets completeness', () => {
  // Total corners 0.5 to 19.5
  for (let c = 0.5; c <= 19.5; c += 1.0) {
    assert.ok(findBettingOptionByCode(`OVER_${c}_CORNERS`), `OVER_${c}_CORNERS must exist`);
    assert.ok(findBettingOptionByCode(`UNDER_${c}_CORNERS`), `UNDER_${c}_CORNERS must exist`);
  }

  // Team corners 0.5 to 15.5
  for (let c = 0.5; c <= 15.5; c += 1.0) {
    assert.ok(findBettingOptionByCode(`HOME_OVER_${c}_CORNERS`));
    assert.ok(findBettingOptionByCode(`HOME_UNDER_${c}_CORNERS`));
    assert.ok(findBettingOptionByCode(`AWAY_OVER_${c}_CORNERS`));
    assert.ok(findBettingOptionByCode(`AWAY_UNDER_${c}_CORNERS`));
  }
});

test('Regression: Betting constraints rules', () => {
  assert.equal(BETTING_RULES.maxSelectionsPerGame, 2);
  assert.equal(BETTING_RULES.maxGamesPredicted, 10);
  assert.equal(BETTING_RULES.minGamesPredicted, 1);
});

test('Regression: Spoken prediction template interpolation', () => {
  const template = '{homeTeam} to win or draw against {awayTeam}';
  const spoken = formatSpokenPrediction(template, 'Liverpool', 'Real Madrid');
  assert.equal(spoken, 'Liverpool to win or draw against Real Madrid');

  // Static templates without placeholders
  const staticTemplate = 'Both teams to score';
  assert.equal(formatSpokenPrediction(staticTemplate, 'A', 'B'), 'Both teams to score');
});
