import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { assetsManager } from '../services/video/assetsManager';
import { AVAILABLE_VOICES } from '../services/tts/kokoroTtsService';
import { voicePreviewService } from '../services/tts/voicePreviewService';
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
 * Shared HTTP Range-aware media file streamer
 */
function streamFileWithRange(req: Request, res: Response, filePath: string, contentType: string): void {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
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
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600'
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

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

  const lower = safeName.toLowerCase();
  const contentType = lower.endsWith('.mp4')
    ? 'video/mp4'
    : lower.endsWith('.wav')
      ? 'audio/wav'
      : 'audio/mpeg';

  streamFileWithRange(req, res, matched.path, contentType);
});

/**
 * GET /api/media/voice-preview/:voiceId
 * Streams the pre-generated preview WAV for a voice actor (generating & caching it
 * in `<resources>/voice_previews/` on demand if not yet created on disk).
 */
router.get('/voice-preview/:voiceId', async (req: Request, res: Response): Promise<void> => {
  const voiceId = path.basename(String(req.params.voiceId || '')).toLowerCase();

  if (!voicePreviewService.isValidVoiceId(voiceId)) {
    res.status(404).json({ error: 'Voice actor not found' });
    return;
  }

  try {
    const filePath = await voicePreviewService.ensureVoicePreview(voiceId);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Voice preview audio not available' });
      return;
    }
    streamFileWithRange(req, res, filePath, 'audio/wav');
  } catch (err: any) {
    console.error(`[MediaRoutes] ❌ Failed to stream voice preview for "${voiceId}":`, err?.message);
    res.status(500).json({ error: 'Failed to generate voice preview audio' });
  }
});

/**
 * POST /api/media/upload-custom?type=video|audio&filename=...
 * Streams a one-time custom background video or audio file into temp storage
 * (`%TEMP%/goalcast_render/custom_uploads/`) so it is only used for the generated
 * video and never added to the permanent `resources/` library.
 */
router.post('/upload-custom', (req: Request, res: Response): void => {
  const mediaType = String(req.query.type || '').toLowerCase();
  const rawFilename = String(req.query.filename || '');

  if (mediaType !== 'video' && mediaType !== 'audio') {
    res.status(400).json({ error: 'Query parameter "type" must be "video" or "audio".' });
    return;
  }

  const allowedVideoExts = new Set(['.mp4', '.mov', '.m4v', '.webm']);
  const allowedAudioExts = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg']);
  const rawExt = path.extname(path.basename(rawFilename)).toLowerCase();
  const fallbackExt = mediaType === 'video' ? '.mp4' : '.mp3';
  const ext =
    mediaType === 'video'
      ? allowedVideoExts.has(rawExt) ? rawExt : fallbackExt
      : allowedAudioExts.has(rawExt) ? rawExt : fallbackExt;

  const token = `custom_${mediaType}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
  const uploadsDir = assetsManager.getCustomUploadsDir();
  const destPath = path.join(uploadsDir, token);

  const MAX_BYTES = 200 * 1024 * 1024; // 200 MB safety cap
  let receivedBytes = 0;
  let aborted = false;

  const writeStream = fs.createWriteStream(destPath);

  req.on('data', (chunk: Buffer) => {
    receivedBytes += chunk.length;
    if (receivedBytes > MAX_BYTES && !aborted) {
      aborted = true;
      writeStream.destroy();
      try {
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      } catch {}
      res.status(413).json({ error: 'Custom media file exceeds 200 MB limit.' });
      req.destroy();
    }
  });

  req.on('error', (err) => {
    if (aborted) return;
    aborted = true;
    writeStream.destroy();
    try {
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    } catch {}
    res.status(500).json({ error: err?.message || 'Upload stream interrupted.' });
  });

  writeStream.on('error', (err) => {
    if (aborted) return;
    aborted = true;
    try {
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    } catch {}
    res.status(500).json({ error: err?.message || 'Failed to write custom media file.' });
  });

  writeStream.on('finish', () => {
    if (aborted) return;
    if (receivedBytes === 0) {
      try {
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      } catch {}
      res.status(400).json({ error: 'Empty file uploaded.' });
      return;
    }

    console.log(
      `[MediaRoutes] 📤 Stored ephemeral custom ${mediaType}: ${token} (${(receivedBytes / (1024 * 1024)).toFixed(2)} MB)`
    );
    res.status(201).json({
      success: true,
      token,
      type: mediaType,
      sizeBytes: receivedBytes
    });
  });

  req.pipe(writeStream);
});

export default router;
