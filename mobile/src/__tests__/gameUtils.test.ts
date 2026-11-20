import test from 'node:test';
import assert from 'node:assert/strict';
import { UpcomingGame } from '../types';
import { filterGamesBySearchQuery, groupGamesByCompetition } from '../utils/gameUtils';

const mockGames: UpcomingGame[] = [
  {
    id: 'm1',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    competition: 'Premier League',
    competitionLogo: 'https://images.fotmob.com/leaguelogo/47.png',
    kickoffTime: '2026-11-21T15:00:00Z'
  },
  {
    id: 'm2',
    homeTeam: 'Manchester City',
    awayTeam: 'Liverpool',
    competition: 'Premier League',
    competitionLogo: 'https://images.fotmob.com/leaguelogo/47.png',
    kickoffTime: '2026-11-21T17:30:00Z'
  },
  {
    id: 'm3',
    homeTeam: 'Real Madrid',
    awayTeam: 'Barcelona',
    competition: 'La Liga',
    competitionLogo: 'https://images.fotmob.com/leaguelogo/87.png',
    kickoffTime: '2026-11-21T20:00:00Z'
  },
  {
    id: 'm4',
    homeTeam: 'Al-Hilal',
    awayTeam: 'Al-Nassr',
    competition: 'Saudi Pro League',
    competitionLogo: 'https://images.fotmob.com/leaguelogo/206.png',
    kickoffTime: '2026-11-21T18:00:00Z'
  }
];

test('Mobile Regression: groupGamesByCompetition groups games into sections', () => {
  const sections = groupGamesByCompetition(mockGames);

  assert.equal(sections.length, 3, 'Should create 3 competition groups');
  assert.equal(sections[0].title, 'Premier League');
  assert.equal(sections[0].data.length, 2);
  assert.equal(sections[0].logo, 'https://images.fotmob.com/leaguelogo/47.png');

  assert.equal(sections[1].title, 'La Liga');
  assert.equal(sections[1].data.length, 1);

  assert.equal(sections[2].title, 'Saudi Pro League');
  assert.equal(sections[2].data.length, 1);
});

test('Mobile Regression: filterGamesBySearchQuery matches teams and leagues case-insensitively', () => {
  // Team name search
  const arsenalMatches = filterGamesBySearchQuery(mockGames, 'arsenal');
  assert.equal(arsenalMatches.length, 1);
  assert.equal(arsenalMatches[0].homeTeam, 'Arsenal');

  // Partial match
  const madMatches = filterGamesBySearchQuery(mockGames, 'madrid');
  assert.equal(madMatches.length, 1);
  assert.equal(madMatches[0].homeTeam, 'Real Madrid');

  // Competition match
  const saudiMatches = filterGamesBySearchQuery(mockGames, 'saudi');
  assert.equal(saudiMatches.length, 1);
  assert.equal(saudiMatches[0].competition, 'Saudi Pro League');

  // Empty search
  const all = filterGamesBySearchQuery(mockGames, '');
  assert.equal(all.length, mockGames.length);

  // No match
  const empty = filterGamesBySearchQuery(mockGames, 'nonexistent team');
  assert.equal(empty.length, 0);
});
