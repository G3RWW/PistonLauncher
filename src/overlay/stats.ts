import type { Session } from '../core/types';

// Pure, stateless calculations shared by several overlay panels — no
// DOM access here, so any panel (or the orchestrator's live-tick loop)
// can import from this without pulling in unrelated panel code.

const CONTEXT_KEY = 'launcher-overlay-context';
const DAILY_GOAL_KEY = 'launcher-daily-goals'; // Record<appId, minutes>

export function getContext(): { appId: string; sessionId: string; pid?: number } | null {
  const raw = localStorage.getItem(CONTEXT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function effectiveDurationSec(session: Session, endPoint: number): number {
  const pausedMs = session.pausedMs || 0;
  return Math.max(0, Math.round((endPoint - session.startedAt - pausedMs) / 1000));
}

export function currentSessionElapsedSec(session: Session, now: number): number {
  return effectiveDurationSec(session, session.endedAt ?? session.pausedAt ?? now);
}

export function totalPlaytimeForApp(sessions: Session[], appId: string, now: number): number {
  return sessions.filter((s) => s.appId === appId).reduce((sum, s) => sum + effectiveDurationSec(s, s.endedAt ?? s.pausedAt ?? now), 0);
}

export function totalPlaytimeTodayForApp(sessions: Session[], appId: string, now: number): number {
  return sessions
    .filter((s) => s.appId === appId && isSameDay(s.startedAt, now))
    .reduce((sum, s) => sum + effectiveDurationSec(s, s.endedAt ?? s.pausedAt ?? now), 0);
}

// Total counted seconds for one specific calendar day window — used by
// the weekly trend sparkline. Paused time is subtracted approximately
// (using the session's total pausedMs, not distributed per-day), which
// is a reasonable simplification for a glance-level trend chart.
export function totalPlaytimeForDayWindow(sessions: Session[], appId: string, dayStart: number, dayEnd: number): number {
  const now = Date.now();
  return sessions
    .filter((s) => s.appId === appId && s.startedAt < dayEnd && (s.endedAt ?? now) > dayStart)
    .reduce((sum, s) => {
      const start = Math.max(s.startedAt, dayStart);
      const end = Math.min(s.endedAt ?? now, dayEnd);
      const raw = end - start;
      const pausedMs = Math.min(s.pausedMs || 0, raw);
      return sum + Math.max(0, Math.round((raw - pausedMs) / 1000));
    }, 0);
}

export function loadDailyGoals(): Record<string, number> {
  const raw = localStorage.getItem(DAILY_GOAL_KEY);
  return raw ? JSON.parse(raw) : {};
}
export function saveDailyGoals(goals: Record<string, number>) {
  localStorage.setItem(DAILY_GOAL_KEY, JSON.stringify(goals));
}

export type WeeklyTrendSettings = { weekStart: 'sunday' | 'monday'; metric: 'time' | 'sessions' };
const WEEKLY_TREND_SETTINGS_KEY = 'overlay-weekly-trend-settings';

export function loadWeeklyTrendSettings(): WeeklyTrendSettings {
  const raw = localStorage.getItem(WEEKLY_TREND_SETTINGS_KEY);
  if (raw) {
    try {
      return { weekStart: 'monday', metric: 'time', ...JSON.parse(raw) };
    } catch {
      /* fall through */
    }
  }
  return { weekStart: 'monday', metric: 'time' };
}
export function saveWeeklyTrendSettings(s: WeeklyTrendSettings) {
  localStorage.setItem(WEEKLY_TREND_SETTINGS_KEY, JSON.stringify(s));
}

export function sessionCountForDayWindow(sessions: Session[], appId: string, dayStart: number, dayEnd: number): number {
  return sessions.filter((s) => s.appId === appId && s.startedAt >= dayStart && s.startedAt < dayEnd).length;
}

export function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
