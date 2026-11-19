import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { overlayGenerator } from '../services/video/overlayGenerator';

test('Regression: OverlayGenerator generates Intro Table PNG with correct dimensions', async () => {
  const tmpDir = path.join(os.tmpdir(), 'goalcast_tests_overlay');
  const outputPath = path.join(tmpDir, 'test_intro_table.png');

  const games = [
    {
      homeTeam: 'Arsenal & Friends',
      awayTeam: 'Chelsea <FC>',
      competition: 'Premier League',
      kickoffTime: '2026-11-20T17:30:00Z',
      selections: [{ code: '1X', label: 'Home or Draw', spokenText: 'Arsenal to win or draw' }]
    },
    {
      homeTeam: 'Real Madrid',
      awayTeam: 'Barcelona "El Clasico"',
      competition: 'La Liga',
      kickoffTime: '2026-11-20T20:00:00Z',
      selections: [{ code: 'BTTS_YES', label: 'BTTS - Yes', spokenText: 'Both teams to score' }]
    }
  ];

  await overlayGenerator.generateTableOverlay(games, '2026-11-20', outputPath);

  assert.ok(fs.existsSync(outputPath), 'Output PNG must exist on disk');
  const metadata = await sharp(outputPath).metadata();
  assert.equal(metadata.width, 1080, 'Canvas width must be 1080');
  assert.equal(metadata.height, 1920, 'Canvas height must be 1920');
  assert.equal(metadata.format, 'png', 'Format must be PNG');

  // Clean up
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
});

test('Regression: OverlayGenerator generates Celebration Table PNG with confetti', async () => {
  const tmpDir = path.join(os.tmpdir(), 'goalcast_tests_overlay');
  const outputPath = path.join(tmpDir, 'test_celebration_table.png');

  const games = [
    {
      homeTeam: 'Liverpool',
      awayTeam: 'Man City',
      competition: 'Premier League',
      kickoffTime: '2026-11-18T17:30:00Z',
      selections: [{ code: '1', label: 'Liverpool to Win', spokenText: 'Liverpool to win' }]
    }
  ];

  await overlayGenerator.generateCelebrationTableOverlay(games, outputPath);

  assert.ok(fs.existsSync(outputPath), 'Celebration PNG must exist on disk');
  const metadata = await sharp(outputPath).metadata();
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 1920);

  // Clean up
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
});

test('Regression: OverlayGenerator generates Match Card PNG with prediction highlight', async () => {
  const tmpDir = path.join(os.tmpdir(), 'goalcast_tests_overlay');
  const outputPath = path.join(tmpDir, 'test_match_card.png');

  const game = {
    homeTeam: 'Al-Hilal',
    awayTeam: 'Al-Nassr',
    competition: 'Saudi Pro League',
    kickoffTime: '2026-11-20T18:00:00Z'
  };

  await overlayGenerator.generateMatchCardOverlay(game, 1, 3, 'Both Teams to Score', outputPath);

  assert.ok(fs.existsSync(outputPath), 'Match card PNG must exist on disk');
  const metadata = await sharp(outputPath).metadata();
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 1920);

  // Clean up
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
});
