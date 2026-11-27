process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../index';
import { VideoComposer } from '../services/video/videoComposer';
import {
  DEFAULT_BACKGROUND_VIDEO,
  DEFAULT_BACKGROUND_AUDIO,
  DEFAULT_VOICE_ACTOR,
  DEFAULT_THUMBNAIL_TIMESTAMP,
  DEFAULT_DESCRIPTION_TEMPLATE
} from '../constants/videoDefaults';

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
  assert.equal(res.body.defaultSettings.voiceActor, DEFAULT_VOICE_ACTOR);
  assert.equal(res.body.defaultSettings.thumbnailTimestamp, DEFAULT_THUMBNAIL_TIMESTAMP);
  assert.equal(res.body.defaultSettings.backgroundVideo, DEFAULT_BACKGROUND_VIDEO);
  assert.equal(res.body.defaultSettings.backgroundAudio, DEFAULT_BACKGROUND_AUDIO);
  assert.equal(res.body.defaultSettings.descriptionTemplate, DEFAULT_DESCRIPTION_TEMPLATE);
});

test('Regression API: GET /api/media/stream/:filename streams valid asset and blocks invalid/traversal names', async () => {
  const assetsRes = await request(app).get('/api/media/assets');
  assert.equal(assetsRes.status, 200);

  // Path traversal / unknown file must be rejected with 404
  const badRes = await request(app).get('/api/media/stream/..%2Fpackage.json');
  assert.equal(badRes.status, 404);

  const missingRes = await request(app).get('/api/media/stream/non_existent_video.mp4');
  assert.equal(missingRes.status, 404);

  // If a background audio asset exists on disk, verify range streaming returns 206
  if (assetsRes.body.backgroundAudio.length > 0) {
    const filename = assetsRes.body.backgroundAudio[0].filename;
    const rangeRes = await request(app)
      .get(`/api/media/stream/${encodeURIComponent(filename)}`)
      .set('Range', 'bytes=0-1023');
    assert.equal(rangeRes.status, 206);
    assert.ok(String(rangeRes.headers['content-type']).startsWith('audio/'));
    assert.equal(rangeRes.headers['accept-ranges'], 'bytes');
  }
});

test('Regression API: GET /api/media/voice-preview/:voiceId streams valid voice preview and blocks invalid voices', async () => {
  const invalidRes = await request(app).get('/api/media/voice-preview/unknown_voice');
  assert.equal(invalidRes.status, 404);

  const traversalRes = await request(app).get('/api/media/voice-preview/..%2Fpackage.json');
  assert.equal(traversalRes.status, 404);

  const validRes = await request(app)
    .get('/api/media/voice-preview/hearth')
    .set('Range', 'bytes=0-1023');
  assert.equal(validRes.status, 206);
  assert.equal(validRes.headers['content-type'], 'audio/wav');
  assert.equal(validRes.headers['accept-ranges'], 'bytes');
});

test('Regression API: POST /api/media/upload-custom stores ephemeral media outside permanent resources', async () => {
  const badTypeRes = await request(app)
    .post('/api/media/upload-custom?type=invalid&filename=test.mp4')
    .set('Content-Type', 'application/octet-stream')
    .send(Buffer.from('dummy'));
  assert.equal(badTypeRes.status, 400);

  const uploadRes = await request(app)
    .post('/api/media/upload-custom?type=video&filename=my_clip.mp4')
    .set('Content-Type', 'application/octet-stream')
    .send(Buffer.from('fake-mp4-binary-payload'));
  assert.equal(uploadRes.status, 201);
  assert.equal(uploadRes.body.success, true);
  assert.equal(uploadRes.body.type, 'video');
  assert.ok(String(uploadRes.body.token).startsWith('custom_video_'));
  assert.ok(String(uploadRes.body.token).endsWith('.mp4'));

  // Confirm it does NOT pollute the permanent /api/media/assets library
  const assetsRes = await request(app).get('/api/media/assets');
  const videoFilenames = assetsRes.body.backgroundVideos.map((v: any) => v.filename);
  assert.equal(videoFilenames.includes(uploadRes.body.token), false);
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

test('Prediction Reason API: POST /api/predictions/reason validates selections and returns a one-sentence reason', async () => {
  const resNoSelection = await request(app)
    .post('/api/predictions/reason')
    .send({
      game: { homeTeam: 'Arsenal', awayTeam: 'Chelsea', competition: 'Premier League' },
      selections: []
    });
  assert.equal(resNoSelection.status, 400);

  const resValid = await request(app)
    .post('/api/predictions/reason')
    .send({
      game: { homeTeam: 'Arsenal', awayTeam: 'Chelsea', competition: 'Premier League' },
      selections: [
        { code: '1', label: 'Home Win', spokenText: 'Arsenal to win' }
      ]
    });
  assert.equal(resValid.status, 200);
  assert.equal(resValid.body.success, true);
  assert.equal(typeof resValid.body.reason, 'string');
  assert.ok(resValid.body.reason.trim().length > 5);
  assert.equal(/^because\s+/i.test(resValid.body.reason.trim()), false);
});

test('VideoComposer.buildMatchPredictionSpeech uses default phrasing when no reason and "We expect ... because ..." when reason is given', () => {
  const composer = new VideoComposer();

  // Single selection, no reason
  assert.equal(
    composer.buildMatchPredictionSpeech([
      { code: '1', label: 'Home Win', spokenText: 'Arsenal to win' }
    ]),
    'Arsenal to win stands out as the strongest outcome.'
  );

  // Two selections, no reason
  assert.equal(
    composer.buildMatchPredictionSpeech([
      { code: '1', label: 'Home Win', spokenText: 'Arsenal to win' },
      { code: 'OVER_2.5_GOALS', label: 'Total Goals Over 2.5', spokenText: 'Over 2.5 total goals' }
    ]),
    'Arsenal to win and Over 2.5 total goals stand out as the strongest outcomes.'
  );

  // Single selection, with reason
  assert.equal(
    composer.buildMatchPredictionSpeech(
      [{ code: '1', label: 'Home Win', spokenText: 'Arsenal to win' }],
      'Arsenal have won 7 straight home games'
    ),
    'We expect Arsenal to win because Arsenal have won 7 straight home games.'
  );

  // Strips accidental leading "because"
  assert.equal(
    composer.buildMatchPredictionSpeech(
      [{ code: 'BTTS_YES', label: 'Both Teams to Score - Yes', spokenText: 'Both teams to score' }],
      'because both sides have scored in five consecutive matches.'
    ),
    'We expect Both teams to score because both sides have scored in five consecutive matches.'
  );
});
