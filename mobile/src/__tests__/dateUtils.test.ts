import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getUserTimezone,
  getTomorrowDateString,
  isAllowedFutureDate,
  formatOrdinalDate,
  getSelectableFutureDates,
  formatDateToISO,
  formatNavDisplayDate,
  getNextDayString,
  getPreviousDayString,
  canGoBackDate,
  formatCreationDateTime
} from '../utils/dateUtils';

test('Mobile Regression: getUserTimezone returns non-empty string', () => {
  const tz = getUserTimezone();
  assert.ok(typeof tz === 'string');
  assert.ok(tz.length > 0);
});

test('Mobile Regression: getTomorrowDateString returns date in YYYY-MM-DD', () => {
  const tomorrow = getTomorrowDateString();
  assert.match(tomorrow, /^\d{4}-\d{2}-\d{2}$/);
});

test('Mobile Regression: isAllowedFutureDate strictly rejects past & today', () => {
  const today = formatDateToISO(new Date());
  assert.equal(isAllowedFutureDate(today), false, 'Today should be rejected');

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  assert.equal(isAllowedFutureDate(formatDateToISO(yesterday)), false, 'Yesterday should be rejected');

  const tomorrow = getTomorrowDateString();
  assert.equal(isAllowedFutureDate(tomorrow), true, 'Tomorrow should be allowed');

  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  assert.equal(isAllowedFutureDate(formatDateToISO(nextWeek)), true, 'Future date should be allowed');
});

test('Mobile Regression: formatOrdinalDate formats day ordinals correctly', () => {
  // E.g. 1st, 2nd, 3rd, 4th, 21st, 22nd, 23rd
  const formatted1 = formatOrdinalDate('2026-11-01');
  assert.ok(formatted1.includes('1st'));

  const formatted2 = formatOrdinalDate('2026-11-02');
  assert.ok(formatted2.includes('2nd'));

  const formatted3 = formatOrdinalDate('2026-11-03');
  assert.ok(formatted3.includes('3rd'));

  const formatted4 = formatOrdinalDate('2026-11-19');
  assert.ok(formatted4.includes('19th'));
});

test('Mobile Regression: getSelectableFutureDates starts strictly tomorrow', () => {
  const dates = getSelectableFutureDates(5);
  assert.equal(dates.length, 5);
  assert.equal(dates[0].dateStr, getTomorrowDateString());
  assert.ok(dates[0].label.includes('Tomorrow'));

  for (const item of dates) {
    assert.equal(isAllowedFutureDate(item.dateStr), true);
  }
});

test('Mobile Regression: Date Navigation helpers', () => {
  const tomorrow = getTomorrowDateString();
  assert.equal(canGoBackDate(tomorrow), false, 'Cannot go back from tomorrow');
  assert.equal(formatNavDisplayDate(tomorrow), 'Tomorrow');

  const dayAfter = getNextDayString(tomorrow);
  assert.equal(canGoBackDate(dayAfter), true, 'Can go back from day after tomorrow');
  assert.equal(getPreviousDayString(dayAfter), tomorrow);

  const display = formatNavDisplayDate(dayAfter);
  assert.notEqual(display, 'Tomorrow');
  assert.match(display, /^[A-Z][a-z]{2}\s[A-Z][a-z]{2}\s\d+$/);
});

test('Mobile Regression: formatCreationDateTime formats date and time cleanly', () => {
  const result = formatCreationDateTime('2026-11-20T14:30:00Z');
  assert.ok(typeof result === 'string');
  assert.ok(result.includes('•'));
  assert.ok(result.includes('2026'));
});
