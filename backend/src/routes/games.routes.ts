import { Router, Request, Response } from 'express';
import { getAIService } from '../services/ai/aiFactory';

const router = Router();

/**
 * Validate that the requested date is strictly after today (next day onwards)
 */
function isValidFutureDate(dateStr: string, timezone: string): boolean {
  try {
    // Current date in user's timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const todayStr = formatter.format(now); // e.g. "2026-11-19"

    // Target date must be strictly greater than todayStr
    return dateStr > todayStr;
  } catch {
    // Fallback comparison
    const target = new Date(dateStr);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return target.getTime() > today.getTime();
  }
}

/**
 * GET /api/games?date=YYYY-MM-DD&timezone=America/New_York
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const timezone = (req.query.timezone as string) || 'UTC';
    let targetDate = req.query.date as string;

    // Default to tomorrow if not specified
    if (!targetDate) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      targetDate = tomorrow.toISOString().split('T')[0];
    }

    if (!isValidFutureDate(targetDate, timezone)) {
      res.status(400).json({
        error: 'Invalid date. You can only load matches happening tomorrow or in the future.'
      });
      return;
    }

    console.log(`[GamesRoute] 📅 Querying fixtures for targetDate="${targetDate}", timezone="${timezone}"`);

    const ai = getAIService();
    console.log(`[GamesRoute] 🤖 Using AI Service provider: "${ai.providerName}"`);
    const games = await ai.fetchUpcomingGames(targetDate, timezone);

    console.log(`[GamesRoute] ✅ Found ${games.length} matches for ${targetDate}`);
    if (games.length > 0) {
      games.forEach((g, i) => {
        console.log(`  ${i + 1}. [${g.competition}] ${g.homeTeam} vs ${g.awayTeam} (Kickoff: ${g.kickoffTime})`);
      });
    }

    res.json({
      success: true,
      targetDate,
      timezone,
      count: games.length,
      games
    });
  } catch (error: any) {
    console.error('[GamesRoute] Error fetching games:', error);
    res.status(500).json({
      error: 'Failed to fetch games for the requested date.',
      details: error?.message || 'Internal error'
    });
  }
});

export default router;
