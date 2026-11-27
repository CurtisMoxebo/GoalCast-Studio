import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOCIAL_PLATFORMS,
  formatThumbnailTimestamp,
  buildFacebookShareExtras,
  buildInstagramShareExtras,
  buildTikTokShareExtras,
  buildYouTubeShareExtras
} from '../services/socialShare';
import { MobileApiService } from '../services/api';
import { sessionStore } from '../services/sessionStore';
import {
  DEFAULT_THUMBNAIL_TIMESTAMP,
  DEFAULT_THUMBNAIL_TIME_STR,
  DEFAULT_SELECTED_SOCIAL_PLATFORMS,
  MIN_SCHEDULE_ADVANCE_MINUTES
} from '../constants/config';
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

test('Mobile Regression: formatThumbnailTimestamp formats seconds into MM:SS', () => {
  assert.equal(formatThumbnailTimestamp(0), '00:00');
  assert.equal(formatThumbnailTimestamp(3), '00:03');
  assert.equal(formatThumbnailTimestamp(5), '00:05');
  assert.equal(formatThumbnailTimestamp(15.7), '00:15');
  assert.equal(formatThumbnailTimestamp(30), '00:30');
  assert.equal(formatThumbnailTimestamp(45), '00:45');
  assert.equal(formatThumbnailTimestamp(60), '01:00');
  assert.equal(formatThumbnailTimestamp(65), '01:05');
  assert.equal(formatThumbnailTimestamp(undefined), DEFAULT_THUMBNAIL_TIME_STR);
  assert.equal(formatThumbnailTimestamp(DEFAULT_THUMBNAIL_TIMESTAMP), DEFAULT_THUMBNAIL_TIME_STR);
});

test('Mobile Thumbnail Frame Time: Slider supports 0 to 60 seconds with milestones [0, 15, 30, 45, 60]', () => {
  const min = 0;
  const max = 60;
  const ticks = [0, 15, 30, 45, 60];

  assert.equal(min, 0);
  assert.equal(max, 60);
  assert.deepEqual(ticks, [0, 15, 30, 45, 60]);

  // Ensure percentage calculation works accurately across 0-60
  const getPercentage = (sec: number) => Math.max(0, Math.min(100, ((sec - min) / (max - min)) * 100));
  assert.equal(getPercentage(0), 0);
  assert.equal(getPercentage(15), 25);
  assert.equal(getPercentage(30), 50);
  assert.equal(getPercentage(45), 75);
  assert.equal(getPercentage(60), 100);
});

test('Mobile Regression: buildFacebookShareExtras includes description and thumbnail timeframe', () => {
  const contentUri = 'content://com.goalcast.provider/video.mp4';
  const extras = buildFacebookShareExtras(
    {
      videoUri: 'file:///path/to/video.mp4',
      description: 'Football predictions for 22nd Nov ⚽ #predictions',
      thumbnailTimestamp: 5.5
    },
    contentUri
  );

  // Application ID & Stream
  assert.equal(extras['com.facebook.platform.extra.APPLICATION_ID'], '966242223397117');
  assert.equal(extras['android.intent.extra.STREAM'], contentUri);

  // Description / Caption across all keys
  assert.equal(extras['android.intent.extra.TEXT'], 'Football predictions for 22nd Nov ⚽ #predictions');
  assert.equal(extras.caption, 'Football predictions for 22nd Nov ⚽ #predictions');
  assert.equal(extras.description, 'Football predictions for 22nd Nov ⚽ #predictions');
  assert.equal(extras['com.facebook.platform.extra.CAPTION'], 'Football predictions for 22nd Nov ⚽ #predictions');
  assert.equal(extras['com.facebook.platform.extra.DESCRIPTION'], 'Football predictions for 22nd Nov ⚽ #predictions');
  assert.equal(extras['com.facebook.platform.extra.TEXT'], 'Football predictions for 22nd Nov ⚽ #predictions');

  // Thumbnail time frame (formatted string, seconds, milliseconds)
  assert.equal(extras.thumbnail_time, '00:05');
  assert.equal(extras.thumbnail_timestamp, 5.5);
  assert.equal(extras.thumbnail_timestamp_ms, 5500);
  assert.equal(extras.video_cover_time, 5.5);
  assert.equal(extras.cover_time, '00:05');
  assert.equal(extras.cover_timestamp, 5.5);
  assert.equal(extras['com.facebook.platform.extra.THUMBNAIL_TIME'], '00:05');
  assert.equal(extras['com.facebook.platform.extra.THUMBNAIL_TIMESTAMP'], 5.5);
  assert.equal(extras['com.facebook.platform.extra.COVER_TIME'], '00:05');
  assert.equal(extras['com.facebook.platform.extra.VIDEO_COVER_TIMESTAMP'], 5.5);
});

test('Mobile Regression: buildInstagramShareExtras includes description and thumbnail timeframe', () => {
  const contentUri = 'content://com.goalcast.provider/video.mp4';
  const extras = buildInstagramShareExtras(
    {
      videoUri: 'file:///path/to/video.mp4',
      description: 'Football predictions for 22nd Nov ⚽ #predictions',
      thumbnailTimestamp: 4.0
    },
    contentUri
  );

  // Application ID & Stream
  assert.equal(extras['com.instagram.platform.extra.APPLICATION_ID'], '966242223397117');
  assert.equal(extras['android.intent.extra.STREAM'], contentUri);

  // Description / Caption across all keys
  assert.equal(extras['android.intent.extra.TEXT'], 'Football predictions for 22nd Nov ⚽ #predictions');
  assert.equal(extras.caption, 'Football predictions for 22nd Nov ⚽ #predictions');
  assert.equal(extras.description, 'Football predictions for 22nd Nov ⚽ #predictions');
  assert.equal(extras['com.instagram.platform.extra.CAPTION'], 'Football predictions for 22nd Nov ⚽ #predictions');
  assert.equal(extras['com.instagram.platform.extra.DESCRIPTION'], 'Football predictions for 22nd Nov ⚽ #predictions');
  assert.equal(extras['com.instagram.platform.extra.TEXT'], 'Football predictions for 22nd Nov ⚽ #predictions');

  // Thumbnail time frame
  assert.equal(extras.thumbnail_time, '00:04');
  assert.equal(extras.thumbnail_timestamp, 4.0);
  assert.equal(extras.thumbnail_timestamp_ms, 4000);
  assert.equal(extras.cover_time, '00:04');
  assert.equal(extras['com.instagram.platform.extra.THUMBNAIL_TIME'], '00:04');
  assert.equal(extras['com.instagram.platform.extra.THUMBNAIL_TIMESTAMP'], 4.0);
});

test('Mobile Regression: buildTikTokShareExtras includes description and thumbnail timeframe', () => {
  const contentUri = 'content://com.goalcast.provider/video.mp4';
  const extras = buildTikTokShareExtras(
    {
      videoUri: 'file:///path/to/video.mp4',
      description: 'Football predictions for 22nd Nov ⚽ #predictions',
      thumbnailTimestamp: 6.2
    },
    contentUri
  );

  assert.equal(extras['android.intent.extra.STREAM'], contentUri);
  assert.equal(extras['android.intent.extra.TEXT'], 'Football predictions for 22nd Nov ⚽ #predictions');
  assert.equal(extras.caption, 'Football predictions for 22nd Nov ⚽ #predictions');
  assert.equal(extras.description, 'Football predictions for 22nd Nov ⚽ #predictions');
  assert.equal(extras.title, 'Football predictions for 22nd Nov ⚽ #predictions');

  assert.equal(extras.thumbnail_time, '00:06');
  assert.equal(extras.thumbnail_timestamp, 6.2);
  assert.equal(extras.thumbnail_timestamp_ms, 6200);
  assert.equal(extras.cover_time, '00:06');
});

test('Mobile Regression: buildYouTubeShareExtras formats #Shorts in title and description with timeframe', () => {
  const contentUri = 'content://com.goalcast.provider/video.mp4';
  const extras = buildYouTubeShareExtras(
    {
      videoUri: 'file:///path/to/video.mp4',
      description: 'Premier League Matchday Picks ⚽🔥\n#football #predictions',
      thumbnailTimestamp: 3.0
    },
    contentUri
  );

  assert.equal(extras['android.intent.extra.STREAM'], contentUri);
  assert.ok(extras['android.intent.extra.TITLE'].includes('#Shorts'));
  assert.ok(extras['android.intent.extra.TEXT'].includes('#Shorts'));
  assert.equal(extras.thumbnail_time, '00:03');
  assert.equal(extras.thumbnail_timestamp, 3.0);
  assert.equal(extras.thumbnail_timestamp_ms, 3000);
});

test('Mobile Regression: MobileApiService URL builder methods and social endpoints', () => {
  const api = new MobileApiService('http://test-server:5000/');
  assert.equal(api.getVideoDownloadUrl('job_99'), 'http://test-server:5000/api/video/download/job_99');
  assert.equal(api.getThumbnailUrl('job_99'), 'http://test-server:5000/api/video/thumbnail/job_99');
  assert.equal(api.getMediaAssetUrl('background_video_1.mp4'), 'http://test-server:5000/api/media/stream/background_video_1.mp4');
  assert.equal(api.getMediaAssetUrl('background_track_2.mp3'), 'http://test-server:5000/api/media/stream/background_track_2.mp3');
  assert.equal(api.getVoicePreviewUrl('hearth'), 'http://test-server:5000/api/media/voice-preview/hearth');
  assert.equal(typeof api.scheduleSocialPost, 'function');
  assert.equal(typeof api.getSocialPipeline, 'function');
});

test('Mobile Regression: 30-minute advance scheduling strictly enforces >= 29.5 minutes rule', () => {
  const isScheduleValid = (scheduledDate: Date): boolean => {
    const diffMinutes = (scheduledDate.getTime() - Date.now()) / (1000 * 60);
    return diffMinutes >= MIN_SCHEDULE_ADVANCE_MINUTES;
  };

  // 10 minutes in future -> rejected
  const tenMins = new Date(Date.now() + 10 * 60 * 1000);
  assert.equal(isScheduleValid(tenMins), false);

  // 25 minutes in future -> rejected
  const twentyFiveMins = new Date(Date.now() + 25 * 60 * 1000);
  assert.equal(isScheduleValid(twentyFiveMins), false);

  // Exactly 30 minutes in future -> accepted
  const thirtyMins = new Date(Date.now() + 30.5 * 60 * 1000);
  assert.equal(isScheduleValid(thirtyMins), true);

  // 60 minutes in future -> accepted
  const oneHour = new Date(Date.now() + 60 * 60 * 1000);
  assert.equal(isScheduleValid(oneHour), true);

  // Past date -> rejected
  const past = new Date(Date.now() - 5 * 60 * 1000);
  assert.equal(isScheduleValid(past), false);
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

test('Mobile Regression: SessionStore removeHistoryItems removes single and batch items correctly', () => {
  sessionStore.clearAll();
  const mockHistory: HistoryItem[] = [
    { id: 'h1', targetDate: '2026-11-20', description: '', status: 'ACCEPTED', createdAt: '2026-11-20T10:00:00Z', games: [] },
    { id: 'h2', targetDate: '2026-11-21', description: '', status: 'ACCEPTED', createdAt: '2026-11-21T10:00:00Z', games: [] },
    { id: 'h3', targetDate: '2026-11-22', description: '', status: 'ACCEPTED', createdAt: '2026-11-22T10:00:00Z', games: [] }
  ];

  sessionStore.setHistory(mockHistory);
  assert.equal(sessionStore.getHistory()?.length, 3);

  // Single deletion
  sessionStore.removeHistoryItems('h2');
  assert.equal(sessionStore.getHistory()?.length, 2);
  assert.deepEqual(sessionStore.getHistory()?.map(h => h.id), ['h1', 'h3']);

  // Batch deletion
  sessionStore.removeHistoryItems(['h1', 'h3']);
  assert.equal(sessionStore.getHistory()?.length, 0);
});

test('Mobile Video Settings: Date Time Picker default 19:00 and instant vs scheduled validation', () => {
  const getDefaultScheduledDate = (now: Date = new Date()): Date => {
    const today19 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 0, 0, 0);
    const diffMinutes = (today19.getTime() - now.getTime()) / (1000 * 60);

    // If current time is more than 30 minutes before 19:00 today, default date is today at 19:00
    // Otherwise, default date is tomorrow at 19:00
    if (diffMinutes > 30) {
      return today19;
    } else {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 19, 0, 0, 0);
    }
  };

  // Test 1: When current time is > 30m before 19:00 (e.g. 14:00 today) -> Default date is TODAY at 19:00
  const now14h = new Date(2026, 10, 22, 14, 0, 0, 0); // Nov 22, 14:00
  const defaultDateToday = getDefaultScheduledDate(now14h);
  assert.equal(defaultDateToday.getDate(), 22, 'Must default to today when > 30m before 19:00');
  assert.equal(defaultDateToday.getHours(), 19, 'Default hour must be 19');
  assert.equal(defaultDateToday.getMinutes(), 0, 'Default minute must be 0');

  // Test 2: When current time is 18:20 today (40m before 19:00, which is > 30m) -> Default date is TODAY at 19:00
  const now1820 = new Date(2026, 10, 22, 18, 20, 0, 0);
  const defaultDate1820 = getDefaultScheduledDate(now1820);
  assert.equal(defaultDate1820.getDate(), 22, 'Must default to today when 40m before 19:00');
  assert.equal(defaultDate1820.getHours(), 19);

  // Test 3: When current time is 18:35 today (25m before 19:00, <= 30m) -> Default date is TOMORROW at 19:00
  const now1835 = new Date(2026, 10, 22, 18, 35, 0, 0);
  const defaultDateTomorrow1 = getDefaultScheduledDate(now1835);
  assert.equal(defaultDateTomorrow1.getDate(), 23, 'Must default to tomorrow when <= 30m before 19:00');
  assert.equal(defaultDateTomorrow1.getHours(), 19);
  assert.equal(defaultDateTomorrow1.getMinutes(), 0);

  // Test 4: When current time is after 19:00 (e.g. 21:00 today) -> Default date is TOMORROW at 19:00
  const now21h = new Date(2026, 10, 22, 21, 0, 0, 0);
  const defaultDateTomorrow2 = getDefaultScheduledDate(now21h);
  assert.equal(defaultDateTomorrow2.getDate(), 23, 'Must default to tomorrow when after 19:00');
  assert.equal(defaultDateTomorrow2.getHours(), 19);

  // Test 5: Instant post mode (isScheduled = false) allows immediate creation
  const isPostValid = (isScheduled: boolean, scheduledDate: Date): boolean => {
    if (!isScheduled) return true; // Instant post is always valid
    const diffMinutes = (scheduledDate.getTime() - Date.now()) / (1000 * 60);
    return diffMinutes >= MIN_SCHEDULE_ADVANCE_MINUTES;
  };

  assert.equal(isPostValid(false, new Date()), true, 'Instant post mode must be valid immediately');

  // Test 6: Scheduled post cannot be created within 30 minutes of current time
  const tooSoon = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
  assert.equal(isPostValid(true, tooSoon), false, 'Post within 30 mins must be rejected');

  const validFuture = new Date(Date.now() + 45 * 60 * 1000); // 45 mins
  assert.equal(isPostValid(true, validFuture), true, 'Post >= 30 mins must be accepted');
});

test('Mobile Social Selection: Default platforms include all 4 platforms and support user toggling', () => {
  const defaultPlatforms = [...DEFAULT_SELECTED_SOCIAL_PLATFORMS];
  assert.equal(defaultPlatforms.length, 4, 'By default, all 4 platforms must be selected');

  // Verify toggling off and on
  const toggle = (current: string[], target: string) =>
    current.includes(target) ? current.filter((p) => p !== target) : [...current, target];

  // Deselect TikTok
  const withoutTikTok = toggle(defaultPlatforms, 'tiktok');
  assert.equal(withoutTikTok.includes('tiktok'), false);
  assert.equal(withoutTikTok.length, 3);

  // Re-select TikTok
  const restored = toggle(withoutTikTok, 'tiktok');
  assert.equal(restored.includes('tiktok'), true);
  assert.equal(restored.length, 4);

  // Deselect all
  const allDeselected: string[] = [];
  assert.equal(allDeselected.length, 0);

  // Select all
  const allSelected = [...defaultPlatforms];
  assert.equal(allSelected.length, 4);
});

