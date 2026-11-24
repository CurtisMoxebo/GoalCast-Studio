import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { prisma } from '../db/prisma';
import { getAIService } from '../services/ai/aiFactory';
import {
  BETTING_CATEGORIES,
  BETTING_OPTIONS,
  BETTING_RULES,
  findBettingOptionByCode
} from '../constants/bettingRules';
import { videoComposer } from '../services/video/videoComposer';
import { videoJobManager } from '../services/video/jobManager';
import { getPreviousHitGameGroup } from '../services/predictions/previousHitService';
import {
  DEFAULT_BACKGROUND_VIDEO,
  DEFAULT_BACKGROUND_AUDIO,
  DEFAULT_VOICE_ACTOR,
  DEFAULT_THUMBNAIL_TIMESTAMP
} from '../constants/videoDefaults';
import { overlayGenerator } from '../services/video/overlayGenerator';

const router = Router();

/**
 * GET /api/predictions/options
 * Returns available betting categories, options, and rules
 */
router.get('/options', (_req: Request, res: Response) => {
  res.json({
    categories: BETTING_CATEGORIES,
    options: BETTING_OPTIONS,
    rules: BETTING_RULES
  });
});

/**
 * POST /api/predictions/ai
 * Prompts AI to generate predictions for the provided matches
 */
router.post('/ai', async (req: Request, res: Response): Promise<void> => {
  const reqStart = Date.now();
  const timestamp = new Date().toISOString();
  console.log(`\n==================== [PredictionsRoute] POST /api/predictions/ai [${timestamp}] ====================`);
  console.log(`[PredictionsRoute] 📥 Request received from client (${req.ip || 'unknown IP'})`);

  try {
    const { games } = req.body;
    console.log(`[PredictionsRoute] 📦 Raw payload games count: ${Array.isArray(games) ? games.length : typeof games}`);

    if (!Array.isArray(games) || games.length === 0) {
      console.warn('[PredictionsRoute] ⚠️ Validation failed: games array is missing or empty.');
      res.status(400).json({ error: 'Please provide at least one game to predict.' });
      return;
    }

    if (games.length > BETTING_RULES.maxGamesPredicted) {
      console.warn(`[PredictionsRoute] ⚠️ Validation failed: ${games.length} games requested, max allowed is ${BETTING_RULES.maxGamesPredicted}`);
      res.status(400).json({
        error: `Cannot predict more than ${BETTING_RULES.maxGamesPredicted} games at once.`
      });
      return;
    }

    console.log(`[PredictionsRoute] 📋 Matches received for statistical prediction (${games.length}):`);
    games.forEach((g: any, idx: number) => {
      console.log(`  [${idx + 1}/${games.length}] ${g.homeTeam} vs ${g.awayTeam} (${g.competition || 'No League'}) [ID: ${g.id}]`);
    });

    const ai = getAIService();
    console.log(`[PredictionsRoute] 🤖 Resolved AI Service provider: "${ai.providerName}"`);
    console.log(`[PredictionsRoute] ⏳ Invoking ai.generatePredictions()...`);

    const predictions = await ai.generatePredictions(games);
    const durationMs = Date.now() - reqStart;

    console.log(`[PredictionsRoute] ✅ Statistical predictions successfully generated in ${durationMs}ms`);
    console.log(`[PredictionsRoute] 📊 Predictions summary (${predictions.length} games returned):`);
    predictions.forEach((p, idx) => {
      const picks = p.predictions.map((x) => `${x.code} (${x.confidence ? Math.round(x.confidence * 100) : 80}%)`).join(', ');
      console.log(`  [${idx + 1}] ${p.homeTeam} vs ${p.awayTeam} => [${picks || 'NO PICKS'}]`);
    });
    console.log(`========================================================================================\n`);

    res.json({
      success: true,
      count: predictions.length,
      predictions
    });
  } catch (error: any) {
    const durationMs = Date.now() - reqStart;
    console.error(`\n❌ [PredictionsRoute] AI statistical prediction generation FAILED after ${durationMs}ms:`);
    console.error(`  Error Name: ${error?.name}`);
    console.error(`  Error Message: ${error?.message}`);
    console.error(`  Error Code/Status: ${error?.status || error?.code || 'N/A'}`);
    if (error?.stack) {
      console.error(`  Stack Trace:\n${error.stack}`);
    }
    if (error?.response?.data || error?.errorDetails) {
      console.error(`  Error Details:\n`, JSON.stringify(error?.response?.data || error?.errorDetails, null, 2));
    }
    console.error(`========================================================================================\n`);

    res.status(500).json({
      error: 'Failed to generate AI predictions',
      details: error?.message || 'Internal error'
    });
  }
});

/**
 * POST /api/predictions/preview
 * Initiates video generation, saves group in PREVIEW status
 */
router.post('/preview', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      targetDate,
      games,
      backgroundVideo = DEFAULT_BACKGROUND_VIDEO,
      backgroundAudio = DEFAULT_BACKGROUND_AUDIO,
      voiceActor = DEFAULT_VOICE_ACTOR,
      thumbnailTimestamp = DEFAULT_THUMBNAIL_TIMESTAMP,
      description = '',
      scheduledPostTime
    } = req.body;

    if (!Array.isArray(games) || games.length === 0) {
      res.status(400).json({ error: 'Please select at least one game.' });
      return;
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    videoJobManager.createJob(jobId);

    // Format games for video composer and database, strictly preserving AI-provided logos
    const mappedGames = games.map((g: any, index: number) => {
      const selections = (g.selections || []).map((sel: any) => {
        const opt = findBettingOptionByCode(sel.code);
        return {
          code: sel.code,
          label: sel.label || opt?.label || sel.code,
          spokenText: sel.spokenText || opt?.label || sel.code,
          category: sel.category || opt?.category || 'RESULT'
        };
      });

      return {
        homeTeam: g.homeTeam,
        homeTeamLogo: g.homeTeamLogo || undefined,
        awayTeam: g.awayTeam,
        awayTeamLogo: g.awayTeamLogo || undefined,
        competition: g.competition,
        competitionLogo: g.competitionLogo || undefined,
        kickoffTime: g.kickoffTime,
        orderIndex: index,
        selections
      };
    });

    // In case any game is missing logos from client, resolve directly from real official fixtures
    const hasMissingLogos = mappedGames.some((m) => !m.homeTeamLogo || !m.awayTeamLogo);
    if (hasMissingLogos) {
      try {
        const { RealFixturesService } = await import('../services/fixtures/realFixturesService');
        const officialMatches = await RealFixturesService.fetchRealFixtures(targetDate);
        for (const mg of mappedGames) {
          const match = officialMatches.find(
            (o) =>
              o.homeTeam.toLowerCase().trim() === mg.homeTeam.toLowerCase().trim() ||
              o.awayTeam.toLowerCase().trim() === mg.awayTeam.toLowerCase().trim()
          );
          if (match) {
            if (!mg.homeTeamLogo && match.homeTeamLogo) mg.homeTeamLogo = match.homeTeamLogo;
            if (!mg.awayTeamLogo && match.awayTeamLogo) mg.awayTeamLogo = match.awayTeamLogo;
            if (!mg.competitionLogo && match.competitionLogo) mg.competitionLogo = match.competitionLogo;
          }
        }
      } catch (e: any) {
        console.warn('[PredictionsRoute] Fixture logo fallback lookup failed:', e.message);
      }
    }

    // Check for previous hit prediction group with status ACCEPTED (or evaluate with AI)
    let previousWonGroup: { games: any[] } | undefined = (await getPreviousHitGameGroup()) || undefined;
    let savedGroupId = jobId;

    try {
      // Save this new prediction group with PREVIEW status
      const created = await prisma.predictionGroup.create({
        data: {
          status: 'PREVIEW',
          targetDate: new Date(targetDate),
          description: description || `Football predictions for ${targetDate}`,
          backgroundVideo,
          backgroundAudio,
          voiceActor,
          thumbnailTimestamp: parseFloat(thumbnailTimestamp) || DEFAULT_THUMBNAIL_TIMESTAMP,
          scheduledPostTime: scheduledPostTime ? new Date(scheduledPostTime) : null,
          games: {
            create: mappedGames.map((g: any) => ({
              homeTeam: g.homeTeam,
              homeTeamLogo: g.homeTeamLogo || null,
              awayTeam: g.awayTeam,
              awayTeamLogo: g.awayTeamLogo || null,
              competition: g.competition,
              competitionLogo: g.competitionLogo || null,
              kickoffTime: new Date(g.kickoffTime),
              orderIndex: g.orderIndex,
              selections: {
                create: g.selections.map((s: any) => ({
                  category: s.category,
                  code: s.code,
                  label: s.label,
                  spokenText: s.spokenText
                }))
              }
            }))
          }
        }
      });
      savedGroupId = created.id;
    } catch (dbErr) {
      console.warn('[PredictionsRoute] DB save skipped (MariaDB might not be connected yet):', dbErr);
    }

    // Launch video rendering in background
    (async () => {
      try {
        const result = await videoComposer.renderVideo({
          jobId,
          targetDate,
          games: mappedGames,
          backgroundVideo,
          backgroundAudio,
          voiceActor,
          thumbnailTimestamp,
          previousWonGroup,
          onProgress: (pct, msg) => {
            videoJobManager.updateProgress(jobId, pct, msg);
          }
        });
        videoJobManager.completeJob(jobId, result);
      } catch (err: any) {
        console.error('[PredictionsRoute] Video render job failed:', err);
        videoJobManager.failJob(jobId, err?.message || 'Rendering error');
      }
    })();

    res.json({
      success: true,
      jobId,
      groupId: savedGroupId,
      status: 'PREVIEW',
      message: 'Video rendering started'
    });
  } catch (error: any) {
    console.error('[PredictionsRoute] Preview initiation failed:', error);
    res.status(500).json({
      error: 'Failed to initiate video preview',
      details: error?.message || 'Internal error'
    });
  }
});

/**
 * POST /api/predictions/status
 * Updates status of prediction group(s) (ACCEPTED, CANCELLED, or DELETED)
 * Supports single groupId or array of groupIds
 */
router.post('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { groupId, groupIds, status } = req.body;
    const validStatuses = ['ACCEPTED', 'CANCELLED', 'DELETED'];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({ error: 'Valid status (ACCEPTED, CANCELLED, or DELETED) is required.' });
      return;
    }

    const targetIds: string[] = Array.isArray(groupIds)
      ? groupIds.filter((id) => typeof id === 'string' && id.trim().length > 0)
      : (groupId && typeof groupId === 'string' ? [groupId] : []);

    if (targetIds.length === 0) {
      res.status(400).json({ error: 'Valid groupId or groupIds array is required.' });
      return;
    }

    try {
      await prisma.predictionGroup.updateMany({
        where: { id: { in: targetIds } },
        data: { status }
      });
    } catch (e) {
      console.warn(`[PredictionsRoute] Could not update status in DB for targetIds ${targetIds.join(', ')}:`, e);
    }

    res.json({
      success: true,
      count: targetIds.length,
      targetIds,
      status
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update status', details: error?.message });
  }
});

/**
 * GET /api/predictions/history
 * Returns list of all ACCEPTED prediction groups with real outcome resolution
 */
router.get('/history', async (_req: Request, res: Response): Promise<void> => {
  try {
    const history = await prisma.predictionGroup.findMany({
      where: { status: 'ACCEPTED' },
      orderBy: { createdAt: 'desc' },
      include: {
        games: {
          include: { selections: true },
          orderBy: { orderIndex: 'asc' }
        },
        socialPipelines: {
          include: { items: true },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    res.json({
      success: true,
      count: history.length,
      history
    });
  } catch (error: any) {
    console.error('[PredictionsRoute] Error fetching history:', error);
    res.json({
      success: true,
      count: 0,
      history: []
    });
  }
});

/**
 * POST /api/predictions/game-outcome
 * Manually updates the real outcome for a single game (HIT, MISS, PENDING),
 * recalculates the parent group's groupOutcome, and persists to MariaDB.
 */
router.post('/game-outcome', async (req: Request, res: Response): Promise<void> => {
  try {
    const { gameId, realOutcome } = req.body;
    if (!gameId) {
      res.status(400).json({ error: 'Missing required field: gameId' });
      return;
    }

    const normalizedOutcome = (realOutcome || 'PENDING').toUpperCase();
    if (!['HIT', 'MISS', 'PENDING'].includes(normalizedOutcome)) {
      res.status(400).json({ error: 'Invalid realOutcome. Allowed: HIT, MISS, PENDING' });
      return;
    }

    // Update game outcome
    const game = await prisma.gamePrediction.update({
      where: { id: gameId },
      data: { realOutcome: normalizedOutcome }
    });

    // Fetch all sibling games in the same group to recompute groupOutcome
    const allGames = await prisma.gamePrediction.findMany({
      where: { groupId: game.groupId }
    });

    let groupOutcome: 'PENDING' | 'HIT' | 'MISS' = 'PENDING';
    if (allGames.some((g) => (g.realOutcome || '').toUpperCase() === 'MISS')) {
      groupOutcome = 'MISS';
    } else if (allGames.length > 0 && allGames.every((g) => (g.realOutcome || '').toUpperCase() === 'HIT')) {
      groupOutcome = 'HIT';
    } else {
      groupOutcome = 'PENDING';
    }

    await prisma.predictionGroup.update({
      where: { id: game.groupId },
      data: { groupOutcome }
    });

    res.json({
      success: true,
      gameId: game.id,
      realOutcome: game.realOutcome,
      groupId: game.groupId,
      groupOutcome
    });
  } catch (error: any) {
    console.error('[PredictionsRoute] Error updating game outcome:', error);
    res.status(500).json({ error: 'Failed to update game outcome', details: error?.message });
  }
});

/**
 * GET /api/predictions/recap-image/:groupId
 * Generates and returns a 1080x1920 recap image for the prediction group
 */
router.get('/recap-image/:groupId', async (req: Request, res: Response): Promise<void> => {
  try {
    const groupId = req.params.groupId as string;
    const download = req.query.download === '1' || req.query.download === 'true';

    const group = await prisma.predictionGroup.findUnique({
      where: { id: groupId },
      include: {
        games: {
          include: { selections: true },
          orderBy: { orderIndex: 'asc' }
        }
      }
    });

    if (!group) {
      res.status(404).json({ error: 'Prediction group not found' });
      return;
    }

    const recapsDir = path.join(os.tmpdir(), 'goalcast_render', 'recaps');
    if (!fs.existsSync(recapsDir)) {
      fs.mkdirSync(recapsDir, { recursive: true });
    }

    const outputPath = path.join(recapsDir, `recap_${groupId}.png`);
    await overlayGenerator.generateGroupRecapImage(group, outputPath);

    if (download) {
      res.download(outputPath, `goalcast_recap_${groupId}.png`);
    } else {
      res.setHeader('Content-Type', 'image/png');
      res.sendFile(outputPath);
    }
  } catch (error: any) {
    console.error('[PredictionsRoute] Error generating recap image:', error);
    res.status(500).json({ error: 'Failed to generate recap image', details: error?.message });
  }
});

/**
 * POST /api/predictions/recap-image/:groupId
 * Triggers generation and returns URL metadata
 */
router.post('/recap-image/:groupId', async (req: Request, res: Response): Promise<void> => {
  try {
    const groupId = req.params.groupId as string;
    const group = await prisma.predictionGroup.findUnique({
      where: { id: groupId },
      include: {
        games: {
          include: { selections: true },
          orderBy: { orderIndex: 'asc' }
        }
      }
    });

    if (!group) {
      res.status(404).json({ error: 'Prediction group not found' });
      return;
    }

    const recapsDir = path.join(os.tmpdir(), 'goalcast_render', 'recaps');
    if (!fs.existsSync(recapsDir)) {
      fs.mkdirSync(recapsDir, { recursive: true });
    }

    const outputPath = path.join(recapsDir, `recap_${groupId}.png`);
    await overlayGenerator.generateGroupRecapImage(group, outputPath);

    res.json({
      success: true,
      groupId,
      groupOutcome: group.groupOutcome,
      imageUrl: `/api/predictions/recap-image/${groupId}`
    });
  } catch (error: any) {
    console.error('[PredictionsRoute] Error generating recap image:', error);
    res.status(500).json({ error: 'Failed to generate recap image', details: error?.message });
  }
});

export default router;
