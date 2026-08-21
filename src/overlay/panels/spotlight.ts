import type { AppEntry, Session } from '../../core/types';
import { initials } from '../../core/state';
import { toggleOverlay } from '../overlayShortcut';
import { focusMain, togglePause, endSessionNow } from '../actions';

export function buildSpotlightContent(content: HTMLDivElement, app: AppEntry, session: Session) {
  content.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'overlay-spotlight-header';

  const iconEl = document.createElement('div');
  iconEl.className = 'overlay-spotlight-icon';
  if (app.icon) {
    const img = document.createElement('img');
    img.src = `data:image/png;base64,${app.icon}`;
    iconEl.appendChild(img);
  } else {
    iconEl.textContent = initials(app.name);
  }

  const nameCol = document.createElement('div');
  const nameEl = document.createElement('div');
  nameEl.className = 'overlay-spotlight-name';
  nameEl.textContent = app.name;
  const pausedBadge = document.createElement('div');
  pausedBadge.id = 'overlay-paused-badge';
  pausedBadge.className = 'overlay-paused-badge hidden';
  pausedBadge.textContent = '⏸ Paused';
  nameCol.append(nameEl, pausedBadge);

  header.append(iconEl, nameCol);

  const stats = document.createElement('div');
  stats.className = 'overlay-stats';
  const statDefs: [string, string][] = [
    ['overlay-stat-session', 'This session'],
    ['overlay-stat-today', 'Today'],
    ['overlay-stat-alltime', 'All time'],
    ['overlay-stat-streak', 'Streak'],
  ];
  for (const [id, label] of statDefs) {
    const stat = document.createElement('div');
    stat.className = 'overlay-stat';
    const v = document.createElement('div');
    v.className = 'overlay-stat-value';
    v.id = id;
    const l = document.createElement('div');
    l.className = 'overlay-stat-label';
    l.textContent = label;
    stat.append(v, l);
    stats.appendChild(stat);
  }

  const breakEl = document.createElement('div');
  breakEl.id = 'overlay-break-reminder';
  breakEl.className = 'overlay-break-reminder hidden';
  breakEl.textContent = "You've been at this a while — maybe pause for a short break.";

  const actions = document.createElement('div');
  actions.className = 'overlay-actions';

  const viewBtn = document.createElement('button');
  viewBtn.className = 'overlay-action-btn';
  viewBtn.textContent = 'View in Launcher';
  viewBtn.addEventListener('click', focusMain);

  const pauseBtn = document.createElement('button');
  pauseBtn.id = 'overlay-pause-btn';
  pauseBtn.className = 'overlay-action-btn';
  pauseBtn.textContent = 'Pause';
  pauseBtn.addEventListener('click', () => togglePause(session.id));

  const endBtn = document.createElement('button');
  endBtn.className = 'overlay-action-btn overlay-action-danger';
  endBtn.textContent = 'End Session';
  endBtn.addEventListener('click', async () => {
    endSessionNow(session.id);
    await toggleOverlay(true);
  });

  actions.append(viewBtn, pauseBtn, endBtn);

  content.append(header, stats, breakEl, actions);
}
