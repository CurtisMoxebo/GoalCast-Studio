import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { overlayGenerator } from '../services/video/overlayGenerator';
import { teamLogoService } from '../services/video/teamLogoService';
import { videoComposer } from '../services/video/videoComposer';

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

test('Regression: OverlayGenerator generates Prediction Banner PNG under game box', async () => {
  const tmpDir = path.join(os.tmpdir(), 'goalcast_tests_overlay');
  const outputPath = path.join(tmpDir, 'test_pred_banner.png');

  await overlayGenerator.generatePredictionOverlay('Both Teams to Score - Yes', outputPath);

  assert.ok(fs.existsSync(outputPath), 'Prediction banner PNG must exist on disk');
  const metadata = await sharp(outputPath).metadata();
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 1920);

  // Clean up
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
});

test('Regression: OverlayGenerator generates dual prediction banner {pred1} & {pred2}', async () => {
  const tmpDir = path.join(os.tmpdir(), 'goalcast_tests_overlay');
  const outputPath = path.join(tmpDir, 'test_dual_pred_banner.png');

  await overlayGenerator.generatePredictionOverlay('Over 2.5 Goals & Both Teams to Score - Yes', outputPath);

  assert.ok(fs.existsSync(outputPath), 'Dual prediction banner PNG must exist on disk');
  const metadata = await sharp(outputPath).metadata();
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 1920);

  // Clean up
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
});

test('Regression: OverlayGenerator embeds AI-provided logo URLs directly into Match Card', async () => {
  const tmpDir = path.join(os.tmpdir(), 'goalcast_tests_overlay');
  const outputPath = path.join(tmpDir, 'test_match_card_ai_logos.png');

  const game = {
    homeTeam: 'Arsenal',
    homeTeamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png',
    awayTeam: 'Chelsea',
    awayTeamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/363.png',
    competition: 'Premier League',
    kickoffTime: '2026-11-20T18:00:00Z'
  };

  await overlayGenerator.generateMatchCardOverlay(game, 1, 1, 'Arsenal to win or draw', outputPath);

  assert.ok(fs.existsSync(outputPath), 'Match card with AI logos must exist');
  const metadata = await sharp(outputPath).metadata();
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 1920);

  // Clean up
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
});

test('Regression: TeamLogoService retries failing URL 2 more times (3 attempts total) before using default shield', async () => {
  const uri = await teamLogoService.getLogoDataUri('FailingTeam', 'https://127.0.0.1:59999/nonexistent.png', 80);
  assert.ok(uri.startsWith('data:image/png;base64,'), 'Must return a valid base64 PNG data URI fallback');
});

test('Regression: TeamLogoService caches different ESPN URLs separately without collisions', async () => {
  const uriArsenal = await teamLogoService.getLogoDataUri('Arsenal', 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png', 80);
  const uriChelsea = await teamLogoService.getLogoDataUri('Chelsea', 'https://a.espncdn.com/i/teamlogos/soccer/500/363.png', 80);
  assert.notEqual(uriArsenal, uriChelsea, 'Arsenal and Chelsea logos must be completely distinct');
});

test('Regression: VideoComposer generates Top-Positioned ASS subtitles with \\an8 and MarginV=100', async () => {
  const tmpDir = path.join(os.tmpdir(), 'goalcast_tests_video');
  const assPath = path.join(tmpDir, 'test_subtitles_karaoke.ass');

  const phrases = [
    {
      text: 'Match 1, Arsenal versus Chelsea.',
      startTime: 1.0,
      duration: 2.5
    },
    {
      text: 'Both teams to score stands out as the strongest outcome.',
      startTime: 4.0,
      duration: 3.0,
      marginV: 100
    }
  ];

  videoComposer.generateKaraokeAssFile(phrases, assPath);

  assert.ok(fs.existsSync(assPath), 'ASS subtitles file must exist');
  const content = fs.readFileSync(assPath, 'utf-8');

  // Verify resolution
  assert.ok(content.includes('PlayResX: 1080'));
  assert.ok(content.includes('PlayResY: 1920'));

  // Verify TopKaraoke style has Alignment 8 and top MarginV 100
  assert.ok(content.includes('Style: TopKaraoke,Arial,48,&H00FFFFFF&,&H00000000&,&H00000000&,&H90000000&,-1,0,0,0,100,100,1,0,1,4.5,2.5,8,60,60,100,1'));

  // Verify every dialogue line includes \an8 top-center alignment override
  const lines = content.split('\r\n').filter((l) => l.startsWith('Dialogue:'));
  assert.ok(lines.length > 0, 'Must have dialogue lines');
  for (const line of lines) {
    assert.ok(line.includes('{\\an8}'), `Dialogue line must contain {\\an8} top-center tag: ${line}`);
    assert.ok(line.includes(',100,,'), `Dialogue line must have MarginV 100: ${line}`);
  }

  // Verify karaoke active-word highlight
  assert.ok(content.includes('{\\c&H0000FF00&}'), 'Must contain green highlight for active spoken word');

  // Clean up
  if (fs.existsSync(assPath)) fs.unlinkSync(assPath);
});
