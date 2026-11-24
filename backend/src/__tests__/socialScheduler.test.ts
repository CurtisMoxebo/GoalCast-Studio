import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SocialSchedulerService } from '../services/social/socialSchedulerService';

test('SocialSchedulerService: getMsUntilNext15MinQuarter aligns with wall clock (:00, :15, :30, :45)', () => {
  const scheduler = new SocialSchedulerService();

  // Test 1: Exactly at 10:00:00.000 -> next is 10:15:00 (15 minutes = 900,000ms)
  const d00 = new Date(2026, 10, 24, 10, 0, 0, 0);
  const ms00 = scheduler.getMsUntilNext15MinQuarter(d00);
  assert.equal(ms00, 15 * 60 * 1000, 'At :00, delay must be exactly 15 minutes');

  // Test 2: At 10:05:00.000 -> next is 10:15:00 (10 minutes = 600,000ms)
  const d05 = new Date(2026, 10, 24, 10, 5, 0, 0);
  const ms05 = scheduler.getMsUntilNext15MinQuarter(d05);
  assert.equal(ms05, 10 * 60 * 1000, 'At :05, delay must be exactly 10 minutes');

  // Test 3: At 10:14:30.500 -> next is 10:15:00 (29.5 seconds = 29,500ms)
  const d14 = new Date(2026, 10, 24, 10, 14, 30, 500);
  const ms14 = scheduler.getMsUntilNext15MinQuarter(d14);
  assert.equal(ms14, 29500, 'At :14:30.500, delay must be exactly 29,500ms');

  // Test 4: Exactly at 10:15:00.000 -> next is 10:30:00 (15 minutes = 900,000ms)
  const d15 = new Date(2026, 10, 24, 10, 15, 0, 0);
  const ms15 = scheduler.getMsUntilNext15MinQuarter(d15);
  assert.equal(ms15, 15 * 60 * 1000, 'At :15, delay must be exactly 15 minutes');

  // Test 5: At 10:29:00.000 -> next is 10:30:00 (1 minute = 60,000ms)
  const d29 = new Date(2026, 10, 24, 10, 29, 0, 0);
  const ms29 = scheduler.getMsUntilNext15MinQuarter(d29);
  assert.equal(ms29, 60 * 1000, 'At :29, delay must be exactly 1 minute');

  // Test 6: At 10:45:00.000 -> next is 11:00:00 (15 minutes = 900,000ms)
  const d45 = new Date(2026, 10, 24, 10, 45, 0, 0);
  const ms45 = scheduler.getMsUntilNext15MinQuarter(d45);
  assert.equal(ms45, 15 * 60 * 1000, 'At :45, delay must be exactly 15 minutes');

  // Test 7: At 10:59:59.000 -> next is 11:00:00 (1 second = 1,000ms)
  const d59 = new Date(2026, 10, 24, 10, 59, 59, 0);
  const ms59 = scheduler.getMsUntilNext15MinQuarter(d59);
  assert.equal(ms59, 1000, 'At :59:59, delay must be exactly 1,000ms');
});

test('SocialSchedulerService: start and stop control timer lifecycle cleanly', () => {
  const scheduler = new SocialSchedulerService();
  scheduler.start();
  // Starting again is idempotent
  scheduler.start();
  scheduler.stop();
  // Stopping again is idempotent
  scheduler.stop();
});
