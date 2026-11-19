export interface UpcomingGame {
  id: string;
  homeTeam: string;
  homeTeamLogo?: string;
  awayTeam: string;
  awayTeamLogo?: string;
  competition: string;
  competitionLogo?: string;
  kickoffTime: string; // ISO 8601 string
}

export interface PredictionSuggestion {
  category: 'RESULT' | 'GOALS' | 'CORNERS';
  code: string;
  label: string;
  spokenText: string;
  confidence?: number;
  reasoning?: string;
}

export interface GamePredictionResult {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  predictions: PredictionSuggestion[];
}

export interface ValidatableGame {
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
  selections: {
    code: string;
    label: string;
    category: string;
  }[];
}

export interface ValidationResult {
  isHit: boolean;
  notes: string;
}

export interface IAIService {
  readonly providerName: string;
  fetchUpcomingGames(targetDate: string, timezone: string): Promise<UpcomingGame[]>;
  generatePredictions(games: UpcomingGame[]): Promise<GamePredictionResult[]>;
  validatePreviousPredictions(games: ValidatableGame[]): Promise<ValidationResult>;
}
