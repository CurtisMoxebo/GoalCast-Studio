import prisma from '../../db/prisma';
import { outcomeResolverService } from './outcomeResolverService';
import { OverlayGameData } from '../video/overlayGenerator';

export const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/**
 * Checks if a game is at least 2 hours past its start time (i.e. match is finished)
 */
export function isGameFinished(kickoffTime: Date | string, currentTimeMs = Date.now()): boolean {
  const kickoffMs = new Date(kickoffTime).getTime();
  if (isNaN(kickoffMs)) return false;
  return currentTimeMs - kickoffMs >= TWO_HOURS_MS;
}

/**
 * Verifies that all games in a group have started at least 2 hours ago
 */
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
 * When generating a video, retrieves the previous game group that was a hit:
 * 1. Queries the database to find the latest game group with status ACCEPTED where ALL games
 *    in it are at least 2 hours above their start time.
 * 2. If the group was already saved as a hit (groupOutcome === 'HIT' or isHit === true), returns it.
 * 3. Else, resolves real outcomes using the unified outcome resolver service and saves them to DB.
 * 4. If all games in that group hit, returns the game group; else returns null.
 */
export async function getPreviousHitGameGroup(currentTimeMs = Date.now()): Promise<{ games: OverlayGameData[] } | null> {
  try {
    const twoHoursAgo = new Date(currentTimeMs - TWO_HOURS_MS);

    // Query candidate accepted groups where games have started at least 2 hours ago
    const acceptedGroups = await prisma.predictionGroup.findMany({
      where: {
        status: 'ACCEPTED',
        games: {
          some: {}, // ensures group has games
          none: {
            kickoffTime: {
              gt: twoHoursAgo
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        games: {
          include: { selections: true },
          orderBy: { orderIndex: 'asc' }
        }
      }
    });

    // In-memory verification: all games in the group must be >= 2 hours above their kickoff time
    const lastAcceptedGroup = acceptedGroups.find((group) => areAllGamesFinished(group.games, currentTimeMs));

    if (!lastAcceptedGroup || !lastAcceptedGroup.games || lastAcceptedGroup.games.length === 0) {
      console.log('[PreviousHit] No accepted previous prediction group found with all games >= 2 hours past start time.');
      return null;
    }

    // If the group was already saved as a hit, return it
    if (lastAcceptedGroup.groupOutcome === 'HIT' || lastAcceptedGroup.isHit === true) {
      console.log(`[PreviousHit] Group ${lastAcceptedGroup.id} was already saved as a hit in DB. Using it.`);
      return {
        games: mapGroupToOverlayGames(lastAcceptedGroup.games)
      };
    }

    // If already marked as MISS, skip
    if (lastAcceptedGroup.groupOutcome === 'MISS' || lastAcceptedGroup.isHit === false) {
      console.log(`[PreviousHit] Group ${lastAcceptedGroup.id} was already evaluated as MISS. Skipping celebration.`);
      return null;
    }

    // Resolve real outcomes using unified service
    console.log(`[PreviousHit] Group ${lastAcceptedGroup.id} pending outcome. Resolving with outcomeResolverService...`);
    const resolvedList = await outcomeResolverService.resolveGroups([lastAcceptedGroup], new Date(currentTimeMs));
    const resolvedGroup = resolvedList[0];

    if (resolvedGroup?.groupOutcome === 'HIT') {
      console.log(`[PreviousHit] AI confirmed group ${lastAcceptedGroup.id} was a HIT. Using it in video.`);
      return {
        games: mapGroupToOverlayGames(resolvedGroup.games)
      };
    }

    console.log(`[PreviousHit] AI determined group ${lastAcceptedGroup.id} was NOT a hit (${resolvedGroup?.groupOutcome}). Skipping celebration.`);
    return null;
  } catch (err: any) {
    console.warn(`[PreviousHit] Could not check previous hit game group:`, err?.message || err);
    return null;
  }
}
