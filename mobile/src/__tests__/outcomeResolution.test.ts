import test from 'node:test';
import assert from 'node:assert/strict';
import { HistoryItem } from '../types';
import { mobileApi } from '../services/api';

/**
 * Mobile Group Outcome Evaluation Helper (mirrors logic in HistoryScreen)
 */
function evaluateGroupOutcome(item: HistoryItem): 'HIT' | 'MISS' | 'PENDING' {
  if (item.groupOutcome === 'HIT' || item.groupOutcome === 'MISS' || item.groupOutcome === 'PENDING') {
    return item.groupOutcome;
  }
  const games = item.games || [];
  // Strict rule: if at least 1 miss, whole group is miss
  if (games.some((g) => g.realOutcome === 'MISS')) return 'MISS';
  // If all games hit and > 0 games, group is hit
  if (games.length > 0 && games.every((g) => g.realOutcome === 'HIT')) return 'HIT';
  return 'PENDING';
}

test('Mobile Outcome: evaluateGroupOutcome strictly enforces 1 miss = group miss', () => {
  const itemWithOneMiss: HistoryItem = {
    id: 'grp_1',
    status: 'ACCEPTED',
    targetDate: '2026-11-22',
    description: 'Test group',
    createdAt: new Date().toISOString(),
    games: [
      {
        homeTeam: 'Arsenal',
        awayTeam: 'Chelsea',
        realOutcome: 'HIT',
        realScore: '2-1',
        selections: [{ code: '1', label: 'Arsenal Win' }]
      },
      {
        homeTeam: 'Real Madrid',
        awayTeam: 'Barcelona',
        realOutcome: 'MISS',
        realScore: '0-2',
        selections: [{ code: '1', label: 'Real Madrid Win' }]
      },
      {
        homeTeam: 'Liverpool',
        awayTeam: 'Man City',
        realOutcome: 'PENDING',
        selections: [{ code: 'BTTS', label: 'Both Teams to Score' }]
      }
    ]
  };

  // Even though 1 game is HIT and 1 game is PENDING, 1 MISS means the whole group is MISS
  assert.equal(evaluateGroupOutcome(itemWithOneMiss), 'MISS');
});

test('Mobile Outcome: evaluateGroupOutcome returns HIT only when all games are HIT', () => {
  const itemAllHit: HistoryItem = {
    id: 'grp_2',
    status: 'ACCEPTED',
    targetDate: '2026-11-22',
    description: 'Winning group',
    createdAt: new Date().toISOString(),
    games: [
      {
        homeTeam: 'Arsenal',
        awayTeam: 'Chelsea',
        realOutcome: 'HIT',
        realScore: '3-1',
        selections: [{ code: '1', label: 'Arsenal Win' }]
      },
      {
        homeTeam: 'Milan',
        awayTeam: 'Inter',
        realOutcome: 'HIT',
        realScore: '2-2',
        selections: [{ code: 'BTTS', label: 'Both Teams to Score' }]
      }
    ]
  };

  assert.equal(evaluateGroupOutcome(itemAllHit), 'HIT');
});

test('Mobile Outcome: evaluateGroupOutcome returns PENDING when games pending and zero misses', () => {
  const itemPending: HistoryItem = {
    id: 'grp_3',
    status: 'ACCEPTED',
    targetDate: '2026-11-22',
    description: 'Pending group',
    createdAt: new Date().toISOString(),
    games: [
      {
        homeTeam: 'Arsenal',
        awayTeam: 'Chelsea',
        realOutcome: 'HIT',
        realScore: '1-0',
        selections: [{ code: '1', label: 'Arsenal Win' }]
      },
      {
        homeTeam: 'Juventus',
        awayTeam: 'Roma',
        realOutcome: 'PENDING',
        selections: [{ code: '1X', label: 'Juventus or Draw' }]
      }
    ]
  };

  assert.equal(evaluateGroupOutcome(itemPending), 'PENDING');
});

test('Mobile Outcome: MobileApiService builds recap image URL correctly', () => {
  const viewUrl = mobileApi.getRecapImageUrl('group_123');
  assert.ok(viewUrl.includes('/api/predictions/recap-image/group_123'));
  assert.ok(!viewUrl.includes('download=1'));

  const downloadUrl = mobileApi.getRecapImageUrl('group_123', true);
  assert.ok(downloadUrl.includes('/api/predictions/recap-image/group_123?download=1'));
});
