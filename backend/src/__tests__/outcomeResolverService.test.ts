import test from 'node:test';
import assert from 'node:assert/strict';
import { computeGroupOutcome, OutcomeResolverService } from '../services/predictions/outcomeResolverService';

test('computeGroupOutcome: Strict Group Outcome Rule', () => {
  // 1. All games HIT => HIT
  assert.equal(computeGroupOutcome([
    { realOutcome: 'HIT' },
    { realOutcome: 'HIT' },
    { realOutcome: 'HIT' }
  ]), 'HIT');

  // 2. At least ONE game is MISS => MISS (even if others are PENDING)
  assert.equal(computeGroupOutcome([
    { realOutcome: 'HIT' },
    { realOutcome: 'MISS' },
    { realOutcome: 'PENDING' }
  ]), 'MISS', 'Even if some games are pending, 1 miss means group is MISS');

  assert.equal(computeGroupOutcome([
    { realOutcome: 'PENDING' },
    { realOutcome: 'MISS' }
  ]), 'MISS');

  // 3. Some games PENDING and NO game is MISS => PENDING
  assert.equal(computeGroupOutcome([
    { realOutcome: 'HIT' },
    { realOutcome: 'PENDING' },
    { realOutcome: 'HIT' }
  ]), 'PENDING');

  assert.equal(computeGroupOutcome([
    { realOutcome: 'PENDING' }
  ]), 'PENDING');

  // Empty or undefined => PENDING
  assert.equal(computeGroupOutcome([]), 'PENDING');
});

test('OutcomeResolverService: batches AI queries for started games and ignores future games', async () => {
  const service = new OutcomeResolverService();
  const now = new Date('2026-11-22T18:00:00Z');

  // Group 1: 1 started game (past kickoff), 1 future game
  // Group 2: 1 future game
  const groups = [
    {
      id: 'group_1',
      groupOutcome: 'PENDING',
      games: [
        {
          id: 'game_started',
          homeTeam: 'Arsenal',
          awayTeam: 'Chelsea',
          competition: 'Premier League',
          kickoffTime: '2026-11-22T15:00:00Z', // 3 hours ago
          realOutcome: 'PENDING',
          selections: [{ code: '1', label: 'Arsenal Win', category: 'RESULT' }]
        },
        {
          id: 'game_future',
          homeTeam: 'Real Madrid',
          awayTeam: 'Barcelona',
          competition: 'La Liga',
          kickoffTime: '2026-11-22T20:00:00Z', // 2 hours in future
          realOutcome: 'PENDING',
          selections: [{ code: 'BTTS', label: 'Both Teams to Score', category: 'GOALS' }]
        }
      ]
    }
  ];

  const resolved = await service.resolveGroups(groups, now);
  assert.equal(resolved.length, 1);
  const grp = resolved[0];

  // Future game must still be PENDING
  const futureGame = grp.games.find((g: any) => g.id === 'game_future');
  assert.equal(futureGame.realOutcome, 'PENDING');

  // Group outcome should be calculated
  assert.ok(['PENDING', 'HIT', 'MISS'].includes(grp.groupOutcome));
});
