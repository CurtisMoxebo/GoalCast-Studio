import fs from 'fs';
import path from 'path';
import os from 'os';
import prisma from '../../db/prisma';
import { videoJobManager } from './jobManager';

export class VideoCleanupService {
  private timer: NodeJS.Timeout | null = null;
  private readonly defaultRetentionHours: number = 72;

  /**
   * Calculates total byte size of a directory recursively
   */
  public getDirectorySize(dirPath: string): number {
    let totalSize = 0;
    try {
      if (!fs.existsSync(dirPath)) return 0;
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        try {
          if (entry.isDirectory()) {
            totalSize += this.getDirectorySize(fullPath);
          } else if (entry.isFile()) {
            totalSize += fs.statSync(fullPath).size;
          }
        } catch {
          // File might have been removed or locked
        }
      }
    } catch {
      // Directory cannot be read
    }
    return totalSize;
  }

  /**
   * Scans the temporary render directory and removes rendering folders
   * older than the retention period (default: 72 hours), preserving active
   * jobs and pending scheduled posts.
   */
  public async cleanupStaleRenders(
    customRetentionHours?: number,
    customBaseDir?: string
  ): Promise<{ cleanedFolders: number; freedBytes: number }> {
    const retentionHours =
      customRetentionHours ??
      (process.env.VIDEO_RETENTION_HOURS ? Number(process.env.VIDEO_RETENTION_HOURS) : this.defaultRetentionHours);

    const renderBase = customBaseDir || path.join(os.tmpdir(), 'goalcast_render');

    if (!fs.existsSync(renderBase)) {
      return { cleanedFolders: 0, freedBytes: 0 };
    }

    const maxAgeMs = retentionHours * 60 * 60 * 1000;
    const now = Date.now();
    let cleanedFolders = 0;
    let freedBytes = 0;

    console.log(`[VideoCleanup] 🧹 Running stale render cleanup (retention: ${retentionHours}h, target: ${renderBase})...`);

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(renderBase, { withFileTypes: true });
    } catch (err: any) {
      console.warn(`[VideoCleanup] ⚠️ Failed to read render directory:`, err?.message);
      return { cleanedFolders: 0, freedBytes: 0 };
    }

    for (const entry of entries) {
      // Only process directories (each job/render has its own folder)
      if (!entry.isDirectory()) continue;

      const folderName = entry.name;
      // Skip the shared 'recaps' folder itself (unless cleaning inside it)
      if (folderName === 'recaps') continue;

      const folderPath = path.join(renderBase, folderName);

      try {
        const stat = fs.statSync(folderPath);
        const folderAgeMs = now - stat.mtimeMs;
        const folderAgeHours = folderAgeMs / (1000 * 60 * 60);

        if (folderAgeMs < maxAgeMs) {
          // Newer than retention cutoff -> keep
          continue;
        }

        // Safety Check 1: In-memory active job manager check
        const activeJob = videoJobManager.getJob(folderName);
        if (activeJob && (activeJob.status === 'PROCESSING' || activeJob.status === 'PENDING')) {
          console.log(`[VideoCleanup] 🛡️ Skipping active rendering job folder: "${folderName}"`);
          continue;
        }

        // Safety Check 2: Database future scheduled post check
        try {
          const group = await prisma.predictionGroup.findUnique({
            where: { id: folderName }
          });
          if (group?.scheduledPostTime && new Date(group.scheduledPostTime).getTime() > now) {
            console.log(`[VideoCleanup] 🛡️ Preserving folder "${folderName}" for future scheduled post at ${group.scheduledPostTime}`);
            continue;
          }
        } catch {
          // DB check optional in offline/test mode
        }

        // Safe to remove
        const dirSize = this.getDirectorySize(folderPath);
        fs.rmSync(folderPath, { recursive: true, force: true });
        cleanedFolders++;
        freedBytes += dirSize;

        console.log(
          `[VideoCleanup] 🗑️ Removed stale render "${folderName}" (age: ${folderAgeHours.toFixed(1)}h, freed: ${(dirSize / (1024 * 1024)).toFixed(2)} MB)`
        );
      } catch (dirErr: any) {
        console.warn(`[VideoCleanup] ⚠️ Could not remove folder "${folderPath}":`, dirErr?.message);
      }
    }

    const totalFreedMb = (freedBytes / (1024 * 1024)).toFixed(2);
    console.log(`[VideoCleanup] ✅ Cleanup completed: ${cleanedFolders} folder(s) purged, ${totalFreedMb} MB freed.`);

    return { cleanedFolders, freedBytes };
  }

  /**
   * Starts the automatic periodic cleanup timer.
   * Runs once on startup, then every intervalMs (default: 1 hour).
   */
  public start(intervalMs: number = 60 * 60 * 1000): void {
    if (this.timer) {
      console.log('[VideoCleanup] ℹ Cleanup service is already running.');
      return;
    }

    console.log(`[VideoCleanup] 🕒 Starting automated video cleanup (interval: ${(intervalMs / (60 * 1000)).toFixed(0)}m, retention: ${this.defaultRetentionHours}h)`);

    // Run first cleanup in background shortly after startup (10 seconds)
    if (process.env.NODE_ENV !== 'test') {
      setTimeout(() => {
        this.cleanupStaleRenders().catch((err) => {
          console.warn('[VideoCleanup] Initial cleanup warning:', err?.message);
        });
      }, 10000);
    }

    // Schedule periodic recurring interval
    this.timer = setInterval(() => {
      this.cleanupStaleRenders().catch((err) => {
        console.warn('[VideoCleanup] Periodic cleanup warning:', err?.message);
      });
    }, intervalMs);

    // Ensure timer does not prevent process termination
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Stops the automated periodic cleanup timer.
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[VideoCleanup] 🛑 Stopped automated video cleanup.');
    }
  }
}

export const videoCleanupService = new VideoCleanupService();
