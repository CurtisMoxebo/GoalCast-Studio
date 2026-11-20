import { UpcomingGame, HistoryItem, PredictionSelection } from '../types';

/**
 * In-memory session store that persists data in the device during the current app session.
 * Prevents redundant re-fetching when navigating dates or switching tabs.
 * Data is only reloaded from the network when an explicit refresh is triggered.
 */
export class SessionStore {
  private gamesByDate: Map<string, UpcomingGame[]> = new Map();
  private history: HistoryItem[] | null = null;
  private gameSelections: Record<string, PredictionSelection[]> = {};
  private selectedDate: string | null = null;

  // --- Games by Date ---
  getGames(date: string): UpcomingGame[] | null {
    return this.gamesByDate.get(date) ?? null;
  }

  setGames(date: string, games: UpcomingGame[]): void {
    this.gamesByDate.set(date, games);
  }

  hasGames(date: string): boolean {
    return this.gamesByDate.has(date);
  }

  invalidateGames(date?: string): void {
    if (date) {
      this.gamesByDate.delete(date);
    } else {
      this.gamesByDate.clear();
    }
  }

  // --- History ---
  getHistory(): HistoryItem[] | null {
    return this.history;
  }

  setHistory(items: HistoryItem[]): void {
    this.history = items;
  }

  hasHistory(): boolean {
    return this.history !== null;
  }

  invalidateHistory(): void {
    this.history = null;
  }

  // --- Predictions Selections ---
  getSelections(): Record<string, PredictionSelection[]> {
    return this.gameSelections;
  }

  setSelections(selections: Record<string, PredictionSelection[]>): void {
    this.gameSelections = selections;
  }

  // --- Current Selected Date ---
  getSelectedDate(): string | null {
    return this.selectedDate;
  }

  setSelectedDate(date: string): void {
    this.selectedDate = date;
  }

  // --- Reset All (Session end / tests) ---
  clearAll(): void {
    this.gamesByDate.clear();
    this.history = null;
    this.gameSelections = {};
    this.selectedDate = null;
  }
}

export const sessionStore = new SessionStore();
