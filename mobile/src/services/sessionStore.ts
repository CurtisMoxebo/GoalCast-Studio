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
  private selectionOrder: string[] = [];
  private gameReasons: Record<string, string> = {};
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

  removeHistoryItems(target: string | string[]): void {
    if (!this.history) return;
    const targetSet = new Set(Array.isArray(target) ? target : [target]);
    this.history = this.history.filter((item) => !targetSet.has(item.id));
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

  getSelectionOrder(): string[] {
    return this.selectionOrder;
  }

  setSelectionOrder(order: string[]): void {
    this.selectionOrder = order;
  }

  // --- Prediction Reasons ---
  getReasons(): Record<string, string> {
    return this.gameReasons;
  }

  setReasons(reasons: Record<string, string>): void {
    this.gameReasons = reasons;
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
    this.selectionOrder = [];
    this.gameReasons = {};
    this.selectedDate = null;
  }
}

export const sessionStore = new SessionStore();
