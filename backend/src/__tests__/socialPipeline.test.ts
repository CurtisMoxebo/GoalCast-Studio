process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../index';
import { socialPublisherRegistry } from '../services/social/socialPublisherRegistry';
import { socialPipelineService } from '../services/social/socialPipelineService';
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
