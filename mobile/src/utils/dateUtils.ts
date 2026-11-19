/**
 * Get device user timezone
 */
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Get tomorrow's date string in YYYY-MM-DD format
 */
export function getTomorrowDateString(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return formatDateToISO(tomorrow);
}

/**
 * Format Date to YYYY-MM-DD
 */
export function formatDateToISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Validate that a date is strictly tomorrow or in the future
 */
export function isAllowedFutureDate(dateStr: string): boolean {
  const tomorrow = getTomorrowDateString();
  return dateStr >= tomorrow;
}

/**
 * Format date for social description and header banners
 * E.g. "Thursday 20th November 2026"
 */
export function formatOrdinalDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDate();
    const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
    const month = d.toLocaleDateString('en-US', { month: 'long' });
    const year = d.getFullYear();

    const ordinal = getDayOrdinal(day);
    return `${weekday} ${day}${ordinal} ${month} ${year}`;
  } catch {
    return dateStr;
  }
}

function getDayOrdinal(day: number): string {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

/**
 * Format kickoff time in user timezone
 */
export function formatKickoffTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '--:--';
  }
}

/**
 * Generate upcoming selectable dates starting from tomorrow up to 7 days ahead
 */
export function getSelectableFutureDates(numDays = 7): { dateStr: string; label: string }[] {
  const dates: { dateStr: string; label: string }[] = [];
  const base = new Date();

  for (let i = 1; i <= numDays; i++) {
    const d = new Date();
    d.setDate(base.getDate() + i);
    const dateStr = formatDateToISO(d);
    const weekday = i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' });
    const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    dates.push({
      dateStr,
      label: `${weekday}, ${monthDay}`
    });
  }

  return dates;
}
