import { apps, setCurrentView } from './state';
import { sessions } from './sessions';
import { renderView } from './render';

function formatElapsed(startedAt: number): string {
  const totalSec = Math.floor((Date.now() - startedAt) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
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

  for (const session of activeSessions) {
    const app = apps.find((a) => a.id === session.appId);
    if (!app) continue;

    const item = document.createElement('div');
    item.className = 'running-item';
    item.addEventListener('click', () => {
      setCurrentView({ type: 'app', id: app.id });
      renderView();
    });

    const dot = document.createElement('span');
    dot.className = 'running-dot';

    const label = document.createElement('span');
    label.className = 'running-label';
    label.textContent = app.name;

    const time = document.createElement('span');
    time.className = 'running-time';
    time.textContent = formatElapsed(session.startedAt);

    item.append(dot, label, time);
    bar.appendChild(item);
  }
}

renderRunningBar();
setInterval(renderRunningBar, 1000);
