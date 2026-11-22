import prisma from '../../db/prisma';
import { OverlayGameData } from '../video/overlayGenerator';

export const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export function isGameFinished(kickoffTime: Date | string, currentTimeMs = Date.now()): boolean {
  const kickoffMs = new Date(kickoffTime).getTime();
  if (isNaN(kickoffMs)) return false;
  return currentTimeMs - kickoffMs >= TWO_HOURS_MS;
}

export function areAllGamesFinished(games: { kickoffTime: Date | string }[], currentTimeMs = Date.now()): boolean {
  if (!games || games.length === 0) return false;
  return games.every((g) => isGameFinished(g.kickoffTime, currentTimeMs));
}

export function mapGroupToOverlayGames(games: any[]): OverlayGameData[] {
  return games.map((g) => ({
    homeTeam: g.homeTeam,
    homeTeamLogo: g.homeTeamLogo || undefined,
    awayTeam: g.awayTeam,
    awayTeamLogo: g.awayTeamLogo || undefined,
    competition: g.competition,
    competitionLogo: g.competitionLogo || undefined,
    kickoffTime: g.kickoffTime instanceof Date ? g.kickoffTime.toISOString() : String(g.kickoffTime),
    selections: (g.selections || []).map((s: any) => ({
      code: s.code,
      label: s.label,
      spokenText: s.spokenText || s.label || s.code
    }))
  }));
}

/**
 * When generating a video, checks if the previous game group has all its games as (HIT).
 * If all games in that previous group were marked as HIT, returns the games for celebration overlay;
 * otherwise returns null.
 */
export async function getPreviousHitGameGroup(_currentTimeMs = Date.now()): Promise<{ games: OverlayGameData[] } | null> {
  try {
    const acceptedGroups = await prisma.predictionGroup.findMany({
      where: {
        status: 'ACCEPTED'
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        games: {
          include: { selections: true },
          orderBy: { orderIndex: 'asc' }
        }
      }
    });

    // Find the latest accepted group that has games
    const prevGroup = acceptedGroups.find((g) => g.games && g.games.length > 0);
    if (!prevGroup) {
      console.log('[PreviousHit] No previous accepted prediction group found.');
      return null;
    }

    // Check if the previous game group has ALL its games marked as HIT
    const allGamesHit =
      prevGroup.games.length > 0 &&
      prevGroup.games.every((g) => (g.realOutcome || '').toUpperCase() === 'HIT');

    if (allGamesHit) {
      console.log(`[PreviousHit] Previous group ${prevGroup.id} has all games as HIT! Displaying celebration table in video.`);
      return {
        games: mapGroupToOverlayGames(prevGroup.games)
      };
    }

    console.log(`[PreviousHit] Previous group ${prevGroup.id} does not have all games as HIT (groupOutcome=${prevGroup.groupOutcome}). Skipping celebration.`);
    return null;
  } catch (err: any) {
    console.warn('[PreviousHit] Could not check previous hit game group:', err?.message || err);
    return null;
  }
}
