import { Router, Request, Response } from 'express';
import { assetsManager } from '../services/video/assetsManager';
import { AVAILABLE_VOICES } from '../services/tts/kokoroTtsService';

const router = Router();

/**
 * GET /api/media/assets
 * Returns available background videos, background music tracks, and TTS voices
 */
router.get('/assets', (_req: Request, res: Response) => {
  const videos = assetsManager.getAvailableBackgroundVideos();
  const audio = assetsManager.getAvailableBackgroundAudio();

  res.json({
    backgroundVideos: videos.map((v) => ({
      id: v.id,
      name: v.name,
      filename: v.filename
    })),
    backgroundAudio: audio.map((a) => ({
      id: a.id,
      name: a.name,
      filename: a.filename
    })),
    voices: AVAILABLE_VOICES,
    defaultSettings: {
      backgroundVideo: videos[0]?.filename || 'background_video_1.mp4',
      backgroundAudio: audio[0]?.filename || 'background_track_1.mp3',
      voiceActor: 'hearth',
      thumbnailTimestamp: 3.0,
      descriptionTemplate:
        'Football predictions for {date} ⚽🔥 \n #football #soccer #predictions #footballpredictions #fyp'
    }
  });
});

export default router;
