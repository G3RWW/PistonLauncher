import type { Session } from './types';
import { loadSessions, saveSessions } from './storage';

export let sessions: Session[] = loadSessions();

export function setSessions(next: Session[]) {
  sessions = next;
}

// A session's real counted duration up to a given point in time, with any
// paused time subtracted out. `endPoint` should be endedAt for finished
// sessions, or Date.now() for ones still in progress.
export function effectiveDurationSec(session: Session, endPoint: number): number {
  const pausedMs = session.pausedMs || 0;
  return Math.max(0, Math.round((endPoint - session.startedAt - pausedMs) / 1000));
}

export function totalPlaytimeFor(appId: string): number {
  return sessions
    .filter((s) => s.appId === appId && s.endedAt)
    .reduce((sum, s) => sum + effectiveDurationSec(s, s.endedAt as number), 0);
}

export function totalPlaytimeAll(): number {
  return sessions.filter((s) => s.endedAt).reduce((sum, s) => sum + effectiveDurationSec(s, s.endedAt as number), 0);
}

export function hasActiveSession(appId: string): boolean {
  return sessions.some((s) => s.appId === appId && !s.endedAt);
}

export function hasActiveSessionForPid(pid: number): boolean {
  return sessions.some((s) => s.pid === pid && !s.endedAt);
}

export function getActiveSessionForPid(pid: number): Session | undefined {
  return sessions.find((s) => s.pid === pid && !s.endedAt);
}

export function startSession(appId: string, pid?: number): Session {
  const session: Session = { id: crypto.randomUUID(), appId, startedAt: Date.now(), pid };
  sessions.push(session);
  saveSessions(sessions);
  return session;
}

export function endSession(sessionId: string) {
  const session = sessions.find((s) => s.id === sessionId);
  if (session && !session.endedAt) {
    // Fold any still-open pause into pausedMs before closing out, so a
    // session that was paused right up until it ended is counted correctly.
    if (session.pausedAt) {
      session.pausedMs = (session.pausedMs || 0) + (Date.now() - session.pausedAt);
      session.pausedAt = undefined;
    }
    session.endedAt = Date.now();
    saveSessions(sessions);
  }
}

export function pauseSession(sessionId: string) {
  const session = sessions.find((s) => s.id === sessionId);
  if (session && !session.endedAt && !session.pausedAt) {
    session.pausedAt = Date.now();
    saveSessions(sessions);
  }
}

export function resumeSession(sessionId: string) {
  const session = sessions.find((s) => s.id === sessionId);
  if (session && session.pausedAt) {
    session.pausedMs = (session.pausedMs || 0) + (Date.now() - session.pausedAt);
    session.pausedAt = undefined;
    saveSessions(sessions);
  }
}

export function removeSessionsForApp(appId: string) {
  setSessions(sessions.filter((s) => s.appId !== appId));
  saveSessions(sessions);
}