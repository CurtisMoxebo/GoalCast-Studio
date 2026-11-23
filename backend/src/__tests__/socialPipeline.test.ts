process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../index';
import { socialPublisherRegistry } from '../services/social/socialPublisherRegistry';
import { socialPipelineService } from '../services/social/socialPipelineService';
import { FacebookReelsPublisher } from '../services/social/publishers/facebookReelsPublisher';
import { InstagramReelsPublisher } from '../services/social/publishers/instagramReelsPublisher';
import { TikTokPublisher } from '../services/social/publishers/tiktokPublisher';
import { YouTubePublisher } from '../services/social/publishers/youtubePublisher';
import { ISocialPublisher, PublishOptions, PublishResult } from '../services/social/types';

test('Regression Social: SocialPublisherRegistry registers default 4 publishers and supports extensions', () => {
  const all = socialPublisherRegistry.getAll();
  assert.ok(all.length >= 4, 'Must have at least 4 registered publishers');

  const ids = socialPublisherRegistry.getPlatformIds();
  assert.ok(ids.includes('facebook_reels'), 'Must include Facebook Reels');
  assert.ok(ids.includes('instagram_reels'), 'Must include Instagram Reels');
  assert.ok(ids.includes('tiktok'), 'Must include TikTok');
  assert.ok(ids.includes('youtube_shorts'), 'Must include YouTube Shorts');

  // Test extensibility: dynamically adding a 5th publisher (e.g. X / Twitter)
  const mockTwitterPublisher: ISocialPublisher = {
    id: 'x_twitter' as any,
    name: 'X (Twitter)',
    publish: async (_opts: PublishOptions): Promise<PublishResult> => ({
      success: true,
      platform: 'x_twitter' as any,
      remotePostId: 'tweet_123',
      logs: ['Published tweet']
    })
  };

  socialPublisherRegistry.register(mockTwitterPublisher);
  const fetched = socialPublisherRegistry.get('x_twitter');
  assert.ok(fetched);
  assert.equal(fetched.name, 'X (Twitter)');
});

test('Regression Social: POST /api/social/schedule strictly rejects times in <= 30 minutes', async () => {
  // Test 1: Date in only 10 minutes (must fail)
  const tenMinutesAhead = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const res10 = await request(app)
    .post('/api/social/schedule')
    .send({
      groupId: 'test_group_123',
      scheduledPostTime: tenMinutesAhead,
      description: 'Test post'
    });

  assert.equal(res10.status, 400);
  assert.ok(res10.body.error.includes('at least 30 minutes'));

  // Test 2: Date in past (must fail)
  const past = new Date(Date.now() - 60 * 1000).toISOString();
  const resPast = await request(app)
    .post('/api/social/schedule')
    .send({
      groupId: 'test_group_123',
      scheduledPostTime: past
    });

  assert.equal(resPast.status, 400);
  assert.ok(resPast.body.error.includes('at least 30 minutes'));

  // Test 3: Missing fields
  const resMissing = await request(app).post('/api/social/schedule').send({});
  assert.equal(resMissing.status, 400);
});

test('Regression Social: SocialPipelineService executes sequentially and moves to next platform if one fails', async () => {
  // Register a failing publisher and a succeeding publisher to test fail-safe continuation
  const mockFailing: ISocialPublisher = {
    id: 'failing_platform' as any,
    name: 'Failing Platform',
    publish: async (_opts) => ({
      success: false,
      platform: 'failing_platform' as any,
      error: 'Simulated network timeout',
      logs: ['Attempt 1 failed']
    })
  };

  const mockSucceeding: ISocialPublisher = {
    id: 'succeeding_platform' as any,
    name: 'Succeeding Platform',
    publish: async (_opts) => ({
      success: true,
      platform: 'succeeding_platform' as any,
      remotePostId: 'post_abc_999',
      remoteUrl: 'https://example.com/post_abc_999',
      logs: ['Upload complete']
    })
  };

  socialPublisherRegistry.register(mockFailing);
  socialPublisherRegistry.register(mockSucceeding);

  const scheduledPostTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour ahead
  const result = await socialPipelineService.executePipeline({
    groupId: 'test_group_pipeline_eval',
    videoPath: 'dummy.mp4',
    description: 'Premier League Matchday #predictions',
    targetDate: '2026-11-25',
    scheduledPostTime
  });

  assert.ok(result.pipelineId);
  assert.equal(result.groupId, 'test_group_pipeline_eval');
  assert.ok(result.items.length >= 4);

  // Verify that the failing platform failed, but the succeeding platform was still executed
  const failingItem = result.items.find((i) => i.platform === ('failing_platform' as any));
  assert.ok(failingItem);
  assert.equal(failingItem.status, 'FAILED');
  assert.equal(failingItem.error, 'Simulated network timeout');

  const succeedingItem = result.items.find((i) => i.platform === ('succeeding_platform' as any));
  assert.ok(succeedingItem);
  assert.equal(succeedingItem.status, 'SUCCESS');
  assert.equal(succeedingItem.remotePostId, 'post_abc_999');
});

test('Regression Social: Public /terms and /privacy routes return 200 HTML', async () => {
  const termsRes = await request(app).get('/terms');
  assert.equal(termsRes.status, 200);
  assert.ok(termsRes.text.includes('Terms of Service'));

  const privRes = await request(app).get('/privacy');
  assert.equal(privRes.status, 200);
  assert.ok(privRes.text.includes('Privacy Policy'));
});

test('Social Publishers: All 4 social platforms accept and record the user-specified thumbnail timeframe', async () => {
  const customTimeframe = 8.5; // 8.5 seconds -> 8500 ms
  const options: PublishOptions = {
    groupId: 'test_thumb_group',
    videoPath: 'dummy_video.mp4',
    description: 'Premier League Matchday Predictions',
    targetDate: '2026-11-26',
    scheduledPostTime: new Date(Date.now() + 60 * 60 * 1000),
    thumbnailTimestamp: customTimeframe
  };

  // Temporarily isolate live credentials so tests verify simulated mode without external network calls
  const savedEnv = {
    FB_PAGE_ID: process.env.FB_PAGE_ID,
    FB_PAGE_ACCESS_TOKEN: process.env.FB_PAGE_ACCESS_TOKEN,
    INSTAGRAM_ACCOUNT_ID: process.env.INSTAGRAM_ACCOUNT_ID,
    TIKTOK_ACCESS_TOKEN: process.env.TIKTOK_ACCESS_TOKEN,
    TIKTOK_CLIENT_KEY: process.env.TIKTOK_CLIENT_KEY,
    YOUTUBE_CLIENT_ID: process.env.YOUTUBE_CLIENT_ID
  };

  delete process.env.FB_PAGE_ID;
  delete process.env.FB_PAGE_ACCESS_TOKEN;
  delete process.env.INSTAGRAM_ACCOUNT_ID;
  delete process.env.TIKTOK_ACCESS_TOKEN;
  delete process.env.TIKTOK_CLIENT_KEY;
  delete process.env.YOUTUBE_CLIENT_ID;

  try {
    // 1. Facebook Reels
    const fb = new FacebookReelsPublisher();
    const fbRes = await fb.publish(options);
    assert.equal(fbRes.success, true);
    assert.equal(fbRes.isSimulated, true);
    assert.ok(fbRes.warning?.includes('FB_PAGE'));
    assert.ok(fbRes.logs.some((l) => l.includes('8.5s') && l.includes('8500ms')));

    // 2. Instagram Reels
    const ig = new InstagramReelsPublisher();
    const igRes = await ig.publish(options);
    assert.equal(igRes.success, true);
    assert.equal(igRes.isSimulated, true);
    assert.ok(igRes.warning?.includes('INSTAGRAM'));
    assert.ok(igRes.logs.some((l) => l.includes('8.5s') && l.includes('8500ms')));

    // 3. TikTok
    const tt = new TikTokPublisher();
    const ttRes = await tt.publish(options);
    assert.equal(ttRes.success, true);
    assert.equal(ttRes.isSimulated, true);
    assert.ok(ttRes.warning?.includes('TIKTOK'));
    assert.ok(ttRes.logs.some((l) => l.includes('8.5s') && l.includes('8500ms')));

    // 4. YouTube Shorts
    const yt = new YouTubePublisher();
    const ytRes = await yt.publish(options);
    assert.equal(ytRes.success, true);
    assert.equal(ytRes.isSimulated, true);
    assert.ok(ytRes.warning?.includes('YOUTUBE'));
    assert.ok(ytRes.logs.some((l) => l.includes('8.5s')));
  } finally {
    // Restore environment
    if (savedEnv.FB_PAGE_ID) process.env.FB_PAGE_ID = savedEnv.FB_PAGE_ID;
    if (savedEnv.FB_PAGE_ACCESS_TOKEN) process.env.FB_PAGE_ACCESS_TOKEN = savedEnv.FB_PAGE_ACCESS_TOKEN;
    if (savedEnv.INSTAGRAM_ACCOUNT_ID) process.env.INSTAGRAM_ACCOUNT_ID = savedEnv.INSTAGRAM_ACCOUNT_ID;
    if (savedEnv.TIKTOK_ACCESS_TOKEN) process.env.TIKTOK_ACCESS_TOKEN = savedEnv.TIKTOK_ACCESS_TOKEN;
    if (savedEnv.TIKTOK_CLIENT_KEY) process.env.TIKTOK_CLIENT_KEY = savedEnv.TIKTOK_CLIENT_KEY;
    if (savedEnv.YOUTUBE_CLIENT_ID) process.env.YOUTUBE_CLIENT_ID = savedEnv.YOUTUBE_CLIENT_ID;
  }
});

test('Social Pipeline: Strictly marks simulated publishers as SIMULATED to eliminate false positives', async () => {
  const mockSimulated: ISocialPublisher = {
    id: 'mock_sim_platform' as any,
    name: 'Mock Staging Platform',
    publish: async (_opts) => ({
      success: true,
      isSimulated: true,
      warning: 'Missing test API token',
      platform: 'mock_sim_platform' as any,
      remotePostId: 'sim_12345',
      remoteUrl: 'https://example.com/sim_12345',
      logs: ['Simulated staging run']
    })
  };

  socialPublisherRegistry.register(mockSimulated);

  const scheduledPostTime = new Date(Date.now() + 60 * 60 * 1000);
  const result = await socialPipelineService.executePipeline({
    groupId: 'test_false_positives_group',
    videoPath: 'dummy.mp4',
    description: 'Premier League Matchday #predictions',
    targetDate: '2026-11-25',
    scheduledPostTime
  });

  const simItem = result.items.find((i) => i.platform === ('mock_sim_platform' as any));
  assert.ok(simItem);
  assert.equal(simItem.status, 'SIMULATED', 'Simulated platform must have SIMULATED status, never false positive SUCCESS');
  assert.equal(simItem.isSimulated, true);
  assert.ok(simItem.warning?.includes('Missing'));
});
