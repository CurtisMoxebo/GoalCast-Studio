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
  const reqStart = Date.now();
  console.log(`\n================== [POST /api/social/schedule] ==================`);
  console.log(`[SocialRoutes] 🕒 Request timestamp: ${new Date().toISOString()}`);
  console.log(`[SocialRoutes] 🌐 Client IP: ${req.ip || req.socket.remoteAddress || 'unknown'}`);
  console.log(`[SocialRoutes] 📦 Request Body:`, JSON.stringify(req.body, null, 2));

  try {
    const { groupId, scheduledPostTime, isInstant, description, thumbnailTimestamp, platforms } = req.body;

    if (!groupId) {
      console.warn('[SocialRoutes] ❌ Rejected: Missing groupId in request body.');
      res.status(400).json({ error: 'Missing groupId in request body.' });
      return;
    }

    const isInstantMode = Boolean(isInstant || scheduledPostTime === 'instant' || !scheduledPostTime);
    let scheduledDate: Date | undefined = undefined;

    if (!isInstantMode) {
      const parsedDate = new Date(scheduledPostTime);
      if (isNaN(parsedDate.getTime())) {
        console.warn(`[SocialRoutes] ❌ Rejected: Invalid scheduledPostTime date format ("${scheduledPostTime}")`);
        res.status(400).json({ error: 'Invalid scheduledPostTime date format.' });
        return;
      }

      // Strict validation: must be at least 30 minutes in the future
      const now = Date.now();
      const diffMinutes = (parsedDate.getTime() - now) / (1000 * 60);
      if (diffMinutes < 29.5) {
        console.warn(`[SocialRoutes] ❌ Rejected: Scheduled post time (${parsedDate.toISOString()}) is only ${diffMinutes.toFixed(1)}m in the future. Must be >= 30m.`);
        res.status(400).json({
          error: 'Scheduled post date & time must be at least 30 minutes in the future.'
        });
        return;
      }
      scheduledDate = parsedDate;
      console.log(`[SocialRoutes] 📅 Scheduled Mode validated: ${scheduledDate.toISOString()} (~${diffMinutes.toFixed(1)} mins from now)`);
    } else {
      console.log(`[SocialRoutes] ⚡ Instant Post Mode enabled: video will be published immediately upon pipeline trigger.`);
    }

    // Resolve group details from DB or fallbacks
    let targetDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    let finalDesc = description || '';
    let finalThumbnailTimestamp: number | undefined =
      typeof thumbnailTimestamp === 'number' && !isNaN(thumbnailTimestamp)
        ? thumbnailTimestamp
        : (typeof thumbnailTimestamp === 'string' && !isNaN(parseFloat(thumbnailTimestamp))
            ? parseFloat(thumbnailTimestamp)
            : undefined);

    try {
      console.log(`[SocialRoutes] 🔍 Querying database for PredictionGroup "${groupId}"...`);
      const group = await prisma.predictionGroup.findUnique({
        where: { id: groupId }
      });
      if (group) {
        targetDate = group.targetDate.toISOString().split('T')[0];
        if (!finalDesc) finalDesc = group.description;
        if (finalThumbnailTimestamp === undefined && typeof group.thumbnailTimestamp === 'number') {
          finalThumbnailTimestamp = group.thumbnailTimestamp;
        }
        console.log(`[SocialRoutes] ✅ Group found in DB: targetDate=${targetDate}, description="${finalDesc.substring(0, 50)}...", thumbTime=${finalThumbnailTimestamp}s`);

        // Persist scheduledPostTime on group (null if instant)
        await prisma.predictionGroup.update({
          where: { id: groupId },
          data: { scheduledPostTime: scheduledDate ?? null }
        });
        console.log(`[SocialRoutes] 💾 Updated PredictionGroup.scheduledPostTime to ${scheduledDate ? scheduledDate.toISOString() : 'NULL'}`);
      } else {
        console.log(`[SocialRoutes] ℹ Notice: Group "${groupId}" not found in DB (running with payload/defaults)`);
      }
    } catch (dbErr: any) {
      console.warn('[SocialRoutes] ⚠️ DB access warning:', dbErr?.message);
    }

    console.log(`[SocialRoutes] 🔎 Resolving video file path on disk for groupId="${groupId}"...`);
    const videoPath = resolveVideoPath(groupId);
    if (!videoPath || !fs.existsSync(videoPath)) {
      console.error(`[SocialRoutes] ❌ Video file NOT found on disk for groupId="${groupId}". Looked at: ${videoPath || 'none'}`);
      res.status(404).json({
        error: 'Video file for this group was not found on server or is still generating.'
      });
      return;
    }

    const videoStat = fs.statSync(videoPath);
    console.log(`[SocialRoutes] ✅ Video file verified: ${videoPath} (${(videoStat.size / (1024 * 1024)).toFixed(2)} MB)`);

    // Execute the social media publishing pipeline (with sequential fail-safe continuation)
    console.log(`[SocialRoutes] 🚀 Triggering SocialPipelineService for groupId="${groupId}"...`);
    const pipelineResult = await socialPipelineService.executePipeline({
      groupId,
      videoPath,
      description: finalDesc,
      targetDate,
      scheduledPostTime: scheduledDate,
      thumbnailTimestamp: finalThumbnailTimestamp ?? 3.0,
      platforms: Array.isArray(platforms) && platforms.length > 0 ? platforms : undefined
    });

    const elapsed = Date.now() - reqStart;
    console.log(`[SocialRoutes] 🏁 Pipeline completed in ${elapsed}ms. Status: ${pipelineResult.status}`);
    console.log(`=================================================================\n`);

    res.json({
      success: true,
      message: scheduledDate
        ? 'Social media scheduled posting pipeline completed'
        : 'Social media instant posting pipeline completed',
      pipeline: pipelineResult
    });
  } catch (error: any) {
    console.error('[SocialRoutes] ❌ Critical failure during /api/social/schedule:', error);
    if (error?.stack) console.error(error.stack);
    console.error(`=================================================================\n`);
    res.status(500).json({
      error: 'Failed to schedule social posts',
      details: error?.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/social/tiktok/login
 * Initiates the TikTok OAuth 2.0 authorization code flow
 */
router.get('/tiktok/login', (_req: Request, res: Response): void => {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) {
    res.status(500).send('Error: TIKTOK_CLIENT_KEY is not configured in environment.');
    return;
  }
  const redirectUri = encodeURIComponent('https://goalcast-zone-api.moxebocurtis.com/api/social/tiktok/callback');
  // Must match the products/scopes configured on the TikTok Developer App
  const scopes = encodeURIComponent('user.info.basic,video.upload,video.manage');
  const csrfState = Math.random().toString(36).substring(2);

  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&scope=${scopes}&response_type=code&redirect_uri=${redirectUri}&state=${csrfState}`;
  console.log(`[TikTok OAuth] Redirecting to authorization URL`);
  res.redirect(authUrl);
});

/**
 * GET /api/social/tiktok/callback
 * Handles the redirect callback from TikTok with the authorization code
 */
router.get('/tiktok/callback', async (req: Request, res: Response): Promise<void> => {
  const code = req.query.code as string;
  const error = req.query.error as string;
  const errorDesc = req.query.error_description as string;

  if (error || !code) {
    res.type('html').send(`
      <!DOCTYPE html>
      <html>
      <head><title>TikTok Authorization Failed</title></head>
      <body style="font-family:sans-serif; text-align:center; padding: 40px; color:#ef4444;">
        <h2>❌ TikTok Authorization Failed</h2>
        <p>${errorDesc || error || 'No authorization code returned'}</p>
        <a href="/api/social/tiktok/login">Try again</a>
      </body>
      </html>
    `);
    return;
  }

  try {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    if (!clientKey || !clientSecret) {
      throw new Error('TikTok credentials are not configured in environment variables.');
    }
    const redirectUri = 'https://goalcast-zone-api.moxebocurtis.com/api/social/tiktok/callback';

    console.log('[TikTok OAuth] Exchanging authorization code for access token...');
    const bodyParams = new URLSearchParams({
      client_key: clientKey.trim(),
      client_secret: clientSecret.trim(),
      code: code.trim(),
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    });

    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
      body: bodyParams
    });

    const rawText = await tokenRes.text();
    console.log(`[TikTok OAuth] Status: ${tokenRes.status}, Response: ${rawText}`);

    let tokenData: any = {};
    try {
      tokenData = JSON.parse(rawText);
    } catch {
      tokenData = { raw: rawText };
    }

    if (tokenData.data?.access_token || tokenData.access_token) {
      const accessToken = tokenData.data?.access_token || tokenData.access_token;
      const refreshToken = tokenData.data?.refresh_token || tokenData.refresh_token;
      const openId = tokenData.data?.open_id || tokenData.open_id;

      // Update runtime process environment
      process.env.TIKTOK_ACCESS_TOKEN = accessToken;
      process.env.TIKTOK_REFRESH_TOKEN = refreshToken;

      // Persist tokens to disk
      try {
        const tokensPath = path.join(process.cwd(), 'social_tokens.json');
        const existing = fs.existsSync(tokensPath) ? JSON.parse(fs.readFileSync(tokensPath, 'utf8')) : {};
        existing.tiktok = {
          accessToken,
          refreshToken,
          openId,
          savedAt: new Date().toISOString()
        };
        fs.writeFileSync(tokensPath, JSON.stringify(existing, null, 2));
      } catch (saveErr) {
        console.warn('[TikTok OAuth] Could not persist tokens to disk:', saveErr);
      }

      res.type('html').send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>TikTok Connected!</title>
          <style>
            body { font-family: -apple-system, sans-serif; text-align: center; padding: 60px 20px; background: #0f172a; color: #f8fafc; }
            .card { background: #1e293b; max-width: 540px; margin: 0 auto; padding: 40px; border-radius: 16px; border: 1px solid #334155; }
            h1 { color: #10b981; margin-bottom: 12px; }
            p { color: #94a3b8; font-size: 1.1rem; line-height: 1.6; }
            .badge { display: inline-block; padding: 6px 14px; background: #064e3b; color: #34d399; border-radius: 9999px; font-weight: 600; margin-top: 15px; }
            .token-box { margin-top: 25px; text-align: left; background: #0f172a; padding: 18px; border-radius: 10px; border: 1px solid #334155; }
            .token-label { font-size: 0.9rem; color: #38bdf8; font-weight: 600; margin-bottom: 8px; }
            .token-row { display: flex; gap: 8px; }
            .token-input { flex: 1; background: #1e293b; color: #f1f5f9; border: 1px solid #475569; padding: 10px; border-radius: 6px; font-family: monospace; font-size: 0.85rem; }
            .copy-btn { background: #10b981; color: white; border: none; padding: 10px 18px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: background 0.2s; }
            .copy-btn:hover { background: #059669; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>🎉 TikTok Connected Successfully!</h1>
            <p>GoalCast Studio is now authorized to publish videos directly to your TikTok account.</p>
            <div class="badge">Status: Live & Authenticated</div>

            <div class="token-box">
              <div class="token-label">🔑 Local Development Access Token:</div>
              <p style="font-size: 0.85rem; color: #94a3b8; margin: 0 0 10px 0;">If you run GoalCast Studio locally on localhost, paste this in your local <code>backend/.env</code>:</p>
              <div class="token-row">
                <input id="tokenField" class="token-input" value="TIKTOK_ACCESS_TOKEN=${accessToken}" readonly />
                <button class="copy-btn" onclick="navigator.clipboard.writeText('TIKTOK_ACCESS_TOKEN=${accessToken}'); this.innerText='Copied!';">Copy</button>
              </div>
            </div>
          </div>
        </body>
        </html>
      `);
      return;
    }

    const errorDetail = tokenData.error_description || tokenData.error?.message || tokenData.message || tokenData.error || rawText;
    throw new Error(`TikTok HTTP ${tokenRes.status}: ${typeof errorDetail === 'object' ? JSON.stringify(errorDetail) : errorDetail}`);
  } catch (err: any) {
    console.error('[TikTok OAuth] Token exchange error:', err);
    res.type('html').send(`
      <!DOCTYPE html>
      <html>
      <head><title>TikTok Error</title></head>
      <body style="font-family:sans-serif; text-align:center; padding: 40px; color:#ef4444;">
        <h2>❌ Failed to exchange TikTok token</h2>
        <p>${err.message}</p>
        <a href="/api/social/tiktok/login">Try again</a>
      </body>
      </html>
    `);
  }
});

/**
 * GET /api/social/tiktok/token
 * Returns the active TikTok access token stored on the server (for local dev sync)
 */
router.get('/tiktok/token', (_req: Request, res: Response): void => {
  let accessToken = process.env.TIKTOK_ACCESS_TOKEN || '';
  let refreshToken = process.env.TIKTOK_REFRESH_TOKEN || '';

  if (!accessToken) {
    try {
      const tokensPath = path.join(process.cwd(), 'social_tokens.json');
      if (fs.existsSync(tokensPath)) {
        const data = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
        accessToken = data.tiktok?.accessToken || '';
        refreshToken = data.tiktok?.refreshToken || '';
      }
    } catch {}
  }

  if (!accessToken) {
    res.status(404).json({ success: false, error: 'No TikTok token found on server' });
    return;
  }

  res.json({
    success: true,
    accessToken,
    refreshToken
  });
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
      <meta name="tiktok-developers-site-verification" content="EvgQwikhKRCTlBqqzfHBXUZ4sKOC4JSO" />
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
const TIKTOK_TOKENS = [
  'tiktok-developers-site-verification=EvgQwikhKRCTlBqqzfHBXUZ4sKOC4JSO',
  'tiktok-developers-site-verification=STIS1UdjTjvMgdgyr1PJeM9f50gqxrTU'
];

router.get('/tiktok-developers-site-verification=EvgQwikhKRCTlBqqzfHBXUZ4sKOC4JSO.txt', (_req: Request, res: Response): void => {
  res.type('text/plain').send('tiktok-developers-site-verification=EvgQwikhKRCTlBqqzfHBXUZ4sKOC4JSO');
});

router.get('/tiktok-developers-site-verification=STIS1UdjTjvMgdgyr1PJeM9f50gqxrTU.txt', (_req: Request, res: Response): void => {
  res.type('text/plain').send('tiktok-developers-site-verification=STIS1UdjTjvMgdgyr1PJeM9f50gqxrTU');
});

router.get('/tiktok-developers-site-verification.txt', (_req: Request, res: Response): void => {
  res.type('text/plain').send(TIKTOK_TOKENS.join('\n'));
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
      <meta name="tiktok-developers-site-verification" content="EvgQwikhKRCTlBqqzfHBXUZ4sKOC4JSO" />
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
      <meta name="tiktok-developers-site-verification" content="EvgQwikhKRCTlBqqzfHBXUZ4sKOC4JSO" />
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
