import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../index';
import { DirectPostRegistry } from '../services/directPost/directPostRegistry';
import { TelegramDirectPublisher } from '../services/directPost/publishers/telegramPublisher';

test('DirectPostRegistry: registers Telegram by default and supports adding future platforms', () => {
  const registry = new DirectPostRegistry();
  registry.register(new TelegramDirectPublisher());

  assert.equal(registry.getAll().length, 1);
  assert.equal(registry.get('telegram')?.name, 'Telegram');
  assert.deepEqual(registry.get('telegram')?.supportedMediaTypes, ['text', 'photo', 'video']);

  // Verify extensibility for future social platforms
  registry.register({
    id: 'x_twitter',
    name: 'X (Twitter)',
    subtitle: 'Timeline post',
    color: '#000000',
    supportedMediaTypes: ['photo', 'video'],
    isConfigured: () => false,
    publish: async () => ({
      platform: 'x_twitter',
      platformName: 'X (Twitter)',
      status: 'SUCCESS'
    })
  });

  assert.equal(registry.getAll().length, 2);
  assert.ok(registry.getPlatformMetadata().some((p) => p.id === 'x_twitter'));
});

test('DirectPost API: GET /api/direct-post/platforms returns Telegram and enabled text/photo media types', async () => {
  const res = await request(app).get('/api/direct-post/platforms');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.enabledMediaTypes, ['text', 'photo']);
  assert.ok(Array.isArray(res.body.platforms));
  const telegram = res.body.platforms.find((p: any) => p.id === 'telegram');
  assert.ok(telegram, 'Telegram platform must be listed');
  assert.equal(telegram.name, 'Telegram');
});

test('DirectPost API: POST /api/direct-post/publish rejects empty post (no photo and no text)', async () => {
  const res = await request(app)
    .post('/api/direct-post/publish')
    .send({ description: '   ', platforms: ['telegram'] });
  assert.equal(res.status, 400);
});

test('DirectPost API: POST /api/direct-post/upload accepts photos and rejects video for now', async () => {
  const videoRes = await request(app)
    .post('/api/direct-post/upload?mediaType=video&filename=clip.mp4')
    .set('Content-Type', 'application/octet-stream')
    .send(Buffer.from('fake-video'));
  assert.equal(videoRes.status, 400);

  const photoRes = await request(app)
    .post('/api/direct-post/upload?mediaType=photo&filename=matchday.jpg')
    .set('Content-Type', 'application/octet-stream')
    .send(Buffer.from('fake-jpg-bytes'));
  assert.equal(photoRes.status, 201);
  assert.equal(photoRes.body.success, true);
  assert.equal(photoRes.body.mediaType, 'photo');
  assert.ok(String(photoRes.body.mediaToken).startsWith('direct_photo_'));
  assert.ok(String(photoRes.body.mediaToken).endsWith('.jpg'));
});
