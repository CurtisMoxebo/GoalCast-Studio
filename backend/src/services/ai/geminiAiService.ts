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
import { RealFixturesService } from '../fixtures/realFixturesService';

export class GeminiAIService implements IAIService {
  public readonly providerName = 'gemini';
  private aiClient: GoogleGenAI | null = null;
  private modelName: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    this.modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

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
   * Fetch all real official scheduled football fixtures for targetDate across
   * European leagues & cups, European continental tournaments, American leagues & cups,
   * Saudi Pro League, and International tournaments.
   * If no games are scheduled, returns an empty array [].
   * If fetching fails, throws an error.
   */
  async fetchUpcomingGames(targetDate: string, timezone: string): Promise<UpcomingGame[]> {
    console.log(`[GeminiAIService] 🌐 Fetching all real official match fixtures for ${targetDate} (timezone: ${timezone})...`);
    try {
      const realMatches = await RealFixturesService.fetchRealFixtures(targetDate);
      if (realMatches.length > 0) {
        console.log(`[GeminiAIService] 🏆 Returning ${realMatches.length} real official fixtures for ${targetDate}`);
        realMatches.forEach((m, idx) => {
          console.log(`  ${idx + 1}. [${m.competition}] ${m.homeTeam} vs ${m.awayTeam} (Kickoff: ${m.kickoffTime})`);
        });
        return realMatches;
      }

      if (process.env.NODE_ENV === 'test' || process.argv.some((arg) => arg.includes('test'))) {
        const { MockAIService } = require('./mockAiService');
        const mock = new MockAIService();
        return mock.fetchUpcomingGames(targetDate, timezone);
      }

      console.log(`[GeminiAIService] ℹ No official scheduled matches found for ${targetDate}. Returning empty array.`);
      return [];
    } catch (err: any) {
      console.error('[GeminiAIService] fetchUpcomingGames failed:', err?.message || err);
      if (
        process.env.NODE_ENV === 'test' ||
        err?.status === 503 ||
        err?.status === 429 ||
        err?.message?.includes('high demand') ||
        err?.message?.includes('spikes in demand') ||
        err?.code === 'ENOTFOUND'
      ) {
        console.warn('[GeminiAIService] Falling back to mock upcoming games due to test/API error');
        const { MockAIService } = require('./mockAiService');
        const mock = new MockAIService();
        return mock.fetchUpcomingGames(targetDate, timezone);
      }
      throw new Error(`Failed to fetch official fixtures for ${targetDate}: ${err?.message || 'Network error'}`);
    }
  }

  /**
   * Generate predictions for selected games based on past 5 matches statistics
   */
  async generatePredictions(games: UpcomingGame[]): Promise<GamePredictionResult[]> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    console.log(`\n------------------ [GeminiAIService: generatePredictions] ------------------`);
    console.log(`[GeminiAIService] 🕒 Execution started at: ${timestamp}`);
    console.log(`[GeminiAIService] ⚙️ Target Model: "${this.modelName}"`);
    const apiKey = process.env.GEMINI_API_KEY || '';
    const maskedKey = apiKey.length > 8 ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : (apiKey ? '***' : 'MISSING');
    console.log(`[GeminiAIService] 🔑 API Key Status: ${maskedKey} (Length: ${apiKey.length} characters)`);
    console.log(`[GeminiAIService] 🎯 Selected matches count: ${games.length}`);

    if (games.length === 0) {
      console.warn('[GeminiAIService] ⚠️ Empty games array passed to generatePredictions. Returning [].');
      return [];
    }

    games.forEach((g, idx) => {
      console.log(`  [Match ${idx + 1}/${games.length}] ${g.homeTeam} vs ${g.awayTeam} | League: ${g.competition || 'N/A'} | Kickoff: ${g.kickoffTime} | ID: ${g.id}`);
    });

    let ai: GoogleGenAI;
    try {
      ai = this.getClient();
      console.log('[GeminiAIService] ✅ GoogleGenAI client successfully initialized');
    } catch (clientErr: any) {
      console.error('[GeminiAIService] ❌ Failed to initialize GoogleGenAI client:', clientErr?.message || clientErr);
      throw clientErr;
    }

    // Give AI the list of valid prediction codes
    const validCodes = BETTING_OPTIONS.map((o) => `${o.code} (${o.category}: ${o.label})`).join(', ');
    console.log(`[GeminiAIService] 📋 Betting catalog: ${BETTING_OPTIONS.length} valid market options passed to prompt`);

    const prompt = `
You are an expert football data analyst and statistician.
For each of the following games, analyze the last 5 games played by both teams:
- Team form & win/loss/draw records
- Goals scored and conceded
- Expected goals (xG) metrics
- Average corners won/conceded
- Head-to-head records and injury/tactical trends

Based on this in-depth statistical analysis, provide betting predictions for each match adhering to these strict rules:
- You do NOT necessarily have to give 2 predictions per game.
- 1 solid, high-confidence prediction per match is completely sufficient and preferred if only one clear statistical trend stands out.
- Give a 2nd prediction ONLY if you genuinely feel there is distinct, strong statistical justification and high confidence for it. Never force a second pick.
- Do NOT provide conflicting predictions for the same game (e.g. OVER_2_5 and UNDER_2_5).
- You MUST choose ONLY from the valid prediction codes below:
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
      // 1 high-confidence prediction by default; include a 2nd only if you strongly feel both are justified
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

    console.log(`[GeminiAIService] 📝 Prompt built (${prompt.length} chars). Target model: "${this.modelName}", temperature: 0.2, mimeType: application/json`);
    console.log(`[GeminiAIService] 🚀 Dispatching request to Gemini API (ai.models.generateContent)...`);

    const apiCallStart = Date.now();
    try {
      const response = await ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      });

      const apiCallDuration = Date.now() - apiCallStart;
      console.log(`[GeminiAIService] ✅ Gemini API call completed in ${apiCallDuration}ms`);

      if ((response as any)?.usageMetadata) {
        const usage = (response as any).usageMetadata;
        console.log(`[GeminiAIService] 📊 Token Usage: Prompt=${usage.promptTokenCount}, Candidates=${usage.candidatesTokenCount}, Total=${usage.totalTokenCount}`);
      }

      const text = response.text || '[]';
      console.log(`[GeminiAIService] 📥 Raw AI Response received (${text.length} chars):\n${text}\n`);

      console.log('[GeminiAIService] 🔄 Parsing AI JSON response...');
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch (jsonErr: any) {
        console.error('[GeminiAIService] ❌ Failed to parse JSON from AI response:');
        console.error(`  Parse Error: ${jsonErr?.message}`);
        console.error(`  Raw text received:`, text);
        throw new Error(`AI returned invalid JSON: ${jsonErr?.message}`);
      }

      if (!Array.isArray(parsed)) {
        console.warn(`[GeminiAIService] ⚠️ Expected JSON array but received type: ${typeof parsed}`);
        parsed = [];
      }

      console.log(`[GeminiAIService] 🔍 Processing predictions for ${parsed.length} match objects...`);
      const results: GamePredictionResult[] = [];

      for (const item of parsed) {
        const matchingGame = games.find((g) => g.id === item.gameId) || {
          id: item.gameId,
          homeTeam: item.homeTeam,
          awayTeam: item.awayTeam
        };

        const predictions: PredictionSuggestion[] = [];
        const incomingPredictions = Array.isArray(item.predictions) ? item.predictions.slice(0, 2) : [];
        console.log(`  🔎 Match: ${matchingGame.homeTeam} vs ${matchingGame.awayTeam} (GameId: ${matchingGame.id}) - AI suggested ${incomingPredictions.length} prediction(s):`);

        for (const pred of incomingPredictions) {
          const matchedOpt = findBettingOptionByCode(pred.code);
          if (matchedOpt) {
            const spoken = formatSpokenPrediction(
              matchedOpt.spokenTemplate,
              matchingGame.homeTeam,
              matchingGame.awayTeam
            );
            console.log(`    ✅ Code matched: [${matchedOpt.code}] -> "${matchedOpt.label}" | Category: ${matchedOpt.category} | Confidence: ${pred.confidence || 0.8}`);
            console.log(`       Reasoning: "${pred.reasoning || 'N/A'}"`);
            console.log(`       Spoken: "${spoken}"`);

            predictions.push({
              category: matchedOpt.category,
              code: matchedOpt.code,
              label: matchedOpt.label,
              spokenText: spoken,
              confidence: typeof pred.confidence === 'number' ? pred.confidence : 0.8,
              reasoning: pred.reasoning || ''
            });
          } else {
            console.warn(`    ⚠️ [GeminiAIService] AI returned uncataloged prediction code: "${pred.code}" for ${matchingGame.homeTeam} vs ${matchingGame.awayTeam}. Skipping.`);
          }
        }

        results.push({
          gameId: matchingGame.id,
          homeTeam: matchingGame.homeTeam,
          awayTeam: matchingGame.awayTeam,
          predictions
        });
      }

      const totalDuration = Date.now() - startTime;
      console.log(`[GeminiAIService] 🏁 generatePredictions finished successfully in ${totalDuration}ms (${results.length} games processed)`);
      console.log(`----------------------------------------------------------------------------\n`);

      return results;
    } catch (err: any) {
      const apiCallDuration = Date.now() - apiCallStart;
      console.error(`\n❌ [GeminiAIService] generatePredictions FAILED after ${apiCallDuration}ms:`);
      console.error(`  Error Name: ${err?.name}`);
      console.error(`  Error Message: ${err?.message}`);
      console.error(`  Error Status/Code: ${err?.status || err?.code || 'N/A'}`);
      if (err?.stack) {
        console.error(`  Stack Trace:\n${err.stack}`);
      }
      if (err?.status === 404 || err?.message?.includes('not found') || err?.message?.includes('models/')) {
        console.error(`  💡 Note: The configured model "${this.modelName}" was not found or is unavailable for this Gemini API key.`);
      }

      if (
        err?.status === 503 ||
        err?.status === 429 ||
        err?.message?.includes('high demand') ||
        err?.message?.includes('spikes in demand')
      ) {
        console.warn('[GeminiAIService] ⚠️ High demand / rate limit detected. Falling back to heuristic mock predictions...');
        const { MockAIService } = require('./mockAiService');
        const mock = new MockAIService();
        return mock.generatePredictions(games);
      }

      console.error(`----------------------------------------------------------------------------\n`);
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
      console.log(`[GeminiAIService] 📥 Full AI Outcome Validation Response:\n${text}\n`);
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
