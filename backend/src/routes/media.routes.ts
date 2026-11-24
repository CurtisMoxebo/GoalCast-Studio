import { Router, Request, Response } from 'express';
import { assetsManager } from '../services/video/assetsManager';
import { AVAILABLE_VOICES } from '../services/tts/kokoroTtsService';
import {
  DEFAULT_BACKGROUND_VIDEO,
  DEFAULT_BACKGROUND_AUDIO,
  DEFAULT_VOICE_ACTOR,
  DEFAULT_THUMBNAIL_TIMESTAMP,
  DEFAULT_DESCRIPTION_TEMPLATE
} from '../constants/videoDefaults';

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
      backgroundVideo: videos[0]?.filename || DEFAULT_BACKGROUND_VIDEO,
      backgroundAudio: audio[0]?.filename || DEFAULT_BACKGROUND_AUDIO,
      voiceActor: DEFAULT_VOICE_ACTOR,
      thumbnailTimestamp: DEFAULT_THUMBNAIL_TIMESTAMP,
      descriptionTemplate: DEFAULT_DESCRIPTION_TEMPLATE
    }
  });
});

export default router;
