import type { Session } from './types';
import { effectiveDurationSec } from './sessions';

export type PeriodGrouping = 'week' | 'month' | 'year';

export type SessionGroup = {
  key: string;
  label: string;
  sortKey: number;
  sessions: Session[];
  totalSec: number;
};

function startOfWeek(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // Monday = 0
  const res = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  res.setDate(res.getDate() - day);
  return res;
}

// Buckets a list of sessions into week/month/year groups, newest first.
// Each session is bucketed by its start time; still-open sessions count
// their elapsed time up to now.
export function groupSessionsByPeriod(sessionList: Session[], grouping: PeriodGrouping): SessionGroup[] {
  const now = Date.now();
  const buckets = new Map<string, SessionGroup>();

  for (const s of sessionList) {
    const d = new Date(s.startedAt);
    let key: string;
    let label: string;
    let sortKey: number;

    if (grouping === 'week') {
      const start = startOfWeek(d);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      key = start.toISOString().slice(0, 10);
      const sameYear = start.getFullYear() === end.getFullYear();
      label = sameYear
        ? `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
        : `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
      sortKey = start.getTime();
    } else if (grouping === 'month') {
      key = `${d.getFullYear()}-${d.getMonth()}`;
      label = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      sortKey = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    } else {
      key = `${d.getFullYear()}`;
      label = `${d.getFullYear()}`;
      sortKey = new Date(d.getFullYear(), 0, 1).getTime();
    }

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, label, sortKey, sessions: [], totalSec: 0 };
      buckets.set(key, bucket);
    }
    bucket.sessions.push(s);
    bucket.totalSec += effectiveDurationSec(s, s.endedAt ?? now);
  }

  return Array.from(buckets.values()).sort((a, b) => b.sortKey - a.sortKey);
}

// A fixed, theme-agnostic categorical palette for charts — the app's
// themes only define a single accent color, so chart slices need their
// own distinguishable set that still reads fine on any of the dark
// theme backgrounds.
export const CHART_COLORS = [
  '#c9974a', '#5a8fd6', '#6fb98f', '#d1738a', '#9b7ede',
  '#d1a35a', '#5ac2c2', '#c96a4a', '#7a9bd1', '#a3c95a',
  '#e0a8d1', '#7ac9a3',
];

export function colorForIndex(i: number): string {
  return CHART_COLORS[i % CHART_COLORS.length];
}

// ---------------------------------------------------------------------
// Streaks — used by the Habit feature. Pure functions over whatever
// session list the caller has on hand, so both the main window (which
// keeps a live `sessions` singleton) and the overlay window (which
// re-reads from storage on its own poll loop) can share one
// implementation instead of drifting apart.
// ---------------------------------------------------------------------

function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Consecutive days (ending today or yesterday) the app was launched at
// least once. Breaks the moment a day is skipped.
export function currentStreak(sessionList: Session[], appId: string): number {
  const days = new Set(sessionList.filter((s) => s.appId === appId).map((s) => dayKey(s.startedAt)));

  let streak = 0;
  const cursor = new Date();
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Set of distinct calendar days (normalized to local midnight, as epoch
// ms) the app was launched at least once. Shared by longestStreak and by
// the habit page's week-strip/heatmap so "was this day active" is
// computed identically everywhere.
export function activeDaySet(sessionList: Session[], appId: string): Set<number> {
  return new Set(
    sessionList
      .filter((s) => s.appId === appId)
      .map((s) => {
        const d = new Date(s.startedAt);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      })
  );
}

// Longest run of consecutive launch-days ever recorded for the app.
export function longestStreak(sessionList: Session[], appId: string): number {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const days = Array.from(activeDaySet(sessionList, appId)).sort((a, b) => a - b);

  let longest = 0;
  let current = 0;
  let prev: number | null = null;
  for (const day of days) {
    current = prev !== null && day - prev === DAY_MS ? current + 1 : 1;
    longest = Math.max(longest, current);
    prev = day;
  }
  return longest;
}

export function launchedToday(sessionList: Session[], appId: string): boolean {
  const today = dayKey(Date.now());
  return sessionList.some((s) => s.appId === appId && dayKey(s.startedAt) === today);
}