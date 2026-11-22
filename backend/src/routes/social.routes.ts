import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import prisma from '../db/prisma';
import { socialPipelineService } from '../services/social/socialPipelineService';
import { videoJobManager } from '../services/video/jobManager';

const router = Router();

/**
 * Helper to locate the rendered video file on disk for a given jobId/groupId
 */
function resolveVideoPath(groupId: string): string | null {
  // Check in-memory job manager
  const job = videoJobManager.getJob(groupId);
  if (job?.videoPath && fs.existsSync(job.videoPath)) {
    return job.videoPath;
  }

  // Check temp rendering directories
  const renderBase = path.join(os.tmpdir(), 'goalcast_render');
  if (fs.existsSync(renderBase)) {
    const directFolder = path.join(renderBase, groupId);
    if (fs.existsSync(directFolder) && fs.statSync(directFolder).isDirectory()) {
      const files = fs.readdirSync(directFolder);
      const mp4 = files.find((f) => f.endsWith('.mp4'));
      if (mp4) return path.join(directFolder, mp4);
    }

    // Search subfolders matching groupId
    const entries = fs.readdirSync(renderBase);
    for (const entry of entries) {
      if (entry.includes(groupId)) {
        const fullDir = path.join(renderBase, entry);
        if (fs.statSync(fullDir).isDirectory()) {
          const files = fs.readdirSync(fullDir);
          const mp4 = files.find((f) => f.endsWith('.mp4'));
          if (mp4) return path.join(fullDir, mp4);
        }
      }
    }

    // Fallback: newest rendered video
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

  return null;
}

/**
 * POST /api/social/schedule
 * Triggers scheduled publishing across all social media platforms (Facebook, Instagram, TikTok, YouTube)
 * Enforces strictly that scheduledPostTime must be at least 30 minutes in the future.
 */
router.post('/schedule', async (req: Request, res: Response): Promise<void> => {
  try {
    const { groupId, scheduledPostTime, description } = req.body;

    if (!groupId) {
      res.status(400).json({ error: 'Missing groupId in request body.' });
      return;
    }

    if (!scheduledPostTime) {
      res.status(400).json({ error: 'Missing scheduledPostTime in request body.' });
      return;
    }

    const scheduledDate = new Date(scheduledPostTime);
    if (isNaN(scheduledDate.getTime())) {
      res.status(400).json({ error: 'Invalid scheduledPostTime date format.' });
      return;
    }

    // Strict validation: must be at least 30 minutes in the future
    const now = Date.now();
    const diffMinutes = (scheduledDate.getTime() - now) / (1000 * 60);
    if (diffMinutes < 29.5) {
      res.status(400).json({
        error: 'Scheduled post date & time must be at least 30 minutes in the future.'
      });
      return;
    }

    // Resolve group details from DB or fallbacks
    let targetDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    let finalDesc = description || '';

    try {
      const group = await prisma.predictionGroup.findUnique({
        where: { id: groupId }
      });
      if (group) {
        targetDate = group.targetDate.toISOString().split('T')[0];
        if (!finalDesc) finalDesc = group.description;

        // Persist scheduledPostTime on group
        await prisma.predictionGroup.update({
          where: { id: groupId },
          data: { scheduledPostTime: scheduledDate }
        });
      }
    } catch {}

    const videoPath = resolveVideoPath(groupId);
    if (!videoPath || !fs.existsSync(videoPath)) {
      res.status(404).json({
        error: 'Video file for this group was not found on server or is still generating.'
      });
      return;
    }

    // Execute the social media publishing pipeline (with sequential fail-safe continuation)
    const pipelineResult = await socialPipelineService.executePipeline({
      groupId,
      videoPath,
      description: finalDesc,
      targetDate,
      scheduledPostTime: scheduledDate
    });

    res.json({
      success: true,
      message: 'Social media scheduled posting pipeline completed',
      pipeline: pipelineResult
    });
  } catch (error: any) {
    console.error('[SocialRoutes] Schedule error:', error);
    res.status(500).json({
      error: 'Failed to schedule social posts',
      details: error?.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/social/pipeline/:groupId
 * Returns the latest saved social post pipeline for a prediction group
 */
router.get('/pipeline/:groupId', async (req: Request, res: Response): Promise<void> => {
  try {
    const groupId = req.params.groupId as string;
    const pipeline = await socialPipelineService.getPipelineForGroup(groupId);

    if (!pipeline) {
      res.status(404).json({ error: 'No social pipeline found for this group' });
      return;
    }

    res.json({
      success: true,
      pipeline
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch social pipeline', details: error?.message });
  }
});

/**
 * GET /
 * Public Root Landing Page with TikTok & Meta verification
 */
router.get('/', (_req: Request, res: Response): void => {
  res.type('html').send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="tiktok-developers-site-verification" content="STIS1UdjTjvMgdgyr1PJeM9f50gqxrTU" />
      <title>GoalCast Studio</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 60px auto; padding: 0 20px; color: #1e293b; text-align: center; }
        h1 { color: #0284c7; font-size: 2.2rem; }
        p { color: #475569; font-size: 1.1rem; }
        .links { margin-top: 30px; }
        .links a { margin: 0 15px; color: #0284c7; text-decoration: none; font-weight: 600; }
        .links a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <h1>⚽ GoalCast Studio API</h1>
      <p>Automated Football Analysis, AI Predictions, and Multi-Platform Social Media Publishing Hub.</p>
      <div class="links">
        <a href="/terms">Terms of Service</a>
        <a href="/privacy">Privacy Policy</a>
      </div>
    </body>
    </html>
  `);
});

/**
 * TikTok Developer Domain Verification Routes
 */
const TIKTOK_VERIFICATION_TOKEN = 'tiktok-developers-site-verification=STIS1UdjTjvMgdgyr1PJeM9f50gqxrTU';

router.get('/tiktok-developers-site-verification=STIS1UdjTjvMgdgyr1PJeM9f50gqxrTU.txt', (_req: Request, res: Response): void => {
  res.type('text/plain').send(TIKTOK_VERIFICATION_TOKEN);
});

router.get('/tiktok-developers-site-verification=STIS1UdjTjvMgdgyr1PJeM9f50gqxrTU', (_req: Request, res: Response): void => {
  res.type('text/plain').send(TIKTOK_VERIFICATION_TOKEN);
});

router.get('/tiktok-developers-site-verification.txt', (_req: Request, res: Response): void => {
  res.type('text/plain').send(TIKTOK_VERIFICATION_TOKEN);
});

/**
 * GET /terms
 * Public Terms of Service page for Meta & TikTok compliance
 */
router.get('/terms', (_req: Request, res: Response): void => {
  res.type('html').send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="tiktok-developers-site-verification" content="STIS1UdjTjvMgdgyr1PJeM9f50gqxrTU" />
      <title>GoalCast Studio - Terms of Service</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1e293b; }
        h1 { color: #0284c7; }
        h2 { color: #0f172a; margin-top: 30px; }
      </style>
    </head>
    <body>
      <h1>Terms of Service</h1>
      <p>Last updated: November 2026</p>
      <p>Welcome to <strong>GoalCast Studio</strong>. By using our platform, mobile application, and automated social publishing services, you agree to these Terms.</p>
      <h2>1. Purpose of Service</h2>
      <p>GoalCast Studio provides AI-assisted football match statistical analysis, video highlights generation, and social media scheduling automation.</p>
      <h2>2. Social Media Publishing</h2>
      <p>Our platform enables scheduled publishing to YouTube, Facebook, Instagram, and TikTok on behalf of authenticated account owners in accordance with respective platform terms and developer policies.</p>
      <h2>3. Limitation of Liability</h2>
      <p>Football predictions and match analytics provided by the service are for informational and entertainment purposes only.</p>
    </body>
    </html>
  `);
});

/**
 * GET /privacy
 * Public Privacy Policy page for Meta & TikTok compliance
 */
router.get('/privacy', (_req: Request, res: Response): void => {
  res.type('html').send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="tiktok-developers-site-verification" content="STIS1UdjTjvMgdgyr1PJeM9f50gqxrTU" />
      <title>GoalCast Studio - Privacy Policy</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1e293b; }
        h1 { color: #0284c7; }
        h2 { color: #0f172a; margin-top: 30px; }
      </style>
    </head>
    <body>
      <h1>Privacy Policy</h1>
      <p>Last updated: November 2026</p>
      <p><strong>GoalCast Studio</strong> respects your privacy and is committed to protecting your personal data.</p>
      <h2>1. Information We Collect</h2>
      <p>We only collect data necessary to generate football prediction videos and deliver scheduled posts to your linked social media channels via official developer APIs.</p>
      <h2>2. Use of Social Media APIs</h2>
      <p>Our integration with Google YouTube Data API, Meta Graph API, and TikTok Content Posting API strictly respects user consent and only publishes content explicitly approved by the user.</p>
      <h2>3. Data Protection</h2>
      <p>We do not sell, rent, or trade your personal information or API tokens with third parties.</p>
    </body>
    </html>
  `);
});

export default router;
