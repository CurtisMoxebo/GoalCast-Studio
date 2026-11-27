import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { directPostRegistry } from '../services/directPost/directPostRegistry';
import { DirectMediaType, DirectPostResult } from '../services/directPost/types';

const router = Router();

const ALLOWED_PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.webm']);

function getDirectPostUploadsDir(): string {
  const dir = path.join(os.tmpdir(), 'goalcast_render', 'direct_post_uploads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * GET /api/direct-post/platforms
 * Lists all registered direct-post social media platforms and supported media types.
 */
router.get('/platforms', (_req: Request, res: Response): void => {
  res.json({
    enabledMediaTypes: ['text', 'photo'] as DirectMediaType[], // 'video' will be enabled here later
    platforms: directPostRegistry.getPlatformMetadata()
  });
});

/**
 * POST /api/direct-post/upload?mediaType=photo|video&filename=...
 * Streams a photo (or future video) binary into temporary storage for direct publishing.
 */
router.post('/upload', (req: Request, res: Response): void => {
  const mediaType = String(req.query.mediaType || 'photo').toLowerCase() as DirectMediaType;
  const rawFilename = String(req.query.filename || '');

  if (mediaType !== 'photo' && mediaType !== 'video') {
    res.status(400).json({ error: 'Query parameter "mediaType" must be "photo" or "video".' });
    return;
  }

  if (mediaType === 'video') {
    res.status(400).json({ error: 'Video direct posting is coming soon. Please upload a photo for now.' });
    return;
  }

  const rawExt = path.extname(path.basename(rawFilename)).toLowerCase();
  const ext =
    mediaType === 'photo'
      ? ALLOWED_PHOTO_EXTS.has(rawExt) ? rawExt : '.jpg'
      : ALLOWED_VIDEO_EXTS.has(rawExt) ? rawExt : '.mp4';

  const token = `direct_${mediaType}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
  const destPath = path.join(getDirectPostUploadsDir(), token);

  const MAX_BYTES = 50 * 1024 * 1024; // 50 MB cap for photos (expandable for video)
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
      res.status(413).json({ error: 'Uploaded file exceeds 50 MB limit.' });
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
    res.status(500).json({ error: err?.message || 'Failed to save uploaded media.' });
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
      `[DirectPostRoutes] 📤 Stored ${mediaType} for direct post: ${token} (${(receivedBytes / 1024).toFixed(1)} KB)`
    );
    res.status(201).json({
      success: true,
      mediaToken: token,
      mediaType,
      sizeBytes: receivedBytes
    });
  });

  req.pipe(writeStream);
});

/**
 * POST /api/direct-post/publish
 * Publishes text-only, photo (+ optional description), or future video across selected platforms.
 */
router.post('/publish', async (req: Request, res: Response): Promise<void> => {
  const { mediaToken, mediaType, description = '', platforms } = req.body || {};
  const trimmedDesc = String(description || '').trim();

  let effectiveMediaType: DirectMediaType = mediaToken ? (mediaType || 'photo') : 'text';
  let mediaPath: string | undefined;
  let safeToken: string | undefined;

  if (mediaToken) {
    if (typeof mediaToken !== 'string') {
      res.status(400).json({ error: 'Invalid mediaToken.' });
      return;
    }
    safeToken = path.basename(mediaToken);
    if (!safeToken.startsWith('direct_photo_') && !safeToken.startsWith('direct_video_')) {
      res.status(400).json({ error: 'Invalid mediaToken.' });
      return;
    }
    mediaPath = path.join(getDirectPostUploadsDir(), safeToken);
    if (!fs.existsSync(mediaPath)) {
      res.status(404).json({ error: 'Uploaded media file not found or already expired.' });
      return;
    }
  } else if (!trimmedDesc) {
    res.status(400).json({ error: 'Please provide a photo or a written description to post.' });
    return;
  } else {
    effectiveMediaType = 'text';
  }

  const targetIds: string[] =
    Array.isArray(platforms) && platforms.length > 0
      ? platforms
      : directPostRegistry.getAll().map((p) => p.id);

  const results: DirectPostResult[] = [];

  for (const platformId of targetIds) {
    const publisher = directPostRegistry.get(platformId);
    if (!publisher) {
      results.push({
        platform: platformId,
        platformName: platformId,
        status: 'FAILED',
        error: `Unsupported social platform: ${platformId}`
      });
      continue;
    }

    if (!publisher.supportedMediaTypes.includes(effectiveMediaType)) {
      results.push({
        platform: publisher.id,
        platformName: publisher.name,
        status: 'FAILED',
        error: `${publisher.name} does not support ${effectiveMediaType} posts yet.`
      });
      continue;
    }

    const outcome = await publisher.publish({
      mediaType: effectiveMediaType,
      mediaPath,
      filename: safeToken,
      description: trimmedDesc
    });
    results.push(outcome);
  }

  const allSucceeded = results.length > 0 && results.every((r) => r.status === 'SUCCESS');
  res.status(200).json({
    success: allSucceeded,
    results
  });
});

export default router;
