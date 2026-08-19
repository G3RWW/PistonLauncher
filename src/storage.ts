import type { AppEntry, Session } from './types';

const APPS_KEY = 'launcher-apps';
const CATEGORIES_KEY = 'launcher-categories';
const SESSIONS_KEY = 'launcher-sessions';
const HABIT_APP_KEY = 'launcher-habit-app';

export function loadApps(): AppEntry[] {
  const raw = localStorage.getItem(APPS_KEY);
  return raw ? JSON.parse(raw) : [];
}
export function saveApps(data: AppEntry[]) {
  localStorage.setItem(APPS_KEY, JSON.stringify(data));
}

export function loadCategories(): string[] {
  const raw = localStorage.getItem(CATEGORIES_KEY);
  return raw ? JSON.parse(raw) : ['Uncategorized'];
}
export function saveCategories(data: string[]) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(data));
}

export function loadSessions(): Session[] {
  const raw = localStorage.getItem(SESSIONS_KEY);
  return raw ? JSON.parse(raw) : [];
}
export function saveSessions(data: Session[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(data));
}

export function loadHabitAppId(): string | null {
  return localStorage.getItem(HABIT_APP_KEY);
}
export function saveHabitAppId(id: string | null) {
  if (id) localStorage.setItem(HABIT_APP_KEY, id);
  else localStorage.removeItem(HABIT_APP_KEY);
}