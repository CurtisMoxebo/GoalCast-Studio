process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../index';
import { DEFAULT_THUMBNAIL_TIMESTAMP } from '../constants/videoDefaults';

test('Regression API: GET /api/health', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.service, 'goalcast-studio-backend');
  assert.ok(res.body.timestamp);
});

test('Regression API: GET /api/media/assets', async () => {
  const res = await request(app).get('/api/media/assets');
  assert.equal(res.status, 200);

  // Background media
  assert.ok(Array.isArray(res.body.backgroundVideos));
  assert.ok(Array.isArray(res.body.backgroundAudio));

  // Voices: must support the 5 requested voices
  const voiceIds = (res.body.voices || []).map((v: any) => v.id);
  assert.ok(voiceIds.includes('hearth'));
  assert.ok(voiceIds.includes('alloy'));
  assert.ok(voiceIds.includes('jessica'));
  assert.ok(voiceIds.includes('adam'));
  assert.ok(voiceIds.includes('liam'));

  // Default settings
  assert.ok(res.body.defaultSettings);
  assert.equal(res.body.defaultSettings.voiceActor, 'hearth');
  assert.equal(res.body.defaultSettings.thumbnailTimestamp, DEFAULT_THUMBNAIL_TIMESTAMP);
  assert.ok(res.body.defaultSettings.descriptionTemplate.includes('{date}'));
});

test('Regression API: GET /api/predictions/options', async () => {
  const res = await request(app).get('/api/predictions/options');
  assert.equal(res.status, 200);
  assert.equal(res.body.categories.length, 3);
  assert.ok(res.body.options.length > 50);
  assert.equal(res.body.rules.maxSelectionsPerGame, 2);
  assert.equal(res.body.rules.maxGamesPredicted, 10);
});

test('Regression API: GET /api/games rejects past or today dates', async () => {
  // Yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().split('T')[0];

  const resPast = await request(app).get(`/api/games?date=${yStr}`);
  assert.equal(resPast.status, 400);
  assert.ok(resPast.body.error.includes('tomorrow or in the future'));

  // Today
  const todayStr = new Date().toISOString().split('T')[0];
  const resToday = await request(app).get(`/api/games?date=${todayStr}`);
  assert.equal(resToday.status, 400);
});

test('Regression API: GET /api/games accepts future date and returns fixtures', async () => {
  const future = new Date();
  future.setDate(future.getDate() + 2);
  const futureStr = future.toISOString().split('T')[0];

  const res = await request(app).get(`/api/games?date=${futureStr}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.games));
  assert.ok(res.body.games.length > 0);
});

test('Regression API: POST /api/predictions/ai validates payload limits', async () => {
  // Empty games array
  const resEmpty = await request(app)
    .post('/api/predictions/ai')
    .send({ games: [] });
  assert.equal(resEmpty.status, 400);

  // More than 10 games
  const elevenGames = Array.from({ length: 11 }, (_, i) => ({
    id: `g_${i}`,
    homeTeam: `Team A${i}`,
    awayTeam: `Team B${i}`,
    competition: 'League',
    kickoffTime: '2026-11-20T18:00:00Z'
  }));
  const resTooMany = await request(app)
    .post('/api/predictions/ai')
    .send({ games: elevenGames });
  assert.equal(resTooMany.status, 400);
  assert.ok(resTooMany.body.error.includes('Cannot predict more than 10'));

  // Valid payload (2 games)
  const resValid = await request(app)
    .post('/api/predictions/ai')
    .send({ games: elevenGames.slice(0, 2) });
  assert.equal(resValid.status, 200);
  assert.equal(resValid.body.success, true);
  assert.equal(resValid.body.predictions.length, 2);
});

test('Regression API: POST /api/predictions/status validates status enum', async () => {
  const resBad = await request(app)
    .post('/api/predictions/status')
    .send({ groupId: 'test_123', status: 'INVALID_STATUS' });
  assert.equal(resBad.status, 400);

  const resMissing = await request(app)
    .post('/api/predictions/status')
    .send({ status: 'ACCEPTED' });
  assert.equal(resMissing.status, 400);
});

test('Regression API: GET /api/video/progress and /download 404 on missing jobs', async () => {
  const resProgress = await request(app).get('/api/video/progress/non_existent_job_123');
  assert.equal(resProgress.status, 404);

  const resDownload = await request(app).get('/api/video/download/non_existent_job_123');
  assert.equal(resDownload.status, 404);
});
