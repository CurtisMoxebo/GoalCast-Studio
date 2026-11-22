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
    { kickoffTime: new Date(now - 1 * 60 * 60 * 1000) }
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
        { code: '1', label: 'Arsenal Win', spokenText: 'Arsenal to win' },
        { code: 'OVER_2.5_GOALS', label: 'Over 2.5 Goals', spokenText: 'Over 2.5 goals' }
      ]
    }
  ];

  const overlayGames = mapGroupToOverlayGames(mockGames);
  assert.equal(overlayGames.length, 1);
  const firstGame = overlayGames[0]!;
  assert.equal(firstGame.homeTeam, 'Arsenal');
  assert.equal(firstGame.awayTeam, 'Chelsea');
  const sels = firstGame.selections || [];
  assert.equal(sels.length, 2);
  assert.equal(sels[0]?.code, '1');
  assert.equal(sels[1]?.label, 'Over 2.5 Goals');
});

test('PreviousHitService: returns group if previous game group has all games as HIT', async () => {
  const origFindMany = prisma.predictionGroup.findMany;
  const now = 1700000000000;

  try {
    (prisma.predictionGroup as any).findMany = async () => [
      {
        id: 'group_all_hit',
        status: 'ACCEPTED',
        groupOutcome: 'HIT',
        games: [
          {
            homeTeam: 'Arsenal',
            awayTeam: 'Chelsea',
            realOutcome: 'HIT',
            kickoffTime: new Date(now - 4 * 60 * 60 * 1000),
            selections: [{ code: '1X', label: '1X', spokenText: 'Arsenal or draw' }]
          },
          {
            homeTeam: 'Real Madrid',
            awayTeam: 'Barcelona',
            realOutcome: 'HIT',
            kickoffTime: new Date(now - 3 * 60 * 60 * 1000),
            selections: [{ code: 'BTTS_YES', label: 'BTTS', spokenText: 'Both teams to score' }]
          }
        ]
      }
    ];

    const result = await getPreviousHitGameGroup(now);
    assert.ok(result);
    assert.equal(result?.games.length, 2);
    assert.equal(result?.games[0].homeTeam, 'Arsenal');
    assert.equal(result?.games[1].homeTeam, 'Real Madrid');
  } finally {
    (prisma.predictionGroup as any).findMany = origFindMany;
  }
});

test('PreviousHitService: returns null if previous game group has a MISS or PENDING game', async () => {
  const origFindMany = prisma.predictionGroup.findMany;
  const now = 1700000000000;

  try {
    (prisma.predictionGroup as any).findMany = async () => [
      {
        id: 'group_with_miss',
        status: 'ACCEPTED',
        groupOutcome: 'MISS',
        games: [
          {
            homeTeam: 'Arsenal',
            awayTeam: 'Chelsea',
            realOutcome: 'HIT',
            kickoffTime: new Date(now - 4 * 60 * 60 * 1000),
            selections: [{ code: '1X', label: '1X', spokenText: 'Arsenal or draw' }]
          },
          {
            homeTeam: 'Real Madrid',
            awayTeam: 'Barcelona',
            realOutcome: 'MISS',
            kickoffTime: new Date(now - 3 * 60 * 60 * 1000),
            selections: [{ code: 'BTTS_YES', label: 'BTTS', spokenText: 'Both teams to score' }]
          }
        ]
      }
    ];

    const result = await getPreviousHitGameGroup(now);
    assert.equal(result, null, 'Group with a MISS must not trigger celebration overlay');
  } finally {
    (prisma.predictionGroup as any).findMany = origFindMany;
  }
});

test('PreviousHitService: returns null if no accepted groups exist', async () => {
  const origFindMany = prisma.predictionGroup.findMany;

  try {
    (prisma.predictionGroup as any).findMany = async () => [];

    const result = await getPreviousHitGameGroup();
    assert.equal(result, null);
  } finally {
    (prisma.predictionGroup as any).findMany = origFindMany;
  }
});
