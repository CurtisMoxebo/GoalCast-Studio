import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { VideoCleanupService } from '../services/video/videoCleanupService';
import { videoJobManager } from '../services/video/jobManager';

test('VideoCleanupService: cleans up folders older than threshold and preserves younger ones', async () => {
  const service = new VideoCleanupService();
  const testBase = path.join(os.tmpdir(), `test_cleanup_${Date.now()}`);
  fs.mkdirSync(testBase, { recursive: true });

  const oldFolder = path.join(testBase, 'old_job_123');
  const youngFolder = path.join(testBase, 'young_job_456');

  fs.mkdirSync(oldFolder, { recursive: true });
  fs.mkdirSync(youngFolder, { recursive: true });

  // Create dummy files
  fs.writeFileSync(path.join(oldFolder, 'video.mp4'), Buffer.alloc(1024 * 10)); // 10 KB
  fs.writeFileSync(path.join(youngFolder, 'video.mp4'), Buffer.alloc(1024 * 5)); // 5 KB

  // Artificially age oldFolder to 80 hours ago
  const eightyHoursAgo = new Date(Date.now() - 80 * 60 * 60 * 1000);
  fs.utimesSync(oldFolder, eightyHoursAgo, eightyHoursAgo);

  // Keep youngFolder at current time
  const now = new Date();
  fs.utimesSync(youngFolder, now, now);

  // Run cleanup with 72-hour threshold
  const result = await service.cleanupStaleRenders(72, testBase);

  assert.equal(result.cleanedFolders, 1, 'Should clean exactly 1 stale folder');
  assert.ok(!fs.existsSync(oldFolder), 'Old folder must be removed');
  assert.ok(fs.existsSync(youngFolder), 'Young folder must be preserved');

  // Cleanup test sandbox
  fs.rmSync(testBase, { recursive: true, force: true });
});

test('VideoCleanupService: preserves old folder if job is currently active/processing in jobManager', async () => {
  const service = new VideoCleanupService();
  const testBase = path.join(os.tmpdir(), `test_cleanup_active_${Date.now()}`);
  fs.mkdirSync(testBase, { recursive: true });

  const activeJobId = `active_job_${Date.now()}`;
  const activeFolder = path.join(testBase, activeJobId);
  fs.mkdirSync(activeFolder, { recursive: true });
  fs.writeFileSync(path.join(activeFolder, 'video.mp4'), Buffer.alloc(1024));

  // Age folder to 100 hours ago
  const hundredHoursAgo = new Date(Date.now() - 100 * 60 * 60 * 1000);
  fs.utimesSync(activeFolder, hundredHoursAgo, hundredHoursAgo);

  // Register active job in jobManager
  videoJobManager.createJob(activeJobId);
  videoJobManager.updateProgress(activeJobId, 50, 'Rendering in progress');

  // Run cleanup with 72-hour threshold
  const result = await service.cleanupStaleRenders(72, testBase);

  assert.equal(result.cleanedFolders, 0, 'Must NOT delete active job folder');
  assert.ok(fs.existsSync(activeFolder), 'Active job folder must still exist');

  // Cleanup test sandbox
  fs.rmSync(testBase, { recursive: true, force: true });
});

test('VideoCleanupService: start and stop lifecycle controls timer cleanly', () => {
  const service = new VideoCleanupService();
  service.start(1000 * 60);
  // Idempotent start
  service.start(1000 * 60);
  service.stop();
  // Idempotent stop
  service.stop();
});
