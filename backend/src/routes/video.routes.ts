import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { videoComposer } from '../services/video/videoComposer';
import { videoJobManager } from '../services/video/jobManager';
import { getPreviousHitGameGroup } from '../services/predictions/previousHitService';

const router = Router();

/**
 * Resolves video path from in-memory manager or disk search
 */
function resolveVideoPath(identifier: string): string | null {
  // 1. Check in-memory job manager
  const job = videoJobManager.getJob(identifier);
  if (job?.videoPath && fs.existsSync(job.videoPath)) {
    return job.videoPath;
  }

  // 2. Check filesystem temp directory
  const renderBase = path.join(os.tmpdir(), 'goalcast_render');
  if (fs.existsSync(renderBase)) {
    // 2a. Direct folder match: goalcast_render/<identifier>/
    const directFolder = path.join(renderBase, identifier);
    if (fs.existsSync(directFolder) && fs.statSync(directFolder).isDirectory()) {
      const files = fs.readdirSync(directFolder);
      const mp4 = files.find((f) => f.endsWith('.mp4'));
      if (mp4) return path.join(directFolder, mp4);
    }

    // 2b. Scan subfolders containing identifier
    const entries = fs.readdirSync(renderBase);
    for (const entry of entries) {
      if (entry.includes(identifier)) {
        const fullDir = path.join(renderBase, entry);
        if (fs.statSync(fullDir).isDirectory()) {
          const files = fs.readdirSync(fullDir);
          const mp4 = files.find((f) => f.endsWith('.mp4'));
          if (mp4) return path.join(fullDir, mp4);
        }
      }
    }

    // 2c. Fallback for UUID groupIds or 'latest' (in production/runtime only): find newest rendered MP4 on disk
    const isUuidOrLatest = identifier === 'latest' || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
    if (isUuidOrLatest && process.env.NODE_ENV !== 'test') {
      const dirsWithMtime = entries
        .map((entry) => {
          const fullDir = path.join(renderBase, entry);
          try {
            const stat = fs.statSync(fullDir);
            return stat.isDirectory() ? { dir: fullDir, mtime: stat.mtimeMs } : null;
          } catch {
            return null;
          }
        })
        .filter((x): x is { dir: string; mtime: number } => x !== null)
        .sort((a, b) => b.mtime - a.mtime);

      for (const d of dirsWithMtime) {
        try {
          const files = fs.readdirSync(d.dir);
          const mp4 = files.find((f) => f.endsWith('.mp4'));
          if (mp4) return path.join(d.dir, mp4);
        } catch {}
      }
    }
  }

  return null;
}

/**
 * Resolves thumbnail path from in-memory manager or disk search
 */
function resolveThumbnailPath(identifier: string): string | null {
  const job = videoJobManager.getJob(identifier);
  if (job?.thumbnailPath && fs.existsSync(job.thumbnailPath)) {
    return job.thumbnailPath;
  }

  const renderBase = path.join(os.tmpdir(), 'goalcast_render');
  if (fs.existsSync(renderBase)) {
    const directFolder = path.join(renderBase, identifier);
    if (fs.existsSync(directFolder) && fs.statSync(directFolder).isDirectory()) {
      const thumb = path.join(directFolder, 'thumbnail.jpg');
      if (fs.existsSync(thumb)) return thumb;
    }
  }

  return null;
}

/**
 * GET /api/video/progress/:jobId
 * Returns current status of video generation job
 */
router.get('/progress/:jobId', (req: Request, res: Response): void => {
  const jobId = req.params.jobId as string;
  const job = videoJobManager.getJob(jobId);

  if (!job) {
    res.status(404).json({ error: 'Video generation job not found' });
    return;
  }

  res.json(job);
});

/**
 * GET /api/video/download/:jobId
 * Streams video file with full HTTP Range (206) support for mobile video players
 */
router.get('/download/:jobId', (req: Request, res: Response): void => {
  const jobId = req.params.jobId as string;
  const videoPath = resolveVideoPath(jobId);

  if (!videoPath || !fs.existsSync(videoPath)) {
    res.status(404).json({ error: 'Video is not ready or does not exist.' });
    return;
  }

  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize) {
      res.status(416).send('Requested range not satisfiable');
      return;
    }

    const chunksize = end - start + 1;
    const file = fs.createReadStream(videoPath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4'
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes'
    });
    fs.createReadStream(videoPath).pipe(res);
  }
});

/**
 * GET /api/video/thumbnail/:jobId
 * Returns extracted thumbnail image
 */
router.get('/thumbnail/:jobId', (req: Request, res: Response): void => {
  const jobId = req.params.jobId as string;
  const thumbPath = resolveThumbnailPath(jobId);

  if (!thumbPath || !fs.existsSync(thumbPath)) {
    res.status(404).json({ error: 'Thumbnail not found.' });
    return;
  }

  res.sendFile(thumbPath);
});

/**
 * POST or GET /api/video/test
 * Test route for video generation with fallback defaults for all parameters
 */
const handleTestRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const params = req.method === 'POST' ? req.body : req.query;
    const jobId = `test_${Date.now()}`;

    // Defaults for testing
    const targetDate = params.targetDate || new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const backgroundVideo = params.backgroundVideo || 'background_video_1.mp4';
    const backgroundAudio = params.backgroundAudio || 'background_track_1.mp3';
    const voiceActor = params.voiceActor || 'hearth';
    const thumbnailTimestamp = parseFloat(params.thumbnailTimestamp) || 5.0;

    const defaultGames = [
      {
        homeTeam: 'Real Madrid',
        awayTeam: 'Barcelona',
        homeTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/5/56/Real_Madrid_CF.svg',
        awayTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/4/47/FC_Barcelona_%28crest%29.svg',
        competition: 'La Liga',
        kickoffTime: `${targetDate}T20:00:00Z`,
        selections: [
          {
            code: 'BTTS_YES',
            label: 'Both Teams to Score - Yes',
            spokenText: 'Both teams to score'
          }
        ]
      },
      {
        homeTeam: 'Arsenal',
        awayTeam: 'Chelsea',
        homeTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/5/53/Arsenal_FC.svg',
        awayTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/c/cc/Chelsea_FC.svg',
        competition: 'Premier League',
        kickoffTime: `${targetDate}T17:30:00Z`,
        selections: [
          {
            code: '1X',
            label: 'Home or Draw (1X)',
            spokenText: 'Arsenal to win or draw'
          }
        ]
      }
    ];

    const games = Array.isArray(params.games) && params.games.length > 0 ? params.games : defaultGames;

    videoJobManager.createJob(jobId);

    // Run asynchronously or await
    const previousWonGroup = params.previousWonGroup || (await getPreviousHitGameGroup()) || undefined;

    const result = await videoComposer.renderVideo({
      jobId,
      targetDate,
      games,
      backgroundVideo,
      backgroundAudio,
      voiceActor,
      thumbnailTimestamp,
      previousWonGroup,
      onProgress: (percent, step) => {
        videoJobManager.updateProgress(jobId, percent, step);
      }
    });

    videoJobManager.completeJob(jobId, result);

    res.json({
      success: true,
      jobId,
      message: 'Test video generation complete',
      durationSeconds: result.durationSeconds,
      downloadUrl: `/api/video/download/${jobId}`,
      ...(result.thumbnailPath ? { thumbnailUrl: `/api/video/thumbnail/${jobId}` } : {})
    });
  } catch (error: any) {
    console.error('[VideoTestRoute] Error generating video:', error);
    res.status(500).json({
      error: 'Failed to generate test video',
      details: error?.message || 'Internal render error'
    });
  }
};

router.post('/test', handleTestRoute);
router.get('/test', handleTestRoute);

export default router;
