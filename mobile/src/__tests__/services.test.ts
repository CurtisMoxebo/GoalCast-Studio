import test from 'node:test';
import assert from 'node:assert/strict';
import { SOCIAL_PLATFORMS } from '../services/socialShare';
import { MobileApiService } from '../services/api';

test('Mobile Regression: Social platforms configuration', () => {
  assert.equal(SOCIAL_PLATFORMS.length, 4, 'Must have exactly 4 platforms: FB, IG, TikTok, YouTube');
  const ids = SOCIAL_PLATFORMS.map((p) => p.id);
  assert.ok(ids.includes('facebook'));
  assert.ok(ids.includes('instagram'));
  assert.ok(ids.includes('tiktok'));
  assert.ok(ids.includes('youtube'));

  // Test colors
  const fb = SOCIAL_PLATFORMS.find((p) => p.id === 'facebook');
  assert.equal(fb?.color, '#1877F2');
  const ig = SOCIAL_PLATFORMS.find((p) => p.id === 'instagram');
  assert.equal(ig?.color, '#E1306C');
  const yt = SOCIAL_PLATFORMS.find((p) => p.id === 'youtube');
  assert.equal(yt?.color, '#FF0000');
  const tiktok = SOCIAL_PLATFORMS.find((p) => p.id === 'tiktok');
  assert.equal(tiktok?.color, '#000000');
});

test('Mobile Regression: MobileApiService URL builder methods', () => {
  const api = new MobileApiService('http://test-server:5000/');
  assert.equal(api.getVideoDownloadUrl('job_99'), 'http://test-server:5000/api/video/download/job_99');
  assert.equal(api.getThumbnailUrl('job_99'), 'http://test-server:5000/api/video/thumbnail/job_99');
});
