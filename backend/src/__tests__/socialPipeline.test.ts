process.env.NODE_ENV = 'test';
// Isolate social credentials in test environment so tests never make live external API calls
delete process.env.FB_PAGE_ID;
delete process.env.FB_PAGE_ACCESS_TOKEN;
delete process.env.INSTAGRAM_ACCOUNT_ID;
delete process.env.TIKTOK_ACCESS_TOKEN;
delete process.env.TIKTOK_CLIENT_KEY;
delete process.env.YOUTUBE_CLIENT_ID;

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
import { getSafeThumbnailOffset } from '../services/social/mediaHelper';

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

test('Social Pipeline: POST /api/social/schedule supports instant posting without 30-min restriction', async () => {
  // When isInstant is true, it proceeds without 30-min validation (returns 404 because video file not found in test, not 400 validation error)
  const res = await request(app)
    .post('/api/social/schedule')
    .send({
      groupId: 'instant_group_test',
      isInstant: true,
      description: 'Instant prediction post'
    });

  // Not 400 (400 would be validation error), 404 means validation passed and searched for video file
  assert.notEqual(res.status, 400, 'Instant post must bypass the 30-minute advance scheduling rule');
});

test('Social Pipeline: executePipeline filters publishers to only user-selected platforms', async () => {
  const result = await socialPipelineService.executePipeline({
    groupId: 'test_selective_platforms',
    videoPath: 'dummy.mp4',
    description: 'Selective platform test',
    targetDate: '2026-11-25',
    platforms: ['instagram_reels', 'tiktok']
  });

  assert.equal(result.items.length, 2, 'Should only execute the 2 requested platforms');
  const platformsRun = result.items.map((i) => i.platform);
  assert.ok(platformsRun.includes('instagram_reels'));
  assert.ok(platformsRun.includes('tiktok'));
  assert.equal(platformsRun.includes('facebook_reels'), false);
  assert.equal(platformsRun.includes('youtube_shorts'), false);
});

test('Instagram Reels Publisher: performs full 4-phase container creation, polling, media_publish and permalink retrieval', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  const savedEnv = {
    INSTAGRAM_ACCOUNT_ID: process.env.INSTAGRAM_ACCOUNT_ID,
    FB_PAGE_ACCESS_TOKEN: process.env.FB_PAGE_ACCESS_TOKEN
  };

  process.env.TEST_LIVE_INSTAGRAM = 'true';
  process.env.INSTAGRAM_ACCOUNT_ID = 'ig_test_user_123';
  process.env.FB_PAGE_ACCESS_TOKEN = 'token_test_abc';

  try {
    let pollCount = 0;
    (globalThis as any).fetch = async (url: string, init?: any) => {
      const urlStr = url.toString();
      calls.push(urlStr);
      if (urlStr.includes('rupload.facebook.com')) {
        return {
          ok: true,
          status: 200,
          text: async () => '{"success":true}'
        } as any;
      }
      if (urlStr.includes('/media_publish')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'ig_published_media_999' })
        } as any;
      }
      if (urlStr.includes('fields=permalink')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'ig_published_media_999', permalink: 'https://www.instagram.com/reel/C_REAL_POST_123/' })
        } as any;
      }
      if (urlStr.includes('fields=status_code')) {
        pollCount++;
        // First poll: IN_PROGRESS, Second poll: FINISHED
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'container_111', status_code: pollCount > 1 ? 'FINISHED' : 'IN_PROGRESS' })
        } as any;
      }
      if (urlStr.includes('/media')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'container_111', uri: 'https://rupload.facebook.com/ig-api-upload/v21.0/container_111' })
        } as any;
      }
      return { ok: false, status: 404, text: async () => 'Not Found' } as any;
    };

    const ig = new InstagramReelsPublisher();
    const result = await ig.publish({
      groupId: 'group_test_live',
      videoPath: 'dummy.mp4',
      description: 'Test reel',
      targetDate: '2026-11-25',
      thumbnailTimestamp: 5
    });

    assert.equal(result.success, true);
    assert.equal(result.isSimulated, false);
    assert.equal(result.remotePostId, 'ig_published_media_999');
    assert.equal(result.remoteUrl, 'https://www.instagram.com/reel/C_REAL_POST_123/');
    assert.ok(calls.some((u) => u.includes('rupload.facebook.com')), 'Must upload binary stream directly to rupload.facebook.com');
    assert.ok(calls.some((u) => u.includes('/media_publish')), 'Must call media_publish to push post live');
    assert.ok(calls.some((u) => u.includes('fields=status_code')), 'Must poll status_code');
    assert.ok(calls.some((u) => u.includes('fields=permalink')), 'Must fetch permalink');
  } finally {
    delete process.env.TEST_LIVE_INSTAGRAM;
    globalThis.fetch = originalFetch;
    if (savedEnv.INSTAGRAM_ACCOUNT_ID) {
      process.env.INSTAGRAM_ACCOUNT_ID = savedEnv.INSTAGRAM_ACCOUNT_ID;
    } else {
      delete process.env.INSTAGRAM_ACCOUNT_ID;
    }
    if (savedEnv.FB_PAGE_ACCESS_TOKEN) {
      process.env.FB_PAGE_ACCESS_TOKEN = savedEnv.FB_PAGE_ACCESS_TOKEN;
    } else {
      delete process.env.FB_PAGE_ACCESS_TOKEN;
    }
  }
});

test('Facebook Reels Publisher: performs full 4-phase start, upload, finish, polling and canonical permalink retrieval', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  let pollCount = 0;

  try {
    process.env.FB_PAGE_ID = 'test_fb_page_123';
    process.env.FB_PAGE_ACCESS_TOKEN = 'test_fb_page_token_abc';

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = input.toString();
      calls.push(urlStr);

      if (urlStr.includes('fields=id,permalink_url,status')) {
        pollCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'fb_vid_123',
            permalink_url: '/reel/fb_vid_123/',
            status: {
              video_status: pollCount > 1 ? 'ready' : 'processing',
              publishing_phase: {
                status: pollCount > 1 ? 'complete' : 'in_progress',
                publish_status: pollCount > 1 ? 'published' : 'not_started'
              }
            }
          })
        } as any;
      }
      if (urlStr.includes('rupload.facebook.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true })
        } as any;
      }
      if (urlStr.includes('/video_reels')) {
        const bodyStr = init?.body?.toString() || '';
        if (bodyStr.includes('upload_phase=start')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              video_id: 'fb_vid_123',
              upload_url: 'https://rupload.facebook.com/video-upload/v27.0/fb_vid_123'
            })
          } as any;
        }
        if (bodyStr.includes('upload_phase=finish')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, post_id: '122099' })
          } as any;
        }
      }
      return { ok: false, status: 404, text: async () => 'Not Found' } as any;
    };

    const fb = new FacebookReelsPublisher();
    const result = await fb.publish({
      groupId: 'group_test_fb_live',
      videoPath: 'dummy.mp4',
      description: 'Test Facebook reel',
      targetDate: '2026-11-25',
      thumbnailTimestamp: 3
    });

    assert.equal(result.success, true);
    assert.equal(result.isSimulated, false);
    assert.equal(result.remotePostId, 'fb_vid_123');
    assert.equal(result.remoteUrl, 'https://www.facebook.com/reel/fb_vid_123/');
    assert.ok(calls.some((u) => u.includes('rupload.facebook.com')), 'Must upload binary stream directly to rupload');
    assert.ok(calls.some((u) => u.includes('fields=id,permalink_url,status')), 'Must poll status until ready');
    assert.ok(pollCount >= 2, 'Must poll at least twice until ready');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FB_PAGE_ID;
    delete process.env.FB_PAGE_ACCESS_TOKEN;
  }
});

test('Media Helper: getSafeThumbnailOffset clamps out-of-bounds thumbnails to video duration and avoids black intro fade', () => {
  // Test 1: Requested 47s on a 30.7s video -> must be clamped to active prediction content (30.7 - 5.0 = 25.7s / 25700ms)
  const clampedOut = getSafeThumbnailOffset(47, 30.7);
  assert.equal(clampedOut.seconds, 25.7);
  assert.equal(clampedOut.ms, 25700);

  // Test 2: Requested 0s (start) -> must be clamped to at least 1.0s to avoid black fade
  const clampedZero = getSafeThumbnailOffset(0, 30.7);
  assert.equal(clampedZero.seconds, 1.0);
  assert.equal(clampedZero.ms, 1000);

  // Test 3: Normal within-bounds timestamp (12.5s on 30.7s video)
  const within = getSafeThumbnailOffset(12.5, 30.7);
  assert.equal(within.seconds, 12.5);
  assert.equal(within.ms, 12500);

  // Test 4: Duration unknown (null) -> enforces minimum 1.0s
  const unknownZero = getSafeThumbnailOffset(0, null);
  assert.equal(unknownZero.seconds, 1.0);
  assert.equal(unknownZero.ms, 1000);
});
