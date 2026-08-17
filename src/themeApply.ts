import blueprintCss from './themes/blueprint.css?raw';
import steamCss from './themes/steam.css?raw';
import midnightCss from './themes/midnight.css?raw';

export type CustomTheme = { id: string; name: string; css: string };
export type ActiveThemeRef = { kind: 'builtin'; name: string } | { kind: 'custom'; id: string };

const ACTIVE_THEME_REF_KEY = 'launcher-active-theme-ref';
const CUSTOM_THEMES_KEY = 'launcher-custom-themes';

export const BUILTIN_THEMES: Record<string, string> = {
  Blueprint: blueprintCss,
  Steam: steamCss,
  Midnight: midnightCss,
};

export function loadCustomThemes(): CustomTheme[] {
  const raw = localStorage.getItem(CUSTOM_THEMES_KEY);
  return raw ? JSON.parse(raw) : [];
}
export function saveCustomThemes(list: CustomTheme[]) {
  localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(list));
}

export function loadActiveRef(): ActiveThemeRef {
  const raw = localStorage.getItem(ACTIVE_THEME_REF_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      /* fall through to default */
    }
  }
  return { kind: 'builtin', name: 'Blueprint' };
}
export function saveActiveRef(ref: ActiveThemeRef) {
  localStorage.setItem(ACTIVE_THEME_REF_KEY, JSON.stringify(ref));
}

function getThemeStyleTag(): HTMLStyleElement {
  let tag = document.querySelector<HTMLStyleElement>('#active-theme-css');
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'active-theme-css';
    document.head.appendChild(tag); // appended last -> wins ties with the base stylesheet
  }
  return tag;
}

function resolveTheme(ref: ActiveThemeRef, customThemes: CustomTheme[]): { css: string; name: string } | null {
  if (ref.kind === 'builtin') {
    const css = BUILTIN_THEMES[ref.name];
    return css ? { css, name: ref.name } : null;
  }
  const custom = customThemes.find((t) => t.id === ref.id);
  return custom ? { css: custom.css, name: custom.name } : null;
}

// Applies whichever theme is currently saved to storage, to THIS
// document's style tag. Safe to call from any window — always reads
// fresh from storage, so calling it repeatedly (e.g. on a timer) also
// works as a lightweight "pick up theme changes made elsewhere" poll.
// Returns the applied theme's display name, or undefined if unchanged.
let lastAppliedSignature = '';
export function applyActiveTheme(): string | undefined {
  const ref = loadActiveRef();
  const customThemes = loadCustomThemes();
  let resolved = resolveTheme(ref, customThemes);
  if (!resolved) {
    resolved = resolveTheme({ kind: 'builtin', name: 'Blueprint' }, customThemes);
  }
  if (!resolved) return undefined;

  const signature = ref.kind === 'builtin' ? `builtin:${ref.name}` : `custom:${ref.id}`;
  if (signature === lastAppliedSignature) return undefined; // no-op if nothing changed
  lastAppliedSignature = signature;

  getThemeStyleTag().textContent = resolved.css;
  return resolved.name;
}