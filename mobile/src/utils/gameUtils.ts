import { UpcomingGame } from '../types';

export interface CompetitionSection {
  title: string;
  logo?: string;
  data: UpcomingGame[];
}

/**
 * Filter games by search query matching home team, away team, or competition name.
 */
export function filterGamesBySearchQuery(games: UpcomingGame[], query: string): UpcomingGame[] {
  if (!query || !query.trim()) {
    return games;
  }
  const normalized = query.toLowerCase().trim();
  return games.filter((g) => {
    const home = (g.homeTeam || '').toLowerCase();
    const away = (g.awayTeam || '').toLowerCase();
    const comp = (g.competition || '').toLowerCase();
    return home.includes(normalized) || away.includes(normalized) || comp.includes(normalized);
  });
}

/**
 * Group games into sections ordered by competition preserving order of appearance.
 */
export function groupGamesByCompetition(games: UpcomingGame[]): CompetitionSection[] {
  const compMap = new Map<string, { logo?: string; games: UpcomingGame[] }>();

  for (const game of games) {
    const compName = game.competition || 'Other Matches';
    if (!compMap.has(compName)) {
      compMap.set(compName, {
        logo: game.competitionLogo,
        games: []
      });
    }
    compMap.get(compName)!.games.push(game);
  }

  const sections: CompetitionSection[] = [];
  compMap.forEach((val, key) => {
    sections.push({
      title: key,
      logo: val.logo,
      data: val.games
    });
  });

  return sections;
}
