import type { Session } from '../../core/types';
import { formatPlaytime } from '../../core/state';
import { totalPlaytimeForDayWindow, sessionCountForDayWindow, loadWeeklyTrendSettings, saveWeeklyTrendSettings } from '../stats';

export function buildWeeklyTrendContent(content: HTMLDivElement, sessions: Session[], appId: string) {
  content.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'overlay-panel-settings-header';
  const gearBtn = document.createElement('button');
  gearBtn.className = 'overlay-gear-btn';
  gearBtn.textContent = '⚙';
  gearBtn.title = 'Settings';
  header.appendChild(gearBtn);

  const settingsRow = document.createElement('div');
  settingsRow.className = 'overlay-panel-settings-row hidden';

  const weekStartSelect = document.createElement('select');
  weekStartSelect.className = 'overlay-settings-select';
  weekStartSelect.innerHTML = `<option value="monday">Week starts Mon</option><option value="sunday">Week starts Sun</option>`;

  const metricSelect = document.createElement('select');
  metricSelect.className = 'overlay-settings-select';
  metricSelect.innerHTML = `<option value="time">Show: Time</option><option value="sessions">Show: Sessions</option>`;

  settingsRow.append(weekStartSelect, metricSelect);
  gearBtn.addEventListener('click', () => settingsRow.classList.toggle('hidden'));

  const bars = document.createElement('div');
  bars.className = 'overlay-sparkline';

  function renderBars() {
    const settings = loadWeeklyTrendSettings();
    weekStartSelect.value = settings.weekStart;
    metricSelect.value = settings.metric;

    // Anchor to the current calendar week's start (not a rolling 7-day
    // window), per the chosen start day. Days later than today just
    // show as empty/zero, since they haven't happened yet.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dow = today.getDay(); // 0=Sun..6=Sat
    const offset = settings.weekStart === 'monday' ? (dow === 0 ? 6 : dow - 1) : dow;
    const weekStartDate = new Date(today);
    weekStartDate.setDate(weekStartDate.getDate() - offset);

    const days: { label: string; value: number; isTime: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStartDate);
      d.setDate(d.getDate() + i);
      const dayStart = d.getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const value =
        settings.metric === 'time'
          ? totalPlaytimeForDayWindow(sessions, appId, dayStart, dayEnd)
          : sessionCountForDayWindow(sessions, appId, dayStart, dayEnd);
      days.push({ label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), value, isTime: settings.metric === 'time' });
    }

    bars.innerHTML = '';
    const max = Math.max(...days.map((d) => d.value), settings.metric === 'time' ? 60 : 1);
    for (const day of days) {
      const col = document.createElement('div');
      col.className = 'overlay-sparkline-col';

      const barTrack = document.createElement('div');
      barTrack.className = 'overlay-sparkline-track';
      const bar = document.createElement('div');
      bar.className = 'overlay-sparkline-bar';
      bar.style.height = `${Math.max(4, (day.value / max) * 100)}%`;
      bar.title = day.isTime ? formatPlaytime(day.value) : `${day.value} session${day.value === 1 ? '' : 's'}`;
      barTrack.appendChild(bar);

      const label = document.createElement('span');
      label.className = 'overlay-sparkline-label';
      label.textContent = day.label;

      col.append(barTrack, label);
      bars.appendChild(col);
    }
  }

  weekStartSelect.addEventListener('change', () => {
    saveWeeklyTrendSettings({ ...loadWeeklyTrendSettings(), weekStart: weekStartSelect.value as 'sunday' | 'monday' });
    renderBars();
  });
  metricSelect.addEventListener('change', () => {
    saveWeeklyTrendSettings({ ...loadWeeklyTrendSettings(), metric: metricSelect.value as 'time' | 'sessions' });
    renderBars();
  });

  renderBars();
  content.append(header, settingsRow, bars);
}
