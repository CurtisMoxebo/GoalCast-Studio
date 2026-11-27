import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
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

/**
 * GET /api/media/stream/:filename
 * Streams a background video (.mp4) or background audio (.mp3 / .wav) asset
 * with HTTP Range support for mobile preview playback.
 */
router.get('/stream/:filename', (req: Request, res: Response): void => {
  const rawName = String(req.params.filename || '');
  const safeName = path.basename(rawName);

  // Strict allowlist: only serve registered background videos or background audio tracks
  const allowedAssets = [
    ...assetsManager.getAvailableBackgroundVideos(),
    ...assetsManager.getAvailableBackgroundAudio()
  ];
  const matched = allowedAssets.find((asset) => asset.filename === safeName);

  if (!matched || !fs.existsSync(matched.path)) {
    res.status(404).json({ error: 'Media asset not found' });
    return;
  }

  const stat = fs.statSync(matched.path);
  const fileSize = stat.size;
  const lower = safeName.toLowerCase();
  const contentType = lower.endsWith('.mp4')
    ? 'video/mp4'
    : lower.endsWith('.wav')
      ? 'audio/wav'
      : 'audio/mpeg';

  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || start < 0 || start >= fileSize || end >= fileSize || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }

    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600'
    });
    fs.createReadStream(matched.path, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600'
    });
    fs.createReadStream(matched.path).pipe(res);
  }
});

export default router;
