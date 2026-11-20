import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db/prisma';
import {
  getPreviousHitGameGroup,
  mapGroupToOverlayGames,
  isGameFinished,
  areAllGamesFinished,
  TWO_HOURS_MS
} from '../services/predictions/previousHitService';
import { setAIServiceInstance } from '../services/ai/aiFactory';

test('PreviousHitService: isGameFinished checks if match kickoff is at least 2 hours ago', () => {
  const now = 1700000000000;

  // Kickoff was 3 hours ago -> finished
  const finishedKickoff = new Date(now - 3 * 60 * 60 * 1000);
  assert.equal(isGameFinished(finishedKickoff, now), true);

  // Kickoff was exactly 2 hours ago -> finished
  const twoHoursAgo = new Date(now - TWO_HOURS_MS);
  assert.equal(isGameFinished(twoHoursAgo, now), true);

  // Kickoff was 1 hour ago -> in progress, NOT finished
  const inProgressKickoff = new Date(now - 1 * 60 * 60 * 1000);
  assert.equal(isGameFinished(inProgressKickoff, now), false);

  // Kickoff is in future -> NOT finished
  const futureKickoff = new Date(now + 2 * 60 * 60 * 1000);
  assert.equal(isGameFinished(futureKickoff, now), false);
});

test('PreviousHitService: areAllGamesFinished verifies all matches in group started at least 2 hours ago', () => {
  const now = 1700000000000;

  const allFinished = [
    { kickoffTime: new Date(now - 4 * 60 * 60 * 1000) },
    { kickoffTime: new Date(now - 2.5 * 60 * 60 * 1000) }
  ];
  assert.equal(areAllGamesFinished(allFinished, now), true);

  const oneStillPlaying = [
    { kickoffTime: new Date(now - 4 * 60 * 60 * 1000) },
    { kickoffTime: new Date(now - 1 * 60 * 60 * 1000) } // 1 hour ago
  ];
  assert.equal(areAllGamesFinished(oneStillPlaying, now), false);

  assert.equal(areAllGamesFinished([], now), false);
});

test('PreviousHitService: mapGroupToOverlayGames maps DB games to OverlayGameData', () => {
  const mockGames = [
    {
      homeTeam: 'Arsenal',
      homeTeamLogo: 'https://example.com/arsenal.png',
      awayTeam: 'Chelsea',
      awayTeamLogo: null,
      competition: 'Premier League',
      competitionLogo: null,
      kickoffTime: new Date('2026-11-20T17:30:00Z'),
      selections: [
        { code: '1X', label: 'Home or Draw (1X)', spokenText: 'Arsenal to win or draw' }
      ]
    }
  ];

  const mapped = mapGroupToOverlayGames(mockGames);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].homeTeam, 'Arsenal');
  assert.equal(mapped[0].homeTeamLogo, 'https://example.com/arsenal.png');
  assert.equal(mapped[0].awayTeamLogo, undefined);
  assert.equal(mapped[0].kickoffTime, '2026-11-20T17:30:00.000Z');
  assert.equal(mapped[0].selections?.[0].spokenText, 'Arsenal to win or draw');
});

test('PreviousHitService: returns null when no accepted group exists in DB', async () => {
  const origFindMany = prisma.predictionGroup.findMany;
  try {
    (prisma.predictionGroup as any).findMany = async () => [];

    const result = await getPreviousHitGameGroup();
    assert.equal(result, null);
  } finally {
    (prisma.predictionGroup as any).findMany = origFindMany;
  }
});

test('PreviousHitService: ignores accepted group whose games started less than 2 hours ago', async () => {
  const origFindMany = prisma.predictionGroup.findMany;
  const now = 1700000000000;

  try {
    (prisma.predictionGroup as any).findMany = async () => [
      {
        id: 'group_too_recent',
        status: 'ACCEPTED',
        isHit: true,
        games: [
          {
            homeTeam: 'PSG',
            awayTeam: 'Marseille',
            kickoffTime: new Date(now - 45 * 60 * 1000), // only 45 minutes ago
            selections: [{ code: '1', label: 'PSG Win', spokenText: 'PSG to win' }]
          }
        ]
      }
    ];

    const result = await getPreviousHitGameGroup(now);
    assert.equal(result, null, 'Must not return group if games are less than 2 hours past start time');
  } finally {
    (prisma.predictionGroup as any).findMany = origFindMany;
  }
});

test('PreviousHitService: skips recent group and returns older group where all games are >= 2 hours past start time', async () => {
  const origFindMany = prisma.predictionGroup.findMany;
  const now = 1700000000000;

  try {
    (prisma.predictionGroup as any).findMany = async () => [
      {
        id: 'group_too_recent',
        status: 'ACCEPTED',
        isHit: true,
        games: [
          {
            homeTeam: 'Arsenal',
            awayTeam: 'Chelsea',
            kickoffTime: new Date(now - 1 * 60 * 60 * 1000), // 1 hour ago
            selections: [{ code: '1X', label: '1X', spokenText: 'Arsenal or draw' }]
          }
        ]
      },
      {
        id: 'group_older_finished_and_hit',
        status: 'ACCEPTED',
        isHit: true,
        games: [
          {
            homeTeam: 'Real Madrid',
            awayTeam: 'Barcelona',
            kickoffTime: new Date(now - 5 * 60 * 60 * 1000), // 5 hours ago (finished)
            selections: [{ code: 'BTTS_YES', label: 'BTTS', spokenText: 'Both teams to score' }]
          }
        ]
      }
    ];

    const result = await getPreviousHitGameGroup(now);
    assert.ok(result);
    assert.equal(result?.games[0].homeTeam, 'Real Madrid');
  } finally {
    (prisma.predictionGroup as any).findMany = origFindMany;
  }
});

test('PreviousHitService: returns group immediately if all games finished and was already saved as hit (isHit === true)', async () => {
  const origFindMany = prisma.predictionGroup.findMany;
  let aiCalled = false;
  const now = 1700000000000;

  try {
    (prisma.predictionGroup as any).findMany = async () => [
      {
        id: 'group_already_hit',
        status: 'ACCEPTED',
        isHit: true,
        games: [
          {
            homeTeam: 'Real Madrid',
            awayTeam: 'Barcelona',
            competition: 'La Liga',
            kickoffTime: new Date(now - 4 * 60 * 60 * 1000), // 4 hours ago
            selections: [{ code: 'BTTS_YES', label: 'BTTS', spokenText: 'Both teams to score' }]
          }
        ]
      }
    ];

    setAIServiceInstance({
      providerName: 'mock',
      fetchUpcomingGames: async () => [],
      generatePredictions: async () => [],
      validatePreviousPredictions: async () => {
        aiCalled = true;
        return { isHit: true, notes: 'AI should not be called' };
      }
    });

    const result = await getPreviousHitGameGroup(now);
    assert.ok(result);
    assert.equal(result?.games.length, 1);
    assert.equal(result?.games[0].homeTeam, 'Real Madrid');
    assert.equal(aiCalled, false, 'AI must not be prompted if group was already saved as a hit');
  } finally {
    (prisma.predictionGroup as any).findMany = origFindMany;
    setAIServiceInstance(null);
  }
});

test('PreviousHitService: prompts AI if group finished but not marked as hit, saves response, and uses group if AI says hit', async () => {
  const origFindMany = prisma.predictionGroup.findMany;
  const origUpdate = prisma.predictionGroup.update;
  const now = 1700000000000;

  let savedData: any = null;
  let aiValidated = false;

  try {
    (prisma.predictionGroup as any).findMany = async () => [
      {
        id: 'group_pending_check',
        status: 'ACCEPTED',
        isHit: null,
        games: [
          {
            homeTeam: 'Liverpool',
            awayTeam: 'Man City',
            competition: 'Premier League',
            kickoffTime: new Date(now - 3 * 60 * 60 * 1000), // 3 hours ago
            selections: [{ code: 'OVER_25', label: 'Over 2.5 Goals', spokenText: 'Over 2.5 goals' }]
          }
        ]
      }
    ];

    (prisma.predictionGroup as any).update = async (args: any) => {
      savedData = args.data;
      return args;
    };

    setAIServiceInstance({
      providerName: 'mock',
      fetchUpcomingGames: async () => [],
      generatePredictions: async () => [],
      validatePreviousPredictions: async () => {
        aiValidated = true;
        return { isHit: true, notes: 'Liverpool 2-1 Man City, Over 2.5 hit!' };
      }
    });

    const result = await getPreviousHitGameGroup(now);

    assert.equal(aiValidated, true, 'AI should be prompted to verify if it was a hit');
    assert.ok(savedData, 'AI response should be saved in DB for future use');
    assert.equal(savedData.isHit, true);
    assert.equal(savedData.validationNotes, 'Liverpool 2-1 Man City, Over 2.5 hit!');
    assert.ok(savedData.validationCheckedAt instanceof Date);

    assert.ok(result, 'Must use game group because AI confirmed it was a hit');
    assert.equal(result?.games[0].homeTeam, 'Liverpool');
  } finally {
    (prisma.predictionGroup as any).findMany = origFindMany;
    (prisma.predictionGroup as any).update = origUpdate;
    setAIServiceInstance(null);
  }
});

test('PreviousHitService: prompts AI, saves response, and returns null if AI says it was NOT a hit', async () => {
  const origFindMany = prisma.predictionGroup.findMany;
  const origUpdate = prisma.predictionGroup.update;
  const now = 1700000000000;

  let savedData: any = null;

  try {
    (prisma.predictionGroup as any).findMany = async () => [
      {
        id: 'group_failed_ai_check',
        status: 'ACCEPTED',
        isHit: null,
        games: [
          {
            homeTeam: 'Juventus',
            awayTeam: 'Milan',
            competition: 'Serie A',
            kickoffTime: new Date(now - 3 * 60 * 60 * 1000), // 3 hours ago
            selections: [{ code: '1', label: 'Juventus Win', spokenText: 'Juventus to win' }]
          }
        ]
      }
    ];

    (prisma.predictionGroup as any).update = async (args: any) => {
      savedData = args.data;
      return args;
    };

    setAIServiceInstance({
      providerName: 'mock',
      fetchUpcomingGames: async () => [],
      generatePredictions: async () => [],
      validatePreviousPredictions: async () => {
        return { isHit: false, notes: 'Game ended 0-1, Juventus did not win.' };
      }
    });

    const result = await getPreviousHitGameGroup(now);

    assert.ok(savedData, 'AI response should be saved in DB');
    assert.equal(savedData.isHit, false);
    assert.equal(result, null, 'Must NOT use game group if AI said it was not a hit');
  } finally {
    (prisma.predictionGroup as any).findMany = origFindMany;
    (prisma.predictionGroup as any).update = origUpdate;
    setAIServiceInstance(null);
  }
});
