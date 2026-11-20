import { Router, Request, Response } from 'express';
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
  try {
    const { games } = req.body;
    if (!Array.isArray(games) || games.length === 0) {
      res.status(400).json({ error: 'Please provide at least one game to predict.' });
      return;
    }

    if (games.length > BETTING_RULES.maxGamesPredicted) {
      res.status(400).json({
        error: `Cannot predict more than ${BETTING_RULES.maxGamesPredicted} games at once.`
      });
      return;
    }

    const ai = getAIService();
    const predictions = await ai.generatePredictions(games);

    res.json({
      success: true,
      count: predictions.length,
      predictions
    });
  } catch (error: any) {
    console.error('[PredictionsRoute] AI prediction generation failed:', error);
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
      backgroundVideo = 'background_video_1.mp4',
      backgroundAudio = 'background_track_1.mp3',
      voiceActor = 'hearth',
      thumbnailTimestamp = 3.0,
      description = ''
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

    // Check for previous prediction group to see if it won (cached in DB or evaluate with AI)
    let previousWonGroup: { games: any[] } | undefined = undefined;
    let savedGroupId = jobId;

    try {
      const lastGroup = await prisma.predictionGroup.findFirst({
        where: { status: 'ACCEPTED' },
        orderBy: { createdAt: 'desc' },
        include: {
          games: {
            include: { selections: true }
          }
        }
      });

      if (lastGroup) {
        let isHit = lastGroup.isHit;

        // If never checked before, check with AI now and persist result
        if (isHit === null) {
          const ai = getAIService();
          const validatable = lastGroup.games.map((g) => ({
            homeTeam: g.homeTeam,
            awayTeam: g.awayTeam,
            kickoffTime: g.kickoffTime.toISOString(),
            selections: g.selections.map((s) => ({
              code: s.code,
              label: s.label,
              category: s.category
            }))
          }));

          const validation = await ai.validatePreviousPredictions(validatable);
          isHit = validation.isHit;

          // Save to database
          await prisma.predictionGroup.update({
            where: { id: lastGroup.id },
            data: {
              isHit: validation.isHit,
              validationNotes: validation.notes,
              validationCheckedAt: new Date()
            }
          });
        }

        if (isHit === true) {
          previousWonGroup = {
            games: lastGroup.games.map((g) => ({
              homeTeam: g.homeTeam,
              homeTeamLogo: g.homeTeamLogo || undefined,
              awayTeam: g.awayTeam,
              awayTeamLogo: g.awayTeamLogo || undefined,
              competition: g.competition,
              competitionLogo: g.competitionLogo || undefined,
              kickoffTime: g.kickoffTime.toISOString(),
              selections: g.selections.map((s) => ({
                code: s.code,
                label: s.label,
                spokenText: s.spokenText
              }))
            }))
          };
        }
      }

      // Save this new prediction group with PREVIEW status
      const created = await prisma.predictionGroup.create({
        data: {
          status: 'PREVIEW',
          targetDate: new Date(targetDate),
          description: description || `Football predictions for ${targetDate}`,
          backgroundVideo,
          backgroundAudio,
          voiceActor,
          thumbnailTimestamp: parseFloat(thumbnailTimestamp) || 3.0,
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
 * Updates status of a prediction group (ACCEPTED or CANCELLED)
 */
router.post('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { groupId, status } = req.body;
    if (!groupId || !['ACCEPTED', 'CANCELLED'].includes(status)) {
      res.status(400).json({ error: 'Valid groupId and status (ACCEPTED or CANCELLED) are required.' });
      return;
    }

    try {
      await prisma.predictionGroup.update({
        where: { id: groupId },
        data: { status }
      });
    } catch (e) {
      console.warn(`[PredictionsRoute] Could not update status in DB for groupId ${groupId}:`, e);
    }

    res.json({
      success: true,
      groupId,
      status
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update status', details: error?.message });
  }
});

/**
 * GET /api/predictions/history
 * Returns list of all ACCEPTED prediction groups
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

export default router;
