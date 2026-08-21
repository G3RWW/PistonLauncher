import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import { loadApps, loadSessions } from '../core/storage';
import { formatPlaytime } from '../core/state';
import type { AppEntry, Session } from '../core/types';
import { type PanelId, type PanelLayouts, loadPanelLayouts, createPanel, renderDock, reflowPanelsToCanvas } from './overlayPanels';
import { matchOverlayToWindow, hideOverlay } from './overlayShortcut';
import { applyActiveTheme } from '../settings/themeApply';
import { currentStreak } from '../core/statsHelpers';
import { getContext, currentSessionElapsedSec, totalPlaytimeTodayForApp, totalPlaytimeForApp, loadDailyGoals } from './stats';
import { buildSpotlightContent } from './panels/spotlight';
import { buildNoteContent } from './panels/note';
import { buildHabitContent, updateHabitContent } from './panels/habit';
import { buildQuickLaunchContent } from './panels/quickLaunchPanel';
import { buildWeeklyTrendContent } from './panels/weeklyTrend';
import { buildDailyGoalContent } from './panels/dailyGoal';
import { buildPomodoroContent, checkPomodoroCompletion, tickPomodoro } from './panels/pomodoro';
import { buildRemindersContent, checkReminderCompletions, tickReminders } from './panels/reminders';
import { buildCourseContent } from './panels/course';

// This file is the overlay's orchestrator: the live render/tick loop,
// mounting and unmounting panels as their layout changes, and matching
// the overlay window to whatever app is currently being tracked. Each
// panel's own content-building logic lives under ./panels/ — this file
// wires them together rather than containing them.

const BREAK_THRESHOLD_SEC = 60 * 60; // 1 hour

let lastRenderedSessionId: string | null = null;
let currentApp: AppEntry | undefined;
let currentSession: Session | undefined;

// ---------------------------------------------------------------------
// Canvas / panel orchestration — mounts/unmounts individual panels as
// their layout's closed-state changes, rather than tearing down the
// whole canvas on every toggle. A full rebuild only happens when the
// tracked app/session itself changes (see render()), since that's the
// one case where every panel's content genuinely needs fresh data.
// ---------------------------------------------------------------------

function panelBuilders(): Record<PanelId, (content: HTMLDivElement) => void> {
  return {
    spotlight: (content) => buildSpotlightContent(content, currentApp!, currentSession!),
    note: (content) => buildNoteContent(content, currentSession!),
    habit: (content) => buildHabitContent(content),
    quickLaunch: (content) => buildQuickLaunchContent(content, currentApp!),
    weeklyTrend: (content) => buildWeeklyTrendContent(content, loadSessions(), currentApp!.id),
    dailyGoal: (content) => buildDailyGoalContent(content, currentApp!.id),
    pomodoro: (content) => buildPomodoroContent(content),
    reminders: (content) => buildRemindersContent(content),
    course: (content) => buildCourseContent(content),
  };
}

const mountedPanels: Partial<Record<PanelId, HTMLDivElement>> = {};

// Loaded once and mutated in place from here on — every function below
// that touches panel positions/sizes reads and writes this SAME object,
// rather than each calling loadPanelLayouts() independently. That
// matters because loadPanelLayouts() parses a fresh object tree on every
// call: if e.g. the resize-driven reflow below clamped a panel's x/y in
// its own freshly-loaded copy, an already-mounted panel's drag handler
// (holding a reference from an earlier, separate load) would never see
// that correction — so grabbing the panel would snap it right back to
// its stale, uncorrected — often off-canvas — position.
let panelLayouts: PanelLayouts = loadPanelLayouts();

function mountPanel(id: PanelId) {
  if (mountedPanels[id]) return; // already mounted — don't rebuild it
  const panel = createPanel(id, panelLayouts, () => unmountPanel(id));
  if (!panel) return;
  panelBuilders()[id](panel.content);
  document.querySelector<HTMLDivElement>('#overlay-canvas')!.appendChild(panel.el);
  mountedPanels[id] = panel.el;
}

function unmountPanel(id: PanelId) {
  mountedPanels[id]?.remove();
  delete mountedPanels[id];
}

// Reconciles which panels are mounted against the saved layout — mounts
// any that should now be open, unmounts any that should now be closed.
// This is what dock clicks call: it only ever touches the ONE panel
// whose state actually changed.
function syncPanelsToLayout() {
  (Object.keys(panelLayouts) as PanelId[]).forEach((id) => {
    const shouldBeOpen = !panelLayouts[id].closed;
    const isMounted = !!mountedPanels[id];
    if (shouldBeOpen && !isMounted) mountPanel(id);
    else if (!shouldBeOpen && isMounted) unmountPanel(id);
  });

  // Newly-mounted panels use saved/default coordinates that may not
  // match the canvas's actual current size — e.g. right after the
  // overlay window resizes to match a freshly-tracked app, or on a
  // panel's very first-ever mount, before that resize has happened yet.
  // Clamp them into view immediately rather than waiting on the next
  // resize event (or a manual drag) to self-correct.
  const canvas = document.querySelector<HTMLDivElement>('#overlay-canvas');
  if (canvas) reflowPanelsToCanvas(canvas, panelLayouts, mountedPanels);
}

// Full teardown + remount of every open panel — used only when the
// tracked app/session changes, since every panel's content depends on
// which app is currently focused.
function rebuildCanvas() {
  const canvas = document.querySelector<HTMLDivElement>('#overlay-canvas')!;
  canvas.innerHTML = '';
  for (const id of Object.keys(mountedPanels) as PanelId[]) delete mountedPanels[id];

  if (!currentApp || !currentSession) {
    const empty = document.createElement('div');
    empty.className = 'overlay-empty';
    empty.textContent = 'Nothing tracked right now.';
    canvas.appendChild(empty);
    return;
  }

  syncPanelsToLayout();
}

export function updateLiveStats() {
  if (!currentApp || !currentSession) return;
  const sessions = loadSessions();
  const now = Date.now();
  const sessionSec = currentSessionElapsedSec(currentSession, now);
  const todaySec = totalPlaytimeTodayForApp(sessions, currentApp.id, now);
  const lifetimeSec = totalPlaytimeForApp(sessions, currentApp.id, now);
  const streak = currentStreak(sessions, currentApp.id);

  const set = (id: string, text: string) => {
    const el = document.querySelector<HTMLElement>(`#${id}`);
    if (el) el.textContent = text;
  };
  set('overlay-stat-session', formatPlaytime(sessionSec));
  set('overlay-stat-today', formatPlaytime(todaySec));
  set('overlay-stat-alltime', formatPlaytime(lifetimeSec));
  set('overlay-stat-streak', streak > 0 ? `${streak}d` : '—');

  const isPaused = !!currentSession.pausedAt;
  document.querySelector('#overlay-paused-badge')?.classList.toggle('hidden', !isPaused);
  const pauseBtn = document.querySelector<HTMLButtonElement>('#overlay-pause-btn');
  if (pauseBtn) pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
  document.querySelector('#overlay-break-reminder')?.classList.toggle('hidden', isPaused || sessionSec <= BREAK_THRESHOLD_SEC);

  const goalFill = document.querySelector<HTMLElement>('#overlay-goal-bar-fill');
  const goalLabel = document.querySelector<HTMLElement>('#overlay-goal-label');
  if (goalFill && goalLabel) {
    const goalMin = loadDailyGoals()[currentApp.id] || 0;
    const pct = goalMin > 0 ? Math.min(100, (todaySec / 60 / goalMin) * 100) : 0;
    goalFill.style.width = `${pct}%`;
    goalLabel.textContent = goalMin > 0 ? `${Math.round(todaySec / 60)} / ${goalMin} min today` : 'Set a daily goal above';
  }

  tickPomodoro();
  tickReminders();
  updateHabitContent();
}

function render() {
  applyActiveTheme({ stripBodyBackground: true });

  // Must run unconditionally — independent of whether an app is being
  // tracked, whether the pomodoro/reminders panels are mounted, or
  // whether this overlay window is even visible right now. Hiding the
  // overlay (vs closing it) keeps this webview's JS alive, so this is
  // exactly where a finished timer needs to still get through to the
  // user via sound + a system notification.
  checkPomodoroCompletion();
  checkReminderCompletions();

  const context = getContext();
  const apps = loadApps();
  const sessions = loadSessions();

  currentApp = context ? apps.find((a) => a.id === context.appId) : undefined;
  currentSession = context ? sessions.find((s) => s.id === context.sessionId) : undefined;

  const sessionId = currentSession?.id ?? null;
  if (sessionId !== lastRenderedSessionId) {
    rebuildCanvas();
    lastRenderedSessionId = sessionId;
  }

  updateLiveStats();
}

render();
setInterval(render, 1000);

// ---------------------------------------------------------------------
// Dock — persistent row of module toggle boxes
// ---------------------------------------------------------------------

function refreshDock() {
  renderDock(panelLayouts, () => {
    syncPanelsToLayout();
    refreshDock();
  });
}
refreshDock();

// ---------------------------------------------------------------------
// Reflow panels whenever the canvas shrinks or grows — most notably
// when the overlay window resizes to match a tracked app window that
// just got minimized, snapped, or resized down.
// ---------------------------------------------------------------------

const overlayCanvasEl = document.querySelector<HTMLDivElement>('#overlay-canvas')!;
let reflowRaf: number | null = null;
const canvasResizeObserver = new ResizeObserver(() => {
  // Coalesce rapid-fire resize events (e.g. during a live window-drag)
  // into a single reflow per frame.
  if (reflowRaf != null) return;
  reflowRaf = requestAnimationFrame(() => {
    reflowRaf = null;
    reflowPanelsToCanvas(overlayCanvasEl, panelLayouts, mountedPanels);
  });
});
canvasResizeObserver.observe(overlayCanvasEl);

// ---------------------------------------------------------------------
// Live window-following — keeps the overlay matched to the tracked
// app's actual on-screen bounds, not just sized/positioned once on open.
// Also auto-hides if the user Alt+Tabs away to a genuinely different
// app — but not when they're interacting with the overlay itself or
// the main launcher window, since both share this same process.
// ---------------------------------------------------------------------

async function followTargetWindow() {
  const context = getContext();
  if (!context?.pid) return;

  try {
    const [foregroundPid, ownPid] = await Promise.all([
      invoke<number | null>('get_foreground_pid'),
      invoke<number>('get_current_pid'),
    ]);
    const switchedAway = foregroundPid != null && foregroundPid !== context.pid && foregroundPid !== ownPid;
    if (switchedAway) {
      await hideOverlay(); // dedicated hide-only — never accidentally shows it
      return;
    }
  } catch (err) {
    console.error('Failed to check overlay focus state:', err);
    // fall through and keep repositioning regardless
  }

  const overlay = await WebviewWindow.getByLabel('overlay');
  if (!overlay) return;
  await matchOverlayToWindow(overlay, context.pid);
}

setInterval(followTargetWindow, 400);