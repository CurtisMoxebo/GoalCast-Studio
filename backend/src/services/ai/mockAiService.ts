import {
  IAIService,
  UpcomingGame,
  GamePredictionResult,
  ValidatableGame,
  ValidationResult
} from './aiService.interface';
import { formatSpokenPrediction, findBettingOptionByCode } from '../../constants/bettingRules';
import { resolveTeamLogoUrl, resolveCompetitionLogoUrl } from '../../constants/logoCatalog';

export class MockAIService implements IAIService {
  public readonly providerName = 'mock';

  async fetchUpcomingGames(targetDate: string, _timezone: string): Promise<UpcomingGame[]> {
    const baseDate = new Date(targetDate);
    const dateStr = baseDate.toISOString().split('T')[0];

    const mockMatches = [
      {
        id: `mock_game_1_${dateStr}`,
        homeTeam: 'Real Madrid',
        awayTeam: 'Barcelona',
        competition: 'La Liga',
        kickoffTime: `${dateStr}T19:00:00Z`
      },
      {
        id: `mock_game_2_${dateStr}`,
        homeTeam: 'Arsenal',
        awayTeam: 'Chelsea',
        competition: 'Premier League',
        kickoffTime: `${dateStr}T16:30:00Z`
      },
      {
        id: `mock_game_3_${dateStr}`,
        homeTeam: 'Al-Hilal',
        awayTeam: 'Al-Nassr',
        competition: 'Saudi Pro League',
        kickoffTime: `${dateStr}T18:00:00Z`
      },
      {
        id: `mock_game_4_${dateStr}`,
        homeTeam: 'Inter Miami CF',
        awayTeam: 'LA Galaxy',
        competition: 'MLS',
        kickoffTime: `${dateStr}T23:30:00Z`
      }
    ];

    return mockMatches.map((m) => ({
      ...m,
      homeTeamLogo: resolveTeamLogoUrl(m.homeTeam),
      awayTeamLogo: resolveTeamLogoUrl(m.awayTeam),
      competitionLogo: resolveCompetitionLogoUrl(m.competition)
    }));
  }

  async generatePredictions(games: UpcomingGame[]): Promise<GamePredictionResult[]> {
    return games.map((game, index) => {
      // Pick dynamic plausible predictions
      const optCode = index % 2 === 0 ? 'BTTS_YES' : '1X';
      const opt = findBettingOptionByCode(optCode)!;
      return {
        gameId: game.id,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        predictions: [
          {
            category: opt.category,
            code: opt.code,
            label: opt.label,
            spokenText: formatSpokenPrediction(opt.spokenTemplate, game.homeTeam, game.awayTeam),
            confidence: 0.88,
            reasoning: 'Strong home attacking form in last 5 games with high xG and regular corner conversion.'
          }
        ]
      };
    });
  }

  async validatePreviousPredictions(_games: ValidatableGame[]): Promise<ValidationResult> {
    return {
      isHit: true,
      notes: 'All selected matches hit their respective predicted outcomes!'
    };
  }
}
