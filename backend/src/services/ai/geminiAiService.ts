import { GoogleGenAI } from '@google/genai';
import {
  IAIService,
  UpcomingGame,
  GamePredictionResult,
  ValidatableGame,
  ValidationResult,
  PredictionSuggestion
} from './aiService.interface';
import {
  findBettingOptionByCode,
  formatSpokenPrediction,
  BETTING_OPTIONS
} from '../../constants/bettingRules';

export class GeminiAIService implements IAIService {
  public readonly providerName = 'gemini';
  private aiClient: GoogleGenAI | null = null;
  private modelName: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    this.modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    if (apiKey && apiKey.trim() !== '' && apiKey !== 'your_gemini_api_key_here') {
      this.aiClient = new GoogleGenAI({ apiKey });
    }
  }

  private getClient(): GoogleGenAI {
    if (!this.aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
        throw new Error(
          'GEMINI_API_KEY is not configured in backend/.env. Please provide your Gemini API key.'
        );
      }
      this.aiClient = new GoogleGenAI({ apiKey });
    }
    return this.aiClient;
  }

  /**
   * Fetch upcoming popular games for targetDate in specified timezone
   */
  async fetchUpcomingGames(targetDate: string, timezone: string): Promise<UpcomingGame[]> {
    const ai = this.getClient();

    const prompt = `
You are a football/soccer fixtures specialist with live up-to-date knowledge.
Return a list of real or scheduled official football matches occurring on the date: "${targetDate}".
The user is located in timezone: "${timezone}".

Include matches from popular global competitions:
- English Premier League, UEFA Champions League / Europa League
- Spanish La Liga, Italian Serie A, German Bundesliga, French Ligue 1
- American Major League Soccer (MLS) / Concacaf
- Saudi Pro League
- Other major domestic cup or international fixtures if happening on that date.

For each game, return:
- id: A unique match ID string
- homeTeam: Full official name of home team
- homeTeamLogo: A reliable HTTPS URL to team crest or Wikimedia/ESPN/Fotmob SVG/PNG logo
- awayTeam: Full official name of away team
- awayTeamLogo: A reliable HTTPS URL to team crest or logo
- competition: Name of the league or competition
- competitionLogo: A reliable HTTPS URL to competition logo
- kickoffTime: Exact ISO 8601 string adjusted to the given timezone or UTC

Return between 4 and 15 matches if available.
Respond ONLY with a valid JSON array of objects adhering strictly to this schema:
[
  {
    "id": "epl_2026_ars_che",
    "homeTeam": "Arsenal",
    "homeTeamLogo": "https://upload.wikimedia.org/wikipedia/en/5/53/Arsenal_FC.svg",
    "awayTeam": "Chelsea",
    "awayTeamLogo": "https://upload.wikimedia.org/wikipedia/en/c/cc/Chelsea_FC.svg",
    "competition": "Premier League",
    "competitionLogo": "https://upload.wikimedia.org/wikipedia/en/f/f2/Premier_League_Logo.svg",
    "kickoffTime": "2026-11-20T17:30:00Z"
  }
]
`;

    try {
      const response = await ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      });

      const text = response.text || '[]';
      const parsed = JSON.parse(text);

      if (!Array.isArray(parsed)) {
        throw new Error('AI returned an unexpected format (not an array)');
      }

      return parsed.map((item: any, index: number) => ({
        id: item.id || `game_${index}_${Date.now()}`,
        homeTeam: item.homeTeam || 'Home Team',
        homeTeamLogo: item.homeTeamLogo || 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=100&h=100&fit=crop',
        awayTeam: item.awayTeam || 'Away Team',
        awayTeamLogo: item.awayTeamLogo || 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=100&h=100&fit=crop',
        competition: item.competition || 'Football Match',
        competitionLogo: item.competitionLogo || 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=100&h=100&fit=crop',
        kickoffTime: item.kickoffTime || new Date(targetDate).toISOString()
      }));
    } catch (err: any) {
      console.error('[GeminiAIService] fetchUpcomingGames failed:', err?.message || err);
      throw err;
    }
  }

  /**
   * Generate predictions for selected games based on past 5 matches statistics
   */
  async generatePredictions(games: UpcomingGame[]): Promise<GamePredictionResult[]> {
    if (games.length === 0) return [];
    const ai = this.getClient();

    // Give AI the list of valid prediction codes
    const validCodes = BETTING_OPTIONS.map((o) => `${o.code} (${o.category}: ${o.label})`).join(', ');

    const prompt = `
You are an expert football data analyst and statistician.
For each of the following games, analyze the last 5 games played by both teams:
- Team form & win/loss/draw records
- Goals scored and conceded
- Expected goals (xG) metrics
- Average corners won/conceded
- Head-to-head records and injury/tactical trends

Based on this in-depth statistical analysis, pick the STRONGEST 1 or 2 betting predictions for each match.
You MUST choose ONLY from the valid prediction codes below:
${validCodes}

Matches to analyze:
${JSON.stringify(
  games.map((g) => ({
    id: g.id,
    homeTeam: g.homeTeam,
    awayTeam: g.awayTeam,
    competition: g.competition,
    kickoffTime: g.kickoffTime
  })),
  null,
  2
)}

Return a JSON array of objects with the exact schema:
[
  {
    "gameId": "string",
    "homeTeam": "string",
    "awayTeam": "string",
    "predictions": [
      {
        "category": "RESULT" | "GOALS" | "CORNERS",
        "code": "EXACT_CODE_FROM_LIST",
        "confidence": 0.85,
        "reasoning": "Home team won last 4 games with high xG and conceded only 1 goal"
      }
    ]
  }
]
`;

    try {
      const response = await ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      });

      const text = response.text || '[]';
      const parsed = JSON.parse(text);

      const results: GamePredictionResult[] = [];

      for (const item of parsed) {
        const matchingGame = games.find((g) => g.id === item.gameId) || {
          id: item.gameId,
          homeTeam: item.homeTeam,
          awayTeam: item.awayTeam
        };

        const predictions: PredictionSuggestion[] = [];

        // At most 2 predictions per game as per rules
        const incomingPredictions = Array.isArray(item.predictions) ? item.predictions.slice(0, 2) : [];

        for (const pred of incomingPredictions) {
          const matchedOpt = findBettingOptionByCode(pred.code);
          if (matchedOpt) {
            predictions.push({
              category: matchedOpt.category,
              code: matchedOpt.code,
              label: matchedOpt.label,
              spokenText: formatSpokenPrediction(
                matchedOpt.spokenTemplate,
                matchingGame.homeTeam,
                matchingGame.awayTeam
              ),
              confidence: typeof pred.confidence === 'number' ? pred.confidence : 0.8,
              reasoning: pred.reasoning || ''
            });
          }
        }

        results.push({
          gameId: matchingGame.id,
          homeTeam: matchingGame.homeTeam,
          awayTeam: matchingGame.awayTeam,
          predictions
        });
      }

      return results;
    } catch (err: any) {
      console.error('[GeminiAIService] generatePredictions failed:', err?.message || err);
      throw err;
    }
  }

  /**
   * Validate past predictions by checking real final match outcomes
   */
  async validatePreviousPredictions(games: ValidatableGame[]): Promise<ValidationResult> {
    if (games.length === 0) {
      return { isHit: false, notes: 'No previous games found to validate.' };
    }

    const ai = this.getClient();

    const prompt = `
You are a football match results verifier.
Verify the actual final scores and statistics for the following matches and their selected betting predictions:

${JSON.stringify(games, null, 2)}

Determine if EVERY SINGLE PREDICTION made across all games won (Hit).
If even one prediction failed or the game was postponed without resolution, isHit must be false.
Only if ALL predictions hit, isHit is true.

Return a JSON object adhering to this schema:
{
  "isHit": true | false,
  "notes": "Short summary explaining the result of each match and whether the prediction hit"
}
`;

    try {
      const response = await ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      });

      const text = response.text || '{}';
      const parsed = JSON.parse(text);

      return {
        isHit: Boolean(parsed.isHit),
        notes: parsed.notes || 'Validation processed by AI'
      };
    } catch (err: any) {
      console.error('[GeminiAIService] validatePreviousPredictions failed:', err?.message || err);
      throw err;
    }
  }
}
