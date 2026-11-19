import {
  IAIService,
  UpcomingGame,
  GamePredictionResult,
  ValidatableGame,
  ValidationResult
} from './aiService.interface';
import { formatSpokenPrediction, findBettingOptionByCode } from '../../constants/bettingRules';

export class MockAIService implements IAIService {
  public readonly providerName = 'mock';

  async fetchUpcomingGames(targetDate: string, _timezone: string): Promise<UpcomingGame[]> {
    const baseDate = new Date(targetDate);
    const dateStr = baseDate.toISOString().split('T')[0];

    return [
      {
        id: `mock_game_1_${dateStr}`,
        homeTeam: 'Real Madrid',
        homeTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/5/56/Real_Madrid_CF.svg',
        awayTeam: 'Barcelona',
        awayTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/4/47/FC_Barcelona_%28crest%29.svg',
        competition: 'La Liga',
        competitionLogo: 'https://upload.wikimedia.org/wikipedia/commons/0/0f/LaLiga_logo_2023.svg',
        kickoffTime: `${dateStr}T19:00:00Z`
      },
      {
        id: `mock_game_2_${dateStr}`,
        homeTeam: 'Arsenal',
        homeTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/5/53/Arsenal_FC.svg',
        awayTeam: 'Manchester City',
        awayTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/e/eb/Manchester_City_FC_badge.svg',
        competition: 'Premier League',
        competitionLogo: 'https://upload.wikimedia.org/wikipedia/en/f/f2/Premier_League_Logo.svg',
        kickoffTime: `${dateStr}T16:30:00Z`
      },
      {
        id: `mock_game_3_${dateStr}`,
        homeTeam: 'Al-Hilal',
        homeTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/9/95/Al_Hilal_SFC_logo.svg',
        awayTeam: 'Al-Nassr',
        awayTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/c/c5/Al-Nassr_FC_logo.svg',
        competition: 'Saudi Pro League',
        competitionLogo: 'https://upload.wikimedia.org/wikipedia/en/d/da/Saudi_Pro_League_logo.svg',
        kickoffTime: `${dateStr}T18:00:00Z`
      },
      {
        id: `mock_game_4_${dateStr}`,
        homeTeam: 'Inter Miami CF',
        homeTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/5/5c/Inter_Miami_CF_logo.svg',
        awayTeam: 'LA Galaxy',
        awayTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/7/70/Los_Angeles_Galaxy_logo.svg',
        competition: 'MLS',
        competitionLogo: 'https://upload.wikimedia.org/wikipedia/commons/7/76/MLS_crest_logo_RGB_gradient.svg',
        kickoffTime: `${dateStr}T23:30:00Z`
      }
    ];
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
