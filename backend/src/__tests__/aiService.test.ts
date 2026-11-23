import test from 'node:test';
import assert from 'node:assert/strict';
import { getAIService } from '../services/ai/aiFactory';
import { MockAIService } from '../services/ai/mockAiService';
import { findBettingOptionByCode } from '../constants/bettingRules';
import { buildUpcomingGamesPrompt } from '../services/ai/geminiAiService';
import { SUPPORTED_LEAGUES } from '../services/fixtures/realFixturesService';

test('Regression: AI Factory fallback to MockAIService when no key configured', () => {
  const originalKey = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    const ai = getAIService();
    assert.ok(ai, 'AI service instance must be returned');
    assert.ok(typeof ai.fetchUpcomingGames === 'function');
    assert.ok(typeof ai.generatePredictions === 'function');
    assert.ok(typeof ai.validatePreviousPredictions === 'function');
  } finally {
    process.env.GEMINI_API_KEY = originalKey;
  }
});

test('Regression: Mock AI fetches upcoming games schema', async () => {
  const mockAI = new MockAIService();
  const games = await mockAI.fetchUpcomingGames('2026-11-20', 'America/New_York');

  assert.ok(Array.isArray(games));
  assert.ok(games.length >= 2, 'Should return multiple matches');

  const competitions = games.map((g) => g.competition);
  assert.ok(competitions.includes('Saudi Pro League'), 'Must support Saudi Pro League fixtures');
  assert.ok(competitions.includes('MLS'), 'Must support MLS fixtures');

  for (const game of games) {
    assert.ok(game.id, 'Game must have unique id');
    assert.ok(game.homeTeam, 'Game must have homeTeam');
    assert.ok(game.awayTeam, 'Game must have awayTeam');
    assert.ok(game.competition, 'Game must have competition');
    assert.ok(game.kickoffTime, 'Game must have ISO kickoffTime');
    assert.doesNotThrow(() => new Date(game.kickoffTime), 'Kickoff time must be a valid parseable date');
  }
});

test('Regression: Mock AI prediction generation complies with betting catalog and limits', async () => {
  const mockAI = new MockAIService();
  const sampleGames = [
    {
      id: 'game_1',
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      competition: 'Premier League',
      kickoffTime: '2026-11-20T17:30:00Z'
    },
    {
      id: 'game_2',
      homeTeam: 'Al-Hilal',
      awayTeam: 'Al-Nassr',
      competition: 'Saudi Pro League',
      kickoffTime: '2026-11-20T18:00:00Z'
    }
  ];

  const results = await mockAI.generatePredictions(sampleGames);
  assert.equal(results.length, sampleGames.length);

  for (const res of results) {
    assert.ok(res.predictions.length <= 2, 'At most 2 selections allowed per game');
    assert.ok(res.predictions.length >= 1, 'At least 1 prediction returned');

    for (const pred of res.predictions) {
      const validOpt = findBettingOptionByCode(pred.code);
      assert.ok(validOpt, `Prediction code "${pred.code}" must exist in BETTING_OPTIONS`);
      assert.equal(pred.category, validOpt?.category);
      assert.ok(pred.spokenText.length > 0, 'Spoken text must not be empty');
    }
  }
});

test('Regression: AI past predictions validation', async () => {
  const mockAI = new MockAIService();
  const pastGames = [
    {
      homeTeam: 'Real Madrid',
      awayTeam: 'Barcelona',
      kickoffTime: '2026-11-18T20:00:00Z',
      selections: [{ code: '1X', label: 'Home or Draw', category: 'RESULT' }]
    }
  ];

  const result = await mockAI.validatePreviousPredictions(pastGames);
  assert.equal(typeof result.isHit, 'boolean');
  assert.ok(typeof result.notes === 'string' && result.notes.length > 0);
});

test('AI Prompt: buildUpcomingGamesPrompt explicitly includes Saudi Arabia competitions and AFC Championship', () => {
  const prompt = buildUpcomingGamesPrompt('2026-11-25', 'America/New_York');

  assert.ok(prompt.includes('AFC Champions League / AFC Championship'), 'Prompt must include AFC Champions League / AFC Championship');
  assert.ok(prompt.includes('Saudi Pro League'), 'Prompt must include Saudi Pro League');
  assert.ok(prompt.includes('King Cup of Champions'), 'Prompt must include King Cup of Champions');
  assert.ok(prompt.includes('Saudi Super Cup'), 'Prompt must include Saudi Super Cup');
  assert.ok(prompt.includes('Al-Hilal') && prompt.includes('Al-Nassr'), 'Prompt must reference prominent Saudi clubs');
});

test('RealFixturesService: SUPPORTED_LEAGUES includes AFC Champions League and Saudi competitions', () => {
  const leagueCodes = SUPPORTED_LEAGUES.map((l) => l.code);
  assert.ok(leagueCodes.includes('afc.champions'), 'Must support AFC Champions League Elite');
  assert.ok(leagueCodes.includes('afc.cup'), 'Must support AFC Champions League Two');
  assert.ok(leagueCodes.includes('ksa.1'), 'Must support Saudi Pro League');
});
