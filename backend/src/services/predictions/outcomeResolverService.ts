import prisma from '../../db/prisma';
import { getAIService } from '../ai/aiFactory';
import { GameOutcomeEvaluationInput, GameOutcomeEvaluationResult } from '../ai/aiService.interface';

/**
 * Strict Group Outcome Rule:
 * 1. If at least ONE game in the group is a MISS -> the entire group is MISS (even if other games are PENDING).
 * 2. If ALL games in the group are HIT -> the group is HIT.
 * 3. Otherwise (some games PENDING and NO game is a MISS) -> the group is PENDING.
 */
export function computeGroupOutcome(games: { realOutcome?: string | null }[]): 'PENDING' | 'HIT' | 'MISS' {
  if (!games || games.length === 0) return 'PENDING';

  // If at least one game is a MISS, the whole group is immediately a MISS
  if (games.some((g) => g.realOutcome === 'MISS')) {
    return 'MISS';
  }

  // If every single game is a HIT, the entire group is a HIT
  if (games.every((g) => g.realOutcome === 'HIT')) {
    return 'HIT';
  }

  // Otherwise, some games are still pending, and no misses have occurred yet
  return 'PENDING';
}

export class OutcomeResolverService {
  /**
   * Resolves real outcomes for a list of prediction groups in a batched, efficient manner.
   * Groups AI prompt calls to avoid hammering the AI service.
   */
  public async resolveGroups(groups: any[], now: Date = new Date()): Promise<any[]> {
    if (!groups || groups.length === 0) return [];

    const gamesToEvaluate: GameOutcomeEvaluationInput[] = [];
    const gameToGroupMap = new Map<string, string>(); // gameId -> groupId

    // Identify games that:
    // 1. Have outcome 'PENDING' (or unset)
    // 2. Their kickoffTime <= now (the game has already started or finished)
    for (const group of groups) {
      for (const game of (group.games || [])) {
        const outcome = game.realOutcome || 'PENDING';
        const kickoff = new Date(game.kickoffTime);

        if (outcome === 'PENDING' && kickoff <= now) {
          gameToGroupMap.set(game.id, group.id);
          gamesToEvaluate.push({
            gameId: game.id,
            homeTeam: game.homeTeam,
            awayTeam: game.awayTeam,
            competition: game.competition,
            kickoffTime: kickoff.toISOString(),
            selections: (game.selections || []).map((s: any) => ({
              code: s.code,
              label: s.label,
              category: s.category
            }))
          });
        }
      }
    }

    // If no games have started yet, just compute group outcomes and return
    if (gamesToEvaluate.length === 0) {
      return groups.map((grp) => {
        const computed = computeGroupOutcome(grp.games || []);
        return {
          ...grp,
          groupOutcome: computed
        };
      });
    }

    console.log(`[OutcomeResolver] ⚡ Grouping & resolving outcomes for ${gamesToEvaluate.length} started games across ${groups.length} groups in 1 batched AI prompt...`);

    // Execute single batched AI query
    const ai = getAIService();
    let evaluations: GameOutcomeEvaluationResult[] = [];
    try {
      if (typeof ai.resolveGameOutcomes === 'function') {
        evaluations = await ai.resolveGameOutcomes(gamesToEvaluate);
      } else {
        // Fallback if provider doesn't support resolveGameOutcomes
        evaluations = gamesToEvaluate.map((g) => ({
          gameId: g.gameId,
          realOutcome: 'PENDING'
        }));
      }
    } catch (evalErr) {
      console.error('[OutcomeResolver] Batched outcome resolution error:', evalErr);
      evaluations = [];
    }

    const evalMap = new Map<string, GameOutcomeEvaluationResult>();
    for (const res of evaluations) {
      evalMap.set(res.gameId, res);
    }

    // Persist game evaluations to MariaDB
    for (const evalResult of evaluations) {
      if (evalResult.realOutcome !== 'PENDING') {
        try {
          await prisma.gamePrediction.update({
            where: { id: evalResult.gameId },
            data: {
              realOutcome: evalResult.realOutcome,
              realScore: evalResult.realScore,
              realOutcomeDetails: evalResult.realOutcomeDetails,
              evaluatedAt: new Date()
            }
          });
        } catch (dbErr) {
          console.warn(`[OutcomeResolver] Could not update GamePrediction ${evalResult.gameId} in DB:`, dbErr);
        }
      }
    }

    // Apply evaluations in-memory to groups and update group outcomes in DB
    const resolvedGroups = [];
    for (const group of groups) {
      const updatedGames = (group.games || []).map((game: any) => {
        const evalRes = evalMap.get(game.id);
        if (evalRes && evalRes.realOutcome !== 'PENDING') {
          return {
            ...game,
            realOutcome: evalRes.realOutcome,
            realScore: evalRes.realScore || game.realScore,
            realOutcomeDetails: evalRes.realOutcomeDetails || game.realOutcomeDetails
          };
        }
        return {
          ...game,
          realOutcome: game.realOutcome || 'PENDING'
        };
      });

      const computedOutcome = computeGroupOutcome(updatedGames);

      // Persist group outcome if changed
      if (computedOutcome !== group.groupOutcome) {
        try {
          await prisma.predictionGroup.update({
            where: { id: group.id },
            data: {
              groupOutcome: computedOutcome,
              isHit: computedOutcome === 'HIT' ? true : computedOutcome === 'MISS' ? false : null
            }
          });
        } catch (grpDbErr) {
          console.warn(`[OutcomeResolver] Could not update PredictionGroup ${group.id} in DB:`, grpDbErr);
        }
      }

      resolvedGroups.push({
        ...group,
        games: updatedGames,
        groupOutcome: computedOutcome
      });
    }

    return resolvedGroups;
  }
}

export const outcomeResolverService = new OutcomeResolverService();
