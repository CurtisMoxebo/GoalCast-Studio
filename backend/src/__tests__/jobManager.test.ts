import test from 'node:test';
import assert from 'node:assert/strict';
import { videoJobManager } from '../services/video/jobManager';

test('Regression: VideoJobManager full lifecycle progression', () => {
  const jobId = `reg_job_${Date.now()}`;

  // 1. Creation
  const job = videoJobManager.createJob(jobId);
  assert.equal(job.jobId, jobId);
  assert.equal(job.status, 'PENDING');
  assert.equal(job.percent, 0);

  // 2. Fetch
  const retrieved = videoJobManager.getJob(jobId);
  assert.deepEqual(retrieved, job);

  // 3. Progress Updates
  videoJobManager.updateProgress(jobId, 45, 'Rendering animated overlays');
  assert.equal(retrieved?.status, 'PROCESSING');
  assert.equal(retrieved?.percent, 45);
  assert.equal(retrieved?.message, 'Rendering animated overlays');

  // 4. Completion
  videoJobManager.completeJob(jobId, {
    videoPath: '/tmp/test.mp4',
    thumbnailPath: '/tmp/thumb.jpg',
    durationSeconds: 24.5
  });
  assert.equal(retrieved?.status, 'COMPLETED');
  assert.equal(retrieved?.percent, 100);
  assert.equal(retrieved?.videoPath, '/tmp/test.mp4');
  assert.equal(retrieved?.thumbnailPath, '/tmp/thumb.jpg');
  assert.equal(retrieved?.durationSeconds, 24.5);
});

test('Regression: VideoJobManager failure handling', () => {
  const failJobId = `fail_job_${Date.now()}`;
  videoJobManager.createJob(failJobId);
  videoJobManager.failJob(failJobId, 'FFmpeg render timeout exceeded');

  const job = videoJobManager.getJob(failJobId);
  assert.equal(job?.status, 'FAILED');
  assert.equal(job?.error, 'FFmpeg render timeout exceeded');
  assert.ok(job?.message.includes('FFmpeg render timeout exceeded'));
});

test('Regression: VideoJobManager query for non-existent job', () => {
  const job = videoJobManager.getJob('non_existent_random_id');
  assert.equal(job, undefined);
});

test('Regression: VideoJobManager cleanup old jobs preserves recent jobs', () => {
  const recentJobId = `recent_${Date.now()}`;
  videoJobManager.createJob(recentJobId);

  // Run cleanup
  videoJobManager.cleanupOldJobs();

  // Recent job must still be present
  assert.ok(videoJobManager.getJob(recentJobId));
});
