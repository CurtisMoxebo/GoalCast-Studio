import prisma from '../../db/prisma';
import { getAIService } from '../ai/aiFactory';
import { GameOutcomeEvaluationInput, GameOutcomeEvaluationResult } from '../ai/aiService.interface';
import { RealFixturesService, OfficialMatchScore } from '../fixtures/realFixturesService';

/**
 * Strict Group Outcome Rule:
 * 1. If at least ONE game in the group is a MISS -> the entire group is MISS (even if other games are PENDING).
 * 2. If ALL games in the group are HIT -> the group is HIT.
 * 3. Otherwise (some games PENDING and NO game is a MISS) -> the group is PENDING.
 */
export function computeGroupOutcome(games: { realOutcome?: string | null }[]): 'PENDING' | 'HIT' | 'MISS' {
  if (!games || games.length === 0) return 'PENDING';

  // If at least one game is a MISS, the whole group is immediately a MISS
  if (games.some((g) => (g.realOutcome || '').toUpperCase() === 'MISS')) {
    return 'MISS';
  }

  // If every single game is a HIT, the entire group is a HIT
  if (games.every((g) => (g.realOutcome || '').toUpperCase() === 'HIT')) {
    return 'HIT';
  }

  // Otherwise, some games are still pending, and no misses have occurred yet
  return 'PENDING';
}

function cleanTeamName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/\bfc\b|\bcf\b|\bafc\b|\bsc\b|\bcity\b|\bunited\b|\btown\b|\bhotspur\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function matchTeams(gameHome: string, gameAway: string, scoreHome: string, scoreAway: string): boolean {
  const gH = cleanTeamName(gameHome);
  const gA = cleanTeamName(gameAway);
  const sH = cleanTeamName(scoreHome);
  const sA = cleanTeamName(scoreAway);

  const homeMatches = gH === sH || gH.includes(sH) || sH.includes(gH);
  const awayMatches = gA === sA || gA.includes(sA) || sA.includes(gA);
  return homeMatches && awayMatches;
}

export function evaluateBettingSelection(
  sel: { code?: string; label?: string; category?: string },
  homeScore: number,
  awayScore: number
): boolean | null {
  const code = (sel.code || '').toUpperCase().trim();
  const label = (sel.label || '').toUpperCase().trim();
  const totalGoals = homeScore + awayScore;

  if (code === '1' || label === '1' || label.includes('HOME WIN')) {
    return homeScore > awayScore;
  }
  if (code === '2' || label === '2' || label.includes('AWAY WIN')) {
    return awayScore > homeScore;
  }
  if (code === 'X' || label === 'X' || label.includes('DRAW')) {
    return homeScore === awayScore;
  }
  if (code === '1X' || label.includes('HOME OR DRAW') || label.includes('1X')) {
    return homeScore >= awayScore;
  }
  if (code === 'X2' || label.includes('DRAW OR AWAY') || label.includes('X2')) {
    return awayScore >= homeScore;
  }
  if (code === '12' || label.includes('EITHER TEAM TO WIN') || label.includes('12')) {
    return homeScore !== awayScore;
  }
  if (code === '1 DNB' || label.includes('1 DNB')) {
    return homeScore > awayScore;
  }
  if (code === '2 DNB' || label.includes('2 DNB')) {
    return awayScore > homeScore;
  }
  if (code.includes('BTTS') || label.includes('BOTH TEAMS TO SCORE')) {
    if (code.includes('NO') || label.includes('NO')) {
      return homeScore === 0 || awayScore === 0;
    }
    return homeScore > 0 && awayScore > 0;
  }

  // Over / Under match
  const overMatch = code.match(/OVER_([\d\.]+)/) || label.match(/OVER ([\d\.]+)/);
  if (overMatch) {
    const threshold = parseFloat(overMatch[1]);
    if (code.includes('HOME') || label.includes('HOME')) return homeScore > threshold;
    if (code.includes('AWAY') || label.includes('AWAY')) return awayScore > threshold;
    return totalGoals > threshold;
  }

  const underMatch = code.match(/UNDER_([\d\.]+)/) || label.match(/UNDER ([\d\.]+)/);
  if (underMatch) {
    const threshold = parseFloat(underMatch[1]);
    if (code.includes('HOME') || label.includes('HOME')) return homeScore < threshold;
    if (code.includes('AWAY') || label.includes('AWAY')) return awayScore < threshold;
    return totalGoals < threshold;
  }

  return null;
}

export class OutcomeResolverService {
  /**
   * Resolves real outcomes for a list of prediction groups in a batched, efficient manner.
   *
   * Core Requirements:
   * 1. Only retrieve the status for games that have "PENDING" and the game start time has already passed.
   * 2. If a game already has a saved status (HIT or MISS), DO NOT make AI/API fetch the status again.
   * 3. Group and send AI prompts to limit the amount of calls.
   */
  public async resolveGroups(groups: any[], now: Date = new Date()): Promise<any[]> {
    if (!groups || groups.length === 0) return [];

    const gamesToEvaluate: GameOutcomeEvaluationInput[] = [];
    const gameToGroupMap = new Map<string, string>(); // gameId -> groupId

    // Identify games that strictly need evaluation:
    for (const group of groups) {
      for (const game of (group.games || [])) {
        const currentOutcome = (game.realOutcome || 'PENDING').toUpperCase();

        // Requirement: If a game already has a saved status (HIT or MISS), DO NOT fetch again!
        if (currentOutcome === 'HIT' || currentOutcome === 'MISS') {
          continue;
        }

        // Requirement: Only retrieve for games that have "PENDING" AND kickoff <= now
        const kickoff = new Date(game.kickoffTime);
        if (kickoff <= now) {
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

    // If no candidate games need evaluation, compute group outcomes and return
    if (gamesToEvaluate.length === 0) {
      return groups.map((grp) => {
        const computed = computeGroupOutcome(grp.games || []);
        return {
          ...grp,
          groupOutcome: computed
        };
      });
    }

    console.log(`[OutcomeResolver] ⚡ Resolving real outcomes for ${gamesToEvaluate.length} started games across ${groups.length} groups...`);

    const evalMap = new Map<string, GameOutcomeEvaluationResult>();
    const unresolvedForAi: GameOutcomeEvaluationInput[] = [];

    // Step 1: Query official match scores from ESPN
    const uniqueDates = Array.from(new Set(gamesToEvaluate.map((g) => g.kickoffTime.slice(0, 10))));
    const dateScoresMap = new Map<string, OfficialMatchScore[]>();

    await Promise.all(
      uniqueDates.map(async (d) => {
        try {
          const scores = await RealFixturesService.fetchOfficialMatchScores(d);
          dateScoresMap.set(d, scores);
        } catch (err) {
          console.warn(`[OutcomeResolver] Could not fetch official scores for ${d}:`, err);
        }
      })
    );

    for (const game of gamesToEvaluate) {
      const d = game.kickoffTime.slice(0, 10);
      const scores = dateScoresMap.get(d) || [];
      const match = scores.find((s) => matchTeams(game.homeTeam, game.awayTeam, s.homeTeam, s.awayTeam));

      const matchKickoffMs = new Date(game.kickoffTime).getTime();
      const isPastTwoHours = now.getTime() - matchKickoffMs >= 2 * 60 * 60 * 1000;

      if (match && (match.completed || isPastTwoHours)) {
        let allHit = true;
        let anyEvaluated = false;

        for (const sel of game.selections) {
          const res = evaluateBettingSelection(sel, match.homeScore, match.awayScore);
          if (res !== null) {
            anyEvaluated = true;
            if (!res) {
              allHit = false;
              break;
            }
          }
        }

        if (anyEvaluated) {
          const outcome: 'HIT' | 'MISS' = allHit ? 'HIT' : 'MISS';
          evalMap.set(game.gameId, {
            gameId: game.gameId,
            realOutcome: outcome,
            realScore: `${match.homeScore} - ${match.awayScore}`,
            realOutcomeDetails: `Full Time ${match.homeScore}-${match.awayScore}: ${outcome}`
          });
          continue;
        }
      }

      // If not resolved by official scores, queue for batched AI prompt
      unresolvedForAi.push(game);
    }

    // Step 2: For any unresolved games, send ONE batched AI prompt
    if (unresolvedForAi.length > 0) {
      console.log(`[OutcomeResolver] 🤖 Grouping & querying AI for ${unresolvedForAi.length} unresolved games in 1 single call...`);
      const ai = getAIService();
      try {
        if (typeof ai.resolveGameOutcomes === 'function') {
          const aiEvals = await ai.resolveGameOutcomes(unresolvedForAi);
          for (const ev of aiEvals) {
            if (ev.realOutcome && ev.realOutcome !== 'PENDING') {
              evalMap.set(ev.gameId, ev);
            }
          }
        }
      } catch (aiErr) {
        console.error('[OutcomeResolver] Batched AI outcome resolution error:', aiErr);
      }
    }

    // Step 3: Persist newly resolved game outcomes (HIT or MISS) to MariaDB
    for (const [gameId, evalResult] of evalMap.entries()) {
      if (evalResult.realOutcome === 'HIT' || evalResult.realOutcome === 'MISS') {
        try {
          await prisma.gamePrediction.update({
            where: { id: gameId },
            data: {
              realOutcome: evalResult.realOutcome,
              realScore: evalResult.realScore,
              realOutcomeDetails: evalResult.realOutcomeDetails,
              evaluatedAt: new Date()
            }
          });
        } catch (dbErr) {
          console.warn(`[OutcomeResolver] Could not update GamePrediction ${gameId} in DB:`, dbErr);
        }
      }
    }

    // Step 4: Apply evaluations in-memory and update group outcomes in DB
    const resolvedGroups = [];
    for (const group of groups) {
      const updatedGames = (group.games || []).map((game: any) => {
        const evalRes = evalMap.get(game.id);
        if (evalRes && (evalRes.realOutcome === 'HIT' || evalRes.realOutcome === 'MISS')) {
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
