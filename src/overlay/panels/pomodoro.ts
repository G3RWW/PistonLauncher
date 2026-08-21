import { loadPomodoro, savePomodoro } from '../../core/timerState';
import { notify, playChime } from '../../settings/notify';
import { formatCountdown } from '../stats';

export function buildPomodoroContent(content: HTMLDivElement) {
  content.innerHTML = '';

  const display = document.createElement('div');
  display.id = 'overlay-pomodoro-display';
  display.className = 'overlay-pomodoro-display';

  const modeLabel = document.createElement('div');
  modeLabel.id = 'overlay-pomodoro-mode';
  modeLabel.className = 'overlay-pomodoro-mode';

  const settingsRow = document.createElement('div');
  settingsRow.className = 'overlay-pomodoro-settings';

  const workInput = document.createElement('input');
  workInput.type = 'number';
  workInput.min = '1';
  workInput.className = 'overlay-goal-input';
  const workLabel = document.createElement('label');
  workLabel.textContent = 'Work (min)';
  workLabel.appendChild(workInput);

  const breakInput = document.createElement('input');
  breakInput.type = 'number';
  breakInput.min = '1';
  breakInput.className = 'overlay-goal-input';
  const breakLabel = document.createElement('label');
  breakLabel.textContent = 'Break (min)';
  breakLabel.appendChild(breakInput);

  settingsRow.append(workLabel, breakLabel);

  function persistSettings() {
    const s = loadPomodoro();
    s.workMin = Math.max(1, parseInt(workInput.value, 10) || 25);
    s.breakMin = Math.max(1, parseInt(breakInput.value, 10) || 5);
    savePomodoro(s);
  }
  workInput.addEventListener('change', persistSettings);
  breakInput.addEventListener('change', persistSettings);

  const actions = document.createElement('div');
  actions.className = 'overlay-actions';

  const startBtn = document.createElement('button');
  startBtn.className = 'overlay-action-btn';
  startBtn.id = 'overlay-pomodoro-start';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'overlay-action-btn overlay-action-danger';
  resetBtn.textContent = 'Reset';
  resetBtn.addEventListener('click', () => {
    savePomodoro({ ...loadPomodoro(), mode: 'idle', endsAt: null, pausedRemainingMs: null });
    refreshPomodoroUI();
  });

  startBtn.addEventListener('click', () => {
    const s = loadPomodoro();
    if (s.mode === 'idle') {
      savePomodoro({ ...s, mode: 'work', endsAt: Date.now() + s.workMin * 60000, pausedRemainingMs: null });
    } else if (s.pausedRemainingMs != null) {
      savePomodoro({ ...s, endsAt: Date.now() + s.pausedRemainingMs, pausedRemainingMs: null });
    } else if (s.endsAt != null) {
      savePomodoro({ ...s, pausedRemainingMs: Math.max(0, s.endsAt - Date.now()), endsAt: null });
    }
    refreshPomodoroUI();
  });

  actions.append(startBtn, resetBtn);

  function refreshPomodoroUI() {
    const s = loadPomodoro();
    workInput.value = String(s.workMin);
    breakInput.value = String(s.breakMin);

    if (s.mode === 'idle') {
      modeLabel.textContent = 'Ready';
      display.textContent = formatCountdown(s.workMin * 60000);
      startBtn.textContent = 'Start';
    } else {
      modeLabel.textContent = s.mode === 'work' ? '🎯 Focus' : '☕ Break';
      const remaining = s.pausedRemainingMs ?? Math.max(0, (s.endsAt ?? Date.now()) - Date.now());
      display.textContent = formatCountdown(remaining);
      startBtn.textContent = s.pausedRemainingMs != null ? 'Resume' : s.endsAt != null ? 'Pause' : 'Start';
    }
  }

  content.append(modeLabel, display, settingsRow, actions);
  refreshPomodoroUI();
}


export function checkPomodoroCompletion() {
  const s = loadPomodoro();
  if (s.mode === 'idle' || s.endsAt == null || Date.now() < s.endsAt) return;

  const finishedMode = s.mode;
  const nextMode = finishedMode === 'work' ? 'break' : 'work';
  const nextMin = nextMode === 'work' ? s.workMin : s.breakMin;
  savePomodoro({ ...s, mode: nextMode, endsAt: Date.now() + nextMin * 60000, pausedRemainingMs: null });

  if (finishedMode === 'work') {
    playChime('focus-end');
    notify('Focus session complete', `Time for a ${s.breakMin} min break.`);
  } else {
    playChime('break-end');
    notify('Break complete', `Back to focus for ${s.workMin} min.`);
  }
}

export function tickPomodoro() {
  const display = document.querySelector<HTMLElement>('#overlay-pomodoro-display');
  if (!display) return; // panel not mounted — nothing to draw, alerting already happened above

  const fresh = loadPomodoro();
  const modeLabel = document.querySelector<HTMLElement>('#overlay-pomodoro-mode');
  const startBtn = document.querySelector<HTMLButtonElement>('#overlay-pomodoro-start');
  if (fresh.mode === 'idle') {
    if (modeLabel) modeLabel.textContent = 'Ready';
    display.textContent = formatCountdown(fresh.workMin * 60000);
    if (startBtn) startBtn.textContent = 'Start';
  } else {
    if (modeLabel) modeLabel.textContent = fresh.mode === 'work' ? '🎯 Focus' : '☕ Break';
    const remaining = fresh.pausedRemainingMs ?? Math.max(0, (fresh.endsAt ?? Date.now()) - Date.now());
    display.textContent = formatCountdown(remaining);
    if (startBtn) startBtn.textContent = fresh.pausedRemainingMs != null ? 'Resume' : fresh.endsAt != null ? 'Pause' : 'Start';
  }
}
