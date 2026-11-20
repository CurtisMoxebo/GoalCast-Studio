import { UpcomingGame } from '../types';

export interface CompetitionSection {
  id: string;
  title: string;
  logo?: string;
  region: string;
  data: UpcomingGame[];
}

/**
 * Get country or region label with flag for a competition name
 */
export function getCompetitionRegion(competition: string): string {
  const c = competition.toLowerCase();
  if (c.includes('premier league') || c.includes('fa cup') || c.includes('carabao') || c.includes('england') || c.includes('english')) {
    return '🏴󠁧󠁢󠁥󠁮󠁧󠁿 England';
  }
  if (c.includes('laliga') || c.includes('la liga') || c.includes('copa del rey') || c.includes('spain') || c.includes('spanish')) {
    return '🇪🇸 Spain';
  }
  if ((c.includes('serie a') && !c.includes('brazil')) || c.includes('coppa italia') || c.includes('italy') || c.includes('italian')) {
    return '🇮🇹 Italy';
  }
  if (c.includes('bundesliga') || c.includes('dfb') || c.includes('germany') || c.includes('german')) {
    return '🇩🇪 Germany';
  }
  if (c.includes('ligue 1') || c.includes('coupe de france') || c.includes('france') || c.includes('french')) {
    return '🇫🇷 France';
  }
  if (c.includes('mls') || c.includes('major league soccer') || c.includes('usa')) {
    return '🇺🇸 USA';
  }
  if (c.includes('saudi') || c.includes('pro league') || c.includes('king cup')) {
    return '🇸🇦 Saudi Arabia';
  }
  if (c.includes('mex') || c.includes('liga mx')) {
    return '🇲🇽 Mexico';
  }
  if (c.includes('champions league') || c.includes('europa') || c.includes('conference') || c.includes('uefa') || c.includes('super cup')) {
    return '🇪🇺 Europe';
  }
  if (c.includes('eredivisie') || c.includes('dutch') || c.includes('netherlands')) {
    return '🇳🇱 Netherlands';
  }
  if (c.includes('primeira') || c.includes('portugal') || c.includes('portuguese')) {
    return '🇵🇹 Portugal';
  }
  if (c.includes('brazil') || c.includes('brasileir')) {
    return '🇧🇷 Brazil';
  }
  if (c.includes('argentin') || c.includes('profesional')) {
    return '🇦🇷 Argentina';
  }
  if (c.includes('scottish') || c.includes('scotland')) {
    return '🏴󠁧󠁢󠁳󠁣󠁴󠁿 Scotland';
  }
  if (c.includes('turk') || c.includes('super lig')) {
    return '🇹🇷 Turkey';
  }
  return '⚽ Football';
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
      id: key,
      title: key,
      logo: val.logo,
      region: getCompetitionRegion(key),
      data: val.games
    });
  });

  return sections;
}
