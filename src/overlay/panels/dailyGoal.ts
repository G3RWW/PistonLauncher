import { loadDailyGoals, saveDailyGoals } from '../stats';
import { updateLiveStats } from '../overlay';

export function buildDailyGoalContent(content: HTMLDivElement, appId: string) {
  content.innerHTML = '';
  const goals = loadDailyGoals();

  const row = document.createElement('div');
  row.className = 'overlay-goal-row';
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.className = 'overlay-goal-input';
  input.placeholder = 'Goal (minutes)';
  input.value = goals[appId] ? String(goals[appId]) : '';
  input.addEventListener('change', () => {
    const val = Math.max(0, parseInt(input.value, 10) || 0);
    const fresh = loadDailyGoals();
    if (val > 0) fresh[appId] = val;
    else delete fresh[appId];
    saveDailyGoals(fresh);
    updateLiveStats(); // refresh the bar immediately with the new goal
  });
  row.appendChild(input);

  const track = document.createElement('div');
  track.className = 'overlay-goal-bar-track';
  const fill = document.createElement('div');
  fill.id = 'overlay-goal-bar-fill';
  fill.className = 'overlay-goal-bar-fill';
  track.appendChild(fill);

  const label = document.createElement('div');
  label.id = 'overlay-goal-label';
  label.className = 'overlay-goal-label';

  content.append(row, track, label);
}
