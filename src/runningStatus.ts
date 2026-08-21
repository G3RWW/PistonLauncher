import { apps, setCurrentView } from './core/state';
import { sessions, setSessions } from './core/sessions';
import { loadSessions } from './core/storage';
import { renderView } from './library/render';
import { patchTileContent } from './library/tiles';

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function renderRunningBar() {
  const bar = document.querySelector<HTMLDivElement>('#running-bar')!;
  const activeSessions = sessions.filter((s) => !s.endedAt);

  if (activeSessions.length === 0) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }

  bar.classList.remove('hidden');
  bar.innerHTML = '';

  const now = Date.now();

  for (const session of activeSessions) {
    const app = apps.find((a) => a.id === session.appId);
    if (!app) continue;

    const isPaused = !!session.pausedAt;
    const endPoint = session.pausedAt ?? now;
    const elapsedSec = Math.max(0, Math.round((endPoint - session.startedAt - (session.pausedMs || 0)) / 1000));

    const item = document.createElement('div');
    item.className = 'running-item' + (isPaused ? ' running-item-paused' : '');
    item.addEventListener('click', () => {
      setCurrentView({ type: 'app', id: app.id });
      renderView();
    });

    const dot = document.createElement('span');
    dot.className = 'running-dot';

    const label = document.createElement('span');
    label.className = 'running-label';
    label.textContent = isPaused ? `${app.name} (paused)` : app.name;

    const time = document.createElement('span');
    time.className = 'running-time';
    time.textContent = formatElapsed(elapsedSec);

    item.append(dot, label, time);
    bar.appendChild(item);
  }
}

// The overlay window writes session changes (pause/resume/end) straight
// to storage, but it's a separate JS context — the main window's cached
// `sessions` array here never hears about it on its own. Refresh from
// storage every tick so changes made from the overlay actually show up.
function syncFromStorage() {
  setSessions(loadSessions());

  // Also patch any currently-visible tiles so their running-dot and
  // playtime figures pick up the refreshed data, not just the header bar.
  document.querySelectorAll<HTMLElement>('.tile[data-app-id]').forEach((tile) => {
    const app = apps.find((a) => a.id === tile.dataset.appId);
    if (app) patchTileContent(tile, app);
  });
}

function tick() {
  syncFromStorage();
  renderRunningBar();
}

tick();
setInterval(tick, 1000);