import type { AppEntry, Session, Course, CourseProgress } from './types';

const APPS_KEY = 'launcher-apps';
const CATEGORIES_KEY = 'launcher-categories';
const SESSIONS_KEY = 'launcher-sessions';
const HABIT_APP_KEY = 'launcher-habit-app';
const COURSES_KEY = 'launcher-courses';
const COURSE_PROGRESS_KEY = 'launcher-course-progress'; // Record<courseId, CourseProgress>
const ACTIVE_COURSE_KEY = 'launcher-active-course'; // which course the overlay's Course panel shows
const COURSES_FOLDER_KEY = 'launcher-courses-folder'; // base folder offered when loading a course

export function loadCourses(): Course[] {
  const raw = localStorage.getItem(COURSES_KEY);
  return raw ? JSON.parse(raw) : [];
}
export function saveCourses(data: Course[]) {
  localStorage.setItem(COURSES_KEY, JSON.stringify(data));
}

export function loadAllCourseProgress(): Record<string, CourseProgress> {
  const raw = localStorage.getItem(COURSE_PROGRESS_KEY);
  return raw ? JSON.parse(raw) : {};
}
export function saveAllCourseProgress(data: Record<string, CourseProgress>) {
  localStorage.setItem(COURSE_PROGRESS_KEY, JSON.stringify(data));
}

export function loadActiveCourseId(): string | null {
  return localStorage.getItem(ACTIVE_COURSE_KEY);
}
export function saveActiveCourseId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_COURSE_KEY, id);
  else localStorage.removeItem(ACTIVE_COURSE_KEY);
}

export function loadCoursesFolder(): string | null {
  return localStorage.getItem(COURSES_FOLDER_KEY);
}
export function saveCoursesFolder(path: string | null) {
  if (path) localStorage.setItem(COURSES_FOLDER_KEY, path);
  else localStorage.removeItem(COURSES_FOLDER_KEY);
}

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