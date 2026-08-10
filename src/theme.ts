import type { ThemeName } from './types';

const THEME_KEY = 'launcher-theme';
const CUSTOM_THEME_KEY = 'launcher-custom-theme';
const CUSTOM_CSS_KEY = 'launcher-custom-css';
const CUSTOM_VARS = ['--ink', '--panel', '--brass', '--bone'];

function loadCustomTheme(): Record<string, string> {
  const raw = localStorage.getItem(CUSTOM_THEME_KEY);
  return raw
    ? JSON.parse(raw)
    : { '--ink': '#121110', '--panel': '#1b1917', '--brass': '#c9974a', '--bone': '#e7e2d6' };
}
function saveCustomTheme(data: Record<string, string>) {
  localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(data));
}

function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;
  if (theme === 'custom') {
    const custom = loadCustomTheme();
    for (const [key, value] of Object.entries(custom)) {
      document.documentElement.style.setProperty(key, value);
    }
  } else {
    CUSTOM_VARS.forEach((v) => document.documentElement.style.removeProperty(v));
  }
  localStorage.setItem(THEME_KEY, theme);
}

function syncCustomThemeInputs() {
  const custom = loadCustomTheme();
  (document.querySelector('#custom-ink') as HTMLInputElement).value = custom['--ink'];
  (document.querySelector('#custom-panel') as HTMLInputElement).value = custom['--panel'];
  (document.querySelector('#custom-brass') as HTMLInputElement).value = custom['--brass'];
  (document.querySelector('#custom-bone') as HTMLInputElement).value = custom['--bone'];
  const isCustom = document.documentElement.dataset.theme === 'custom';
  document.querySelector('#custom-theme-controls')!.classList.toggle('hidden', !isCustom);
}

applyTheme((localStorage.getItem(THEME_KEY) as ThemeName) || 'blueprint');

document.querySelector<HTMLButtonElement>('#theme-btn')!.addEventListener('click', () => {
  syncCustomThemeInputs();
  const cssInput = document.querySelector<HTMLTextAreaElement>('#custom-css-input')!;
  cssInput.value = localStorage.getItem(CUSTOM_CSS_KEY) || '';
  document.querySelector('#theme-modal')!.classList.remove('hidden');
});
document.querySelector<HTMLButtonElement>('#theme-close-btn')!.addEventListener('click', () => {
  document.querySelector('#theme-modal')!.classList.add('hidden');
});

document.querySelectorAll<HTMLButtonElement>('.theme-swatch').forEach((btn) => {
  btn.addEventListener('click', () => {
    const theme = btn.dataset.theme as ThemeName;
    applyTheme(theme);
    document.querySelector('#custom-theme-controls')!.classList.toggle('hidden', theme !== 'custom');
  });
});

(['ink', 'panel', 'brass', 'bone'] as const).forEach((key) => {
  document.querySelector<HTMLInputElement>(`#custom-${key}`)!.addEventListener('input', (e) => {
    const value = (e.target as HTMLInputElement).value;
    const varName = `--${key}`;
    document.documentElement.style.setProperty(varName, value);
    const custom = loadCustomTheme();
    custom[varName] = value;
    saveCustomTheme(custom);
    applyTheme('custom');
  });
});

// ---- Raw Custom CSS injection — full stylesheet-level override ----

function getCustomCssStyleTag(): HTMLStyleElement {
  let tag = document.querySelector<HTMLStyleElement>('#user-custom-css');
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'user-custom-css';
    document.head.appendChild(tag); // appended last -> wins ties with the base stylesheet
  }
  return tag;
}

function applyCustomCss(css: string) {
  getCustomCssStyleTag().textContent = css;
}

applyCustomCss(localStorage.getItem(CUSTOM_CSS_KEY) || '');

document.querySelector<HTMLButtonElement>('#custom-css-apply-btn')!.addEventListener('click', () => {
  const css = document.querySelector<HTMLTextAreaElement>('#custom-css-input')!.value;
  localStorage.setItem(CUSTOM_CSS_KEY, css);
  applyCustomCss(css);
});

document.querySelector<HTMLButtonElement>('#custom-css-clear-btn')!.addEventListener('click', () => {
  localStorage.removeItem(CUSTOM_CSS_KEY);
  document.querySelector<HTMLTextAreaElement>('#custom-css-input')!.value = '';
  applyCustomCss('');
});
