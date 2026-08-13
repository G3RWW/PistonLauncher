import { apps, setCurrentView } from './state';
import { sessions } from './sessions';
import { renderView } from './render';

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

renderRunningBar();
setInterval(renderRunningBar, 1000);