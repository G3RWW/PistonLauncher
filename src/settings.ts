import { renderThemeModalLists } from './theme';
import { renderHotkeysList } from './hotkeys';
import { loadSoundSettings, saveSoundSettings, pickCustomChimeFile, playChime, CHIME_STYLE_LABELS, type ChimeStyle } from './notify';

type SettingsTab = 'sound' | 'themes' | 'shortcuts';

function fileBasename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

// Builds the Sound tab's content fresh each time it's opened, so it
// always reflects whatever's currently saved.
function buildSoundPanel() {
  const panel = document.querySelector<HTMLDivElement>('#settings-panel-sound')!;
  panel.innerHTML = '';

  const intro = document.createElement('p');
  intro.className = 'settings-panel-intro';
  intro.textContent = 'How focus-timer and reminder alerts sound. A system notification always shows too.';

  const settings = loadSoundSettings();

  // --- volume ---
  const volumeRow = document.createElement('div');
  volumeRow.className = 'settings-row';
  const volumeLabel = document.createElement('label');
  volumeLabel.textContent = 'Volume';
  const volumeValue = document.createElement('span');
  volumeValue.className = 'settings-value';
  volumeValue.textContent = `${Math.round(settings.volume * 100)}%`;
  const volumeInput = document.createElement('input');
  volumeInput.type = 'range';
  volumeInput.min = '0';
  volumeInput.max = '100';
  volumeInput.step = '5';
  volumeInput.value = String(Math.round(settings.volume * 100));
  volumeInput.addEventListener('input', () => {
    const v = parseInt(volumeInput.value, 10) / 100;
    volumeValue.textContent = `${volumeInput.value}%`;
    saveSoundSettings({ ...loadSoundSettings(), volume: v });
  });
  volumeRow.append(volumeLabel, volumeInput, volumeValue);

  // --- style ---
  const styleRow = document.createElement('div');
  styleRow.className = 'settings-row';
  const styleLabel = document.createElement('label');
  styleLabel.textContent = 'Sound';
  const styleSelect = document.createElement('select');
  styleSelect.className = 'settings-select';
  (Object.keys(CHIME_STYLE_LABELS) as ChimeStyle[]).forEach((style) => {
    const opt = document.createElement('option');
    opt.value = style;
    opt.textContent = CHIME_STYLE_LABELS[style];
    styleSelect.appendChild(opt);
  });
  styleSelect.value = settings.style;
  styleRow.append(styleLabel, styleSelect);

  // --- custom file (only relevant when style === 'custom') ---
  const fileRow = document.createElement('div');
  fileRow.className = 'settings-file-row';
  const fileNameEl = document.createElement('span');
  fileNameEl.className = 'settings-file-name';
  fileNameEl.textContent = settings.customPath ? fileBasename(settings.customPath) : 'No file chosen';
  const chooseFileBtn = document.createElement('button');
  chooseFileBtn.type = 'button';
  chooseFileBtn.textContent = 'Choose file…';
  chooseFileBtn.addEventListener('click', async () => {
    const path = await pickCustomChimeFile();
    if (!path) return;
    saveSoundSettings({ ...loadSoundSettings(), customPath: path });
    fileNameEl.textContent = fileBasename(path);
  });
  fileRow.append(fileNameEl, chooseFileBtn);

  function refreshFileRowVisibility() {
    fileRow.classList.toggle('hidden', styleSelect.value !== 'custom');
  }
  refreshFileRowVisibility();

  styleSelect.addEventListener('change', () => {
    saveSoundSettings({ ...loadSoundSettings(), style: styleSelect.value as ChimeStyle });
    refreshFileRowVisibility();
  });

  // --- test ---
  const testBtn = document.createElement('button');
  testBtn.type = 'button';
  testBtn.className = 'settings-test-btn';
  testBtn.textContent = 'Test sound';
  testBtn.addEventListener('click', () => playChime('reminder'));

  panel.append(intro, volumeRow, styleRow, fileRow, testBtn);
}

function switchTab(tab: SettingsTab) {
  document.querySelectorAll<HTMLButtonElement>('.settings-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll<HTMLElement>('.settings-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `settings-panel-${tab}`);
  });
  if (tab === 'sound') buildSoundPanel();
  if (tab === 'themes') renderThemeModalLists();
  if (tab === 'shortcuts') renderHotkeysList();
}

document.querySelectorAll<HTMLButtonElement>('.settings-tab').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab as SettingsTab));
});

document.querySelector<HTMLButtonElement>('#settings-btn')!.addEventListener('click', () => {
  switchTab('sound');
  document.querySelector('#settings-modal')!.classList.remove('hidden');
});
document.querySelector<HTMLButtonElement>('#settings-close-btn')!.addEventListener('click', () => {
  document.querySelector('#settings-modal')!.classList.add('hidden');
});
