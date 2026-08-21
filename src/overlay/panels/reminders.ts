import { loadReminders, saveReminders } from '../../core/timerState';
import { notify, playChime } from '../../settings/notify';
import { formatCountdown } from '../stats';

export function buildRemindersContent(content: HTMLDivElement) {
  content.innerHTML = '';

  const addRow = document.createElement('div');
  addRow.className = 'overlay-reminder-add-row';
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.placeholder = 'e.g. Stretch';
  labelInput.className = 'overlay-goal-input';
  const intervalInput = document.createElement('input');
  intervalInput.type = 'number';
  intervalInput.min = '1';
  intervalInput.placeholder = 'min';
  intervalInput.className = 'overlay-goal-input overlay-reminder-interval-input';
  const addBtn = document.createElement('button');
  addBtn.className = 'overlay-action-btn';
  addBtn.textContent = 'Add';
  addBtn.addEventListener('click', () => {
    const label = labelInput.value.trim();
    const intervalMin = Math.max(1, parseInt(intervalInput.value, 10) || 0);
    if (!label || !intervalMin) return;
    const list = loadReminders();
    list.push({ id: crypto.randomUUID(), label, intervalMin, lastFiredAt: Date.now() });
    saveReminders(list);
    labelInput.value = '';
    intervalInput.value = '';
    renderList();
  });
  addRow.append(labelInput, intervalInput, addBtn);

  const list = document.createElement('div');
  list.className = 'overlay-reminder-list';

  function renderList() {
    list.innerHTML = '';
    const reminders = loadReminders();
    if (reminders.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'overlay-empty-small';
      empty.textContent = 'No reminders yet.';
      list.appendChild(empty);
      return;
    }
    for (const r of reminders) {
      const row = document.createElement('div');
      row.className = 'overlay-reminder-row';
      row.dataset.reminderId = r.id;
      row.dataset.lastFired = String(r.lastFiredAt);

      const text = document.createElement('span');
      text.className = 'overlay-reminder-text';
      text.textContent = r.label;

      const countdown = document.createElement('span');
      countdown.className = 'overlay-reminder-countdown';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'overlay-widget-btn';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        saveReminders(loadReminders().filter((x) => x.id !== r.id));
        renderList();
      });

      row.append(text, countdown, removeBtn);
      list.appendChild(row);
    }
  }

  renderList();
  content.append(addRow, list);
}

export function checkReminderCompletions() {
  const reminders = loadReminders();
  const now = Date.now();
  let changed = false;

  for (const r of reminders) {
    const intervalMs = r.intervalMin * 60000;
    if (now - r.lastFiredAt >= intervalMs) {
      r.lastFiredAt = now;
      changed = true;
      playChime('reminder');
      notify('Reminder', r.label);
    }
  }

  if (changed) saveReminders(reminders);
}

export function tickReminders() {
  const list = document.querySelector<HTMLElement>('.overlay-reminder-list');
  if (!list) return; // panel not mounted — nothing to draw, alerting already happened above

  const reminders = loadReminders();
  const now = Date.now();

  for (const r of reminders) {
    const intervalMs = r.intervalMin * 60000;
    const row = list.querySelector<HTMLElement>(`[data-reminder-id="${r.id}"]`);
    const countdownEl = row?.querySelector<HTMLElement>('.overlay-reminder-countdown');

    if (countdownEl) {
      const remaining = Math.max(0, intervalMs - (now - r.lastFiredAt));
      countdownEl.textContent = formatCountdown(remaining);
    }

    // Flash the row the moment its lastFiredAt actually changes, so the
    // panel's UI — if it happens to be visible — still shows the fire.
    if (row && row.dataset.lastFired !== String(r.lastFiredAt)) {
      row.dataset.lastFired = String(r.lastFiredAt);
      row.classList.add('overlay-reminder-fired');
      setTimeout(() => row.classList.remove('overlay-reminder-fired'), 3000);
    }
  }
}
