import { API_BASE_URL } from '../constants/config';
import { UpcomingGame, BettingCategory, BettingOption, MediaAsset, VoiceOption, HistoryItem } from '../types';

export class MobileApiService {
  private baseUrl: string;

  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async fetchGames(date: string, timezone: string): Promise<UpcomingGame[]> {
    const url = `${this.baseUrl}/api/games?date=${encodeURIComponent(date)}&timezone=${encodeURIComponent(timezone)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to fetch games (Status ${res.status})`);
    }
    const data = await res.json();
    return data.games || [];
  }

  async fetchBettingOptions(): Promise<{
    categories: BettingCategory[];
    options: BettingOption[];
    rules: { maxSelectionsPerGame: number; maxGamesPredicted: number };
  }> {
    const res = await fetch(`${this.baseUrl}/api/predictions/options`);
    if (!res.ok) throw new Error('Failed to load betting options');
    return res.json();
  }

  async fetchMediaAssets(): Promise<{
    backgroundVideos: MediaAsset[];
    backgroundAudio: MediaAsset[];
    voices: VoiceOption[];
    defaultSettings: any;
  }> {
    const res = await fetch(`${this.baseUrl}/api/media/assets`);
    if (!res.ok) throw new Error('Failed to load media assets');
    return res.json();
  }

  async requestAiPredictions(games: UpcomingGame[]): Promise<{
    gameId: string;
    predictions: { category: any; code: string; label: string; spokenText: string }[];
  }[]> {
    const res = await fetch(`${this.baseUrl}/api/predictions/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ games })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to generate AI predictions');
    }
    const data = await res.json();
    return data.predictions || [];
  }

  async generatePreviewVideo(payload: {
    targetDate: string;
    games: any[];
    backgroundVideo: string;
    backgroundAudio: string;
    voiceActor: string;
    thumbnailTimestamp: number;
    description: string;
  }): Promise<{ jobId: string; groupId: string; status: string }> {
    const res = await fetch(`${this.baseUrl}/api/predictions/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to start video preview generation');
    }
    return res.json();
  }

  async getJobProgress(jobId: string): Promise<{
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    percent: number;
    message: string;
    error?: string;
  }> {
    const res = await fetch(`${this.baseUrl}/api/video/progress/${jobId}`);
    if (!res.ok) throw new Error('Failed to fetch job progress');
    return res.json();
  }

  getVideoDownloadUrl(jobId: string): string {
    return `${this.baseUrl}/api/video/download/${jobId}`;
  }

  getThumbnailUrl(jobId: string): string {
    return `${this.baseUrl}/api/video/thumbnail/${jobId}`;
  }

  async updatePredictionStatus(groupId: string, status: 'ACCEPTED' | 'CANCELLED'): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/predictions/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, status })
    });
    return res.json();
  }

  async fetchHistory(): Promise<HistoryItem[]> {
    const res = await fetch(`${this.baseUrl}/api/predictions/history`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.history || [];
  }
}

export const mobileApi = new MobileApiService();
