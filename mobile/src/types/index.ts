export interface UpcomingGame {
  id: string;
  homeTeam: string;
  homeTeamLogo?: string;
  awayTeam: string;
  awayTeamLogo?: string;
  competition: string;
  competitionLogo?: string;
  kickoffTime: string;
}

export interface PredictionSelection {
  code: string;
  label: string;
  category: 'RESULT' | 'GOALS' | 'CORNERS';
  spokenText?: string;
}

export interface BettingOption {
  id: string;
  category: 'RESULT' | 'GOALS' | 'CORNERS';
  code: string;
  label: string;
  spokenTemplate: string;
}

export interface BettingCategory {
  id: 'RESULT' | 'GOALS' | 'CORNERS';
  title: string;
  description: string;
}

export interface VideoSettings {
  backgroundVideo: string;
  backgroundAudio: string;
  voiceActor: string;
  customIntroSpeech?: string;
  thumbnailTimestamp: number; // e.g. 5.0
  description: string;
  scheduledPostTime?: string; // ISO 8601 string, must be >= now + 30 mins
}

export interface SelectedGamePrediction {
  game: UpcomingGame;
  selections: PredictionSelection[];
}

export interface MediaAsset {
  id: string;
  name: string;
  filename: string;
}

export interface VoiceOption {
  id: string;
  name: string;
  gender: 'female' | 'male';
  accent?: string;
  description?: string;
}

export interface HistoryItem {
  id: string;
  status: 'ACCEPTED' | 'PREVIEW' | 'CANCELLED' | 'DELETED';
  groupOutcome?: 'PENDING' | 'HIT' | 'MISS';
  targetDate: string;
  description: string;
  thumbnailTimestamp?: number;
  createdAt: string;
  localVideoPath?: string;
  games: {
    id?: string;
    homeTeam: string;
    homeTeamLogo?: string;
    awayTeam: string;
    awayTeamLogo?: string;
    competition?: string;
    kickoffTime?: string;
    realOutcome?: 'PENDING' | 'HIT' | 'MISS';
    selections: {
      code: string;
      label: string;
      category?: string;
    }[];
  }[];
}
