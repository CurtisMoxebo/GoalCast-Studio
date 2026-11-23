import { UpcomingGame } from '../ai/aiService.interface';

export interface LeagueConfig {
  code: string;
  name: string;
  priority: number;
}

export interface OfficialMatchScore {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  completed: boolean;
  statusText: string;
  competition: string;
}

export const SUPPORTED_LEAGUES: LeagueConfig[] = [
  // Top European Domestic Leagues
  { code: 'eng.1', name: 'English Premier League', priority: 1 },
  { code: 'esp.1', name: 'Spanish La Liga', priority: 2 },
  { code: 'ita.1', name: 'Italian Serie A', priority: 3 },
  { code: 'ger.1', name: 'German Bundesliga', priority: 4 },
  { code: 'fra.1', name: 'French Ligue 1', priority: 5 },
  { code: 'por.1', name: 'Portuguese Primeira Liga', priority: 6 },
  { code: 'ned.1', name: 'Dutch Eredivisie', priority: 7 },
  { code: 'tur.1', name: 'Turkish Super Lig', priority: 8 },
  { code: 'sco.1', name: 'Scottish Premiership', priority: 9 },

  // European Continental Competitions
  { code: 'uefa.champions', name: 'UEFA Champions League', priority: 1 },
  { code: 'uefa.europa', name: 'UEFA Europa League', priority: 2 },
  { code: 'uefa.europa.conf', name: 'UEFA Conference League', priority: 3 },
  { code: 'uefa.super_cup', name: 'UEFA Super Cup', priority: 2 },

  // European Domestic Cups
  { code: 'eng.fa', name: 'English FA Cup', priority: 4 },
  { code: 'eng.league_cup', name: 'Carabao Cup', priority: 5 },
  { code: 'esp.copa_del_rey', name: 'Copa del Rey', priority: 5 },
  { code: 'ita.coppa_italia', name: 'Coppa Italia', priority: 5 },
  { code: 'ger.dfb_pokal', name: 'DFB-Pokal', priority: 5 },
  { code: 'fra.coupe_de_france', name: 'Coupe de France', priority: 5 },

  // Saudi Arabia & Asian Continental Competitions
  { code: 'ksa.1', name: 'Saudi Pro League', priority: 6 },
  { code: 'afc.champions', name: 'AFC Champions League Elite', priority: 3 },
  { code: 'afc.cup', name: 'AFC Champions League Two', priority: 4 },

  // American Leagues & Competitions
  { code: 'usa.1', name: 'MLS', priority: 7 },
  { code: 'mex.1', name: 'Liga MX', priority: 8 },
  { code: 'concacaf.champions', name: 'CONCACAF Champions Cup', priority: 6 },
  { code: 'conmebol.libertadores', name: 'Copa Libertadores', priority: 5 },
  { code: 'conmebol.sudamericana', name: 'Copa Sudamericana', priority: 6 },
  { code: 'bra.1', name: 'Brazilian Serie A', priority: 8 },
  { code: 'arg.1', name: 'Argentine Liga Profesional', priority: 8 },

  // International Tournaments & Qualifiers
  { code: 'fifa.world', name: 'FIFA World Cup', priority: 1 },
  { code: 'uefa.euro', name: 'UEFA European Championship', priority: 1 },
  { code: 'uefa.nations', name: 'UEFA Nations League', priority: 3 },
  { code: 'conmebol.america', name: 'Copa América', priority: 2 },
  { code: 'caf.nations', name: 'Africa Cup of Nations', priority: 3 },
  { code: 'afc.asian.cup', name: 'AFC Asian Cup', priority: 4 },
  { code: 'concacaf.gold', name: 'CONCACAF Gold Cup', priority: 4 },
  { code: 'fifa.friendly', name: 'International Friendly', priority: 5 }
];

export class RealFixturesService {
  /**
   * Fetches all real official scheduled football fixtures across major global competitions
   * for the specified date string (YYYY-MM-DD).
   */
  public static async fetchRealFixtures(targetDate: string): Promise<UpcomingGame[]> {
    const formattedDate = targetDate.replace(/-/g, '');
    console.log(`[RealFixturesService] 🌐 Fetching real official fixtures for date ${targetDate} (ESPN query: ${formattedDate})...`);

    const leaguePriorityMap = new Map<string, number>();
    SUPPORTED_LEAGUES.forEach((l) => leaguePriorityMap.set(l.code, l.priority));

    const fetchPromises = SUPPORTED_LEAGUES.map(async (league) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.code}/scoreboard?dates=${formattedDate}`;
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) {
          return [];
        }

        const data: any = await res.json();
        const compName = data.leagues?.[0]?.name || league.name;
        const compLogo = data.leagues?.[0]?.logos?.[0]?.href || '';

        const events = data.events || [];
        const matches: (UpcomingGame & { priority: number })[] = [];

        for (const ev of events) {
          const comps = ev.competitions?.[0]?.competitors || [];
          const homeComp = comps.find((c: any) => c.homeAway === 'home') || comps[0];
          const awayComp = comps.find((c: any) => c.homeAway === 'away') || comps[1];

          if (!homeComp || !awayComp) continue;

          const homeTeam = homeComp.team?.displayName || homeComp.team?.name || 'Home Team';
          const awayTeam = awayComp.team?.displayName || awayComp.team?.name || 'Away Team';

          const homeTeamLogo =
            homeComp.team?.logo ||
            homeComp.team?.logos?.[0]?.href ||
            `https://images.fotmob.com/image_resources/logo/teamlogo/${homeComp.id || 'team'}.png`;

          const awayTeamLogo =
            awayComp.team?.logo ||
            awayComp.team?.logos?.[0]?.href ||
            `https://images.fotmob.com/image_resources/logo/teamlogo/${awayComp.id || 'team'}.png`;

          matches.push({
            id: `espn_${ev.id || `${targetDate}_${homeTeam}_${awayTeam}`.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`,
            homeTeam,
            homeTeamLogo,
            awayTeam,
            awayTeamLogo,
            competition: compName,
            competitionLogo: compLogo,
            kickoffTime: ev.date || `${targetDate}T15:00:00Z`,
            priority: league.priority
          });
        }

        return matches;
      } catch (err: any) {
        // Individual league network/parse failure should not abort the whole request
        return [];
      }
    });

    const settledResults = await Promise.allSettled(fetchPromises);
    const seenMatchIds = new Set<string>();
    const allMatches: (UpcomingGame & { priority: number })[] = [];

    for (const result of settledResults) {
      if (result.status === 'fulfilled') {
        for (const match of result.value) {
          if (!seenMatchIds.has(match.id)) {
            seenMatchIds.add(match.id);
            allMatches.push(match);
          }
        }
      }
    }

    // Sort matches: first by league priority, then by kickoff time
    allMatches.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime();
    });

    // Strip internal priority before returning
    const finalGames: UpcomingGame[] = allMatches.map(({ priority: _, ...game }) => game);

    console.log(`[RealFixturesService] ✅ Discovered ${finalGames.length} real official matches for ${targetDate}`);
    return finalGames;
  }

  /**
   * Fetches official match scores across supported leagues for a given date (YYYY-MM-DD or YYYYMMDD)
   */
  public static async fetchOfficialMatchScores(targetDate: string): Promise<OfficialMatchScore[]> {
    const formattedDate = targetDate.replace(/-/g, '').slice(0, 8);
    const fetchPromises = SUPPORTED_LEAGUES.map(async (league) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.code}/scoreboard?dates=${formattedDate}`;
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) return [];

        const data: any = await res.json();
        const compName = data.leagues?.[0]?.name || league.name;
        const events = data.events || [];
        const results: OfficialMatchScore[] = [];

        for (const ev of events) {
          const comps = ev.competitions?.[0]?.competitors || [];
          const homeComp = comps.find((c: any) => c.homeAway === 'home') || comps[0];
          const awayComp = comps.find((c: any) => c.homeAway === 'away') || comps[1];
          if (!homeComp || !awayComp) continue;

          const homeTeam = homeComp.team?.displayName || homeComp.team?.name || '';
          const awayTeam = awayComp.team?.displayName || awayComp.team?.name || '';
          const homeScore = parseInt(homeComp.score || '0', 10);
          const awayScore = parseInt(awayComp.score || '0', 10);

          const statusType = ev.status?.type;
          const isCompleted = statusType?.completed === true || statusType?.name === 'STATUS_FULL_TIME';
          const statusText = statusType?.description || statusType?.shortDetail || 'FT';

          if (homeTeam && awayTeam) {
            results.push({
              id: ev.id || `${homeTeam}_${awayTeam}`,
              homeTeam,
              awayTeam,
              homeScore: isNaN(homeScore) ? 0 : homeScore,
              awayScore: isNaN(awayScore) ? 0 : awayScore,
              completed: isCompleted,
              statusText,
              competition: compName
            });
          }
        }
        return results;
      } catch {
        return [];
      }
    });

    const settled = await Promise.allSettled(fetchPromises);
    const allScores: OfficialMatchScore[] = [];
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        allScores.push(...s.value);
      }
    }
    return allScores;
  }
}
