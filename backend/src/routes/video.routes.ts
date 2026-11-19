import { Router, Request, Response } from 'express';
import fs from 'fs';
import { videoComposer } from '../services/video/videoComposer';
import { videoJobManager } from '../services/video/jobManager';

const router = Router();

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
 * Streams or downloads generated video file
 */
router.get('/download/:jobId', (req: Request, res: Response): void => {
  const jobId = req.params.jobId as string;
  const job = videoJobManager.getJob(jobId);

  if (!job || job.status !== 'COMPLETED' || !job.videoPath) {
    res.status(404).json({ error: 'Video is not ready or does not exist.' });
    return;
  }

  if (!fs.existsSync(job.videoPath)) {
    res.status(404).json({ error: 'Video file not found on disk.' });
    return;
  }

  res.download(job.videoPath, `goalcast_${jobId}.mp4`);
});

/**
 * GET /api/video/thumbnail/:jobId
 * Returns extracted thumbnail image
 */
router.get('/thumbnail/:jobId', (req: Request, res: Response): void => {
  const jobId = req.params.jobId as string;
  const job = videoJobManager.getJob(jobId);

  if (!job || !job.thumbnailPath || !fs.existsSync(job.thumbnailPath)) {
    res.status(404).json({ error: 'Thumbnail not found.' });
    return;
  }

  res.sendFile(job.thumbnailPath);
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
    const thumbnailTimestamp = parseFloat(params.thumbnailTimestamp) || 3.0;

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
    const result = await videoComposer.renderVideo({
      jobId,
      targetDate,
      games,
      backgroundVideo,
      backgroundAudio,
      voiceActor,
      thumbnailTimestamp,
      previousWonGroup: params.previousWonGroup,
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
      thumbnailUrl: `/api/video/thumbnail/${jobId}`
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
