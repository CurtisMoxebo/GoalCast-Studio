import test from 'node:test';
import assert from 'node:assert/strict';
import { SOCIAL_PLATFORMS } from '../services/socialShare';
import { MobileApiService } from '../services/api';
import { sessionStore } from '../services/sessionStore';
import { UpcomingGame, HistoryItem } from '../types';

test('Mobile Regression: Social platforms configuration', () => {
  assert.equal(SOCIAL_PLATFORMS.length, 4, 'Must have exactly 4 platforms: FB, IG, TikTok, YouTube');
  const ids = SOCIAL_PLATFORMS.map((p) => p.id);
  assert.ok(ids.includes('facebook'));
  assert.ok(ids.includes('instagram'));
  assert.ok(ids.includes('tiktok'));
  assert.ok(ids.includes('youtube'));

  // Test names & colors
  const fb = SOCIAL_PLATFORMS.find((p) => p.id === 'facebook');
  assert.equal(fb?.name, 'Facebook');
  assert.equal(fb?.color, '#1877F2');
  const ig = SOCIAL_PLATFORMS.find((p) => p.id === 'instagram');
  assert.equal(ig?.name, 'Instagram');
  assert.equal(ig?.color, '#833AB4');
  const yt = SOCIAL_PLATFORMS.find((p) => p.id === 'youtube');
  assert.equal(yt?.name, 'YouTube');
  assert.equal(yt?.color, '#FF0000');
  const tiktok = SOCIAL_PLATFORMS.find((p) => p.id === 'tiktok');
  assert.equal(tiktok?.name, 'TikTok');
  assert.equal(tiktok?.color, '#000000');
});

test('Mobile Regression: MobileApiService URL builder methods', () => {
  const api = new MobileApiService('http://test-server:5000/');
  assert.equal(api.getVideoDownloadUrl('job_99'), 'http://test-server:5000/api/video/download/job_99');
  assert.equal(api.getThumbnailUrl('job_99'), 'http://test-server:5000/api/video/thumbnail/job_99');
});

test('Mobile Regression: SessionStore caches games by date and avoids re-fetching during session', () => {
  sessionStore.clearAll();

  // Initially empty
  assert.equal(sessionStore.hasGames('2026-11-21'), false);
  assert.equal(sessionStore.getGames('2026-11-21'), null);

  const mockGamesDay1: UpcomingGame[] = [
    {
      id: 'game_1',
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      competition: 'Premier League',
      kickoffTime: '2026-11-21T15:00:00Z'
    }
  ];

  // Save games for date 2026-11-21
  sessionStore.setGames('2026-11-21', mockGamesDay1);
  assert.equal(sessionStore.hasGames('2026-11-21'), true);
  assert.deepEqual(sessionStore.getGames('2026-11-21'), mockGamesDay1);

  // Different date 2026-11-22 is not cached
  assert.equal(sessionStore.hasGames('2026-11-22'), false);

  const mockGamesDay2: UpcomingGame[] = [
    {
      id: 'game_2',
      homeTeam: 'Real Madrid',
      awayTeam: 'Barcelona',
      competition: 'LaLiga',
      kickoffTime: '2026-11-22T20:00:00Z'
    }
  ];

  sessionStore.setGames('2026-11-22', mockGamesDay2);
  assert.equal(sessionStore.hasGames('2026-11-22'), true);

  // Navigating back to 2026-11-21 returns cached data without reloading
  assert.deepEqual(sessionStore.getGames('2026-11-21'), mockGamesDay1);

  // Invalidate specific date on refresh
  sessionStore.invalidateGames('2026-11-21');
  assert.equal(sessionStore.hasGames('2026-11-21'), false);
  // Day 2 remains intact
  assert.equal(sessionStore.hasGames('2026-11-22'), true);
});

test('Mobile Regression: SessionStore caches history data and invalidates on refresh or video accept', () => {
  sessionStore.clearAll();

  assert.equal(sessionStore.hasHistory(), false);
  assert.equal(sessionStore.getHistory(), null);

  const mockHistory: HistoryItem[] = [
    {
      id: 'hist_1',
      targetDate: '2026-11-20',
      description: 'Weekend predictions',
      localVideoPath: 'goalcast_hist_1.mp4',
      status: 'ACCEPTED',
      createdAt: '2026-11-20T12:00:00Z',
      games: []
    }
  ];

  // Cache history
  sessionStore.setHistory(mockHistory);
  assert.equal(sessionStore.hasHistory(), true);
  assert.deepEqual(sessionStore.getHistory(), mockHistory);

  // Invalidate on refresh or new video accepted
  sessionStore.invalidateHistory();
  assert.equal(sessionStore.hasHistory(), false);
  assert.equal(sessionStore.getHistory(), null);
});

test('Mobile Regression: SessionStore preserves prediction selections and active date across tabs', () => {
  sessionStore.clearAll();

  sessionStore.setSelectedDate('2026-11-23');
  assert.equal(sessionStore.getSelectedDate(), '2026-11-23');

  const selections = {
    game_10: [{ code: '1X', label: 'Home or Draw', category: 'RESULT' as const, spokenText: 'Arsenal to win or draw' }]
  };

  sessionStore.setSelections(selections);
  assert.deepEqual(sessionStore.getSelections(), selections);
});

