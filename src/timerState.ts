// Pure storage + types for the focus timer and reminders — no DOM
// access, no side effects on import. Shared between overlay.ts (which
// owns the live UI) and the main window (which needs to reset this
// state when the app is closed, without pulling in overlay.ts's
// window-specific startup code).

export type PomodoroState = {
  mode: 'idle' | 'work' | 'break';
  endsAt: number | null; // when the current running phase ends
  pausedRemainingMs: number | null; // remaining ms, if paused mid-phase
  workMin: number;
  breakMin: number;
};
const POMODORO_KEY = 'overlay-pomodoro-state';

export function loadPomodoro(): PomodoroState {
  const raw = localStorage.getItem(POMODORO_KEY);
  if (raw) {
    try {
      return { mode: 'idle', endsAt: null, pausedRemainingMs: null, workMin: 25, breakMin: 5, ...JSON.parse(raw) };
    } catch {
      /* fall through */
    }
  }
  return { mode: 'idle', endsAt: null, pausedRemainingMs: null, workMin: 25, breakMin: 5 };
}
export function savePomodoro(s: PomodoroState) {
  localStorage.setItem(POMODORO_KEY, JSON.stringify(s));
}

export type Reminder = { id: string; label: string; intervalMin: number; lastFiredAt: number };
const REMINDERS_KEY = 'overlay-reminders';

export function loadReminders(): Reminder[] {
  const raw = localStorage.getItem(REMINDERS_KEY);
  return raw ? JSON.parse(raw) : [];
}
export function saveReminders(list: Reminder[]) {
  localStorage.setItem(REMINDERS_KEY, JSON.stringify(list));
}

// Called when the app is actually closing. A running pomodoro or a
// reminder's elapsed interval is wall-clock based, so if it just kept
// ticking in storage while the app was shut, reopening later would
// either silently "complete" a session nobody was at the computer for,
// or fire a pile of overdue reminders all at once. Resetting on close
// means every session starts clean instead of inheriting time that
// passed while the app wasn't even running.
export function resetTimersOnAppClose() {
  const pomodoro = loadPomodoro();
  if (pomodoro.mode !== 'idle') {
    savePomodoro({ ...pomodoro, mode: 'idle', endsAt: null, pausedRemainingMs: null });
  }

  const reminders = loadReminders();
  if (reminders.length > 0) {
    const now = Date.now();
    saveReminders(reminders.map((r) => ({ ...r, lastFiredAt: now })));
  }
}
