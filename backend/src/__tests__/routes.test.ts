import test from 'node:test';
import assert from 'node:assert/strict';
import { BETTING_OPTIONS, BETTING_RULES, findBettingOptionByCode } from '../constants/bettingRules';
import { assetsManager } from '../services/video/assetsManager';

test('Betting Rules & Options validation', () => {
  assert.equal(BETTING_RULES.maxSelectionsPerGame, 2);
  assert.equal(BETTING_RULES.maxGamesPredicted, 10);
  assert.ok(BETTING_OPTIONS.length > 50, 'Options catalog should contain Result, Goals, and Corner options');

  const btts = findBettingOptionByCode('BTTS_YES');
  assert.ok(btts);
  assert.equal(btts.category, 'GOALS');

  const homeWin = findBettingOptionByCode('1');
  assert.ok(homeWin);
  assert.equal(homeWin.category, 'RESULT');
});

test('Assets Manager discovery', () => {
  const videos = assetsManager.getAvailableBackgroundVideos();
  const audio = assetsManager.getAvailableBackgroundAudio();
  const sfx = assetsManager.getSoundEffects();

  assert.ok(Array.isArray(videos), 'Should return array of videos');
  assert.ok(Array.isArray(audio), 'Should return array of audio');
  assert.ok(sfx.swoosh.includes('swoosh.mp3'));
  assert.ok(sfx.celebration.includes('celebration.mp3'));
});
