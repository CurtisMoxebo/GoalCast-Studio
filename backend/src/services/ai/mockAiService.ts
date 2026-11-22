import {
  IAIService,
  UpcomingGame,
  GamePredictionResult,
  ValidatableGame,
  ValidationResult,
  GameOutcomeEvaluationInput,
  GameOutcomeEvaluationResult
} from './aiService.interface';
import { formatSpokenPrediction, findBettingOptionByCode } from '../../constants/bettingRules';

export class MockAIService implements IAIService {
  public readonly providerName = 'mock';

  async fetchUpcomingGames(targetDate: string, _timezone: string): Promise<UpcomingGame[]> {
    console.log(`[MockAIService] 🤖 Returning fallback/mock fixtures for date ${targetDate}`);
    const baseDate = new Date(targetDate);
    const dateStr = baseDate.toISOString().split('T')[0];

    return [
      {
        id: `mock_game_1_${dateStr}`,
        homeTeam: 'Real Madrid',
        homeTeamLogo: 'https://images.fotmob.com/image_resources/logo/teamlogo/8633.png',
        awayTeam: 'Barcelona',
        awayTeamLogo: 'https://images.fotmob.com/image_resources/logo/teamlogo/8634.png',
        competition: 'La Liga',
        competitionLogo: 'https://images.fotmob.com/image_resources/logo/leaguelogo/87.png',
        kickoffTime: `${dateStr}T19:00:00Z`
      },
      {
        id: `mock_game_2_${dateStr}`,
        homeTeam: 'Arsenal',
        homeTeamLogo: 'https://images.fotmob.com/image_resources/logo/teamlogo/9825.png',
        awayTeam: 'Chelsea',
        awayTeamLogo: 'https://images.fotmob.com/image_resources/logo/teamlogo/8455.png',
        competition: 'Premier League',
        competitionLogo: 'https://images.fotmob.com/image_resources/logo/leaguelogo/47.png',
        kickoffTime: `${dateStr}T16:30:00Z`
      },
      {
        id: `mock_game_3_${dateStr}`,
        homeTeam: 'Al-Hilal',
        homeTeamLogo: 'https://images.fotmob.com/image_resources/logo/teamlogo/8584.png',
        awayTeam: 'Al-Nassr',
        awayTeamLogo: 'https://images.fotmob.com/image_resources/logo/teamlogo/8244.png',
        competition: 'Saudi Pro League',
        competitionLogo: 'https://images.fotmob.com/image_resources/logo/leaguelogo/206.png',
        kickoffTime: `${dateStr}T18:00:00Z`
      },
      {
        id: `mock_game_4_${dateStr}`,
        homeTeam: 'Inter Miami CF',
        homeTeamLogo: 'https://images.fotmob.com/image_resources/logo/teamlogo/1144933.png',
        awayTeam: 'LA Galaxy',
        awayTeamLogo: 'https://images.fotmob.com/image_resources/logo/teamlogo/7000.png',
        competition: 'MLS',
        competitionLogo: 'https://images.fotmob.com/image_resources/logo/leaguelogo/130.png',
        kickoffTime: `${dateStr}T23:30:00Z`
      }
    ];
  }

  async generatePredictions(games: UpcomingGame[]): Promise<GamePredictionResult[]> {
    const startTime = Date.now();
    console.log(`\n------------------ [MockAIService: generatePredictions] ------------------`);
    console.log(`[MockAIService] 🔮 Generating heuristic statistical predictions for ${games.length} games...`);
    games.forEach((g, idx) => {
      console.log(`  [Match ${idx + 1}/${games.length}] ${g.homeTeam} vs ${g.awayTeam} | League: ${g.competition || 'N/A'} | ID: ${g.id}`);
    });

    const results = games.map((game, index) => {
      // Pick dynamic plausible predictions
      const optCode = index % 2 === 0 ? 'BTTS_YES' : '1X';
      const opt = findBettingOptionByCode(optCode)!;
      const spoken = formatSpokenPrediction(opt.spokenTemplate, game.homeTeam, game.awayTeam);
      console.log(`  ✅ Match: ${game.homeTeam} vs ${game.awayTeam} => [${opt.code}] "${opt.label}" (Spoken: "${spoken}")`);

      return {
        gameId: game.id,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        predictions: [
          {
            category: opt.category,
            code: opt.code,
            label: opt.label,
            spokenText: spoken,
            confidence: 0.88,
            reasoning: 'Strong home attacking form in last 5 games with high xG and regular corner conversion.'
          }
        ]
      };
    });

    console.log(`[MockAIService] 🏁 Generated mock predictions for ${results.length} games in ${Date.now() - startTime}ms`);
    console.log(`--------------------------------------------------------------------------\n`);
    return results;
  }

  async validatePreviousPredictions(_games: ValidatableGame[]): Promise<ValidationResult> {
    return {
      isHit: true,
      notes: 'All selected matches hit their respective predicted outcomes!'
    };
  }

  async resolveGameOutcomes(games: GameOutcomeEvaluationInput[]): Promise<GameOutcomeEvaluationResult[]> {
    return games.map((g) => ({
      gameId: g.gameId,
      realOutcome: 'HIT',
      realScore: '2 - 1',
      realOutcomeDetails: `${g.homeTeam} 2 - 1 ${g.awayTeam} (Predictions HIT)`
    }));
  }
}
