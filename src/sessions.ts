import type { Session } from './types';
import { loadSessions, saveSessions } from './storage';

export let sessions: Session[] = loadSessions();

export function setSessions(next: Session[]) {
  sessions = next;
}

export function totalPlaytimeFor(appId: string): number {
  return sessions
    .filter((s) => s.appId === appId && s.endedAt)
    .reduce((sum, s) => sum + Math.round(((s.endedAt as number) - s.startedAt) / 1000), 0);
}

export function totalPlaytimeAll(): number {
  return sessions
    .filter((s) => s.endedAt)
    .reduce((sum, s) => sum + Math.round(((s.endedAt as number) - s.startedAt) / 1000), 0);
}

export function hasActiveSession(appId: string): boolean {
  return sessions.some((s) => s.appId === appId && !s.endedAt);
}

export function hasActiveSessionForPid(pid: number): boolean {
  return sessions.some((s) => s.pid === pid && !s.endedAt);
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
    session.endedAt = Date.now();
    saveSessions(sessions);
  }
}

export function removeSessionsForApp(appId: string) {
  setSessions(sessions.filter((s) => s.appId !== appId));
  saveSessions(sessions);
}