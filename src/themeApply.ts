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

// Strips any rule whose selector list targets `body` or `html` from a
// theme's CSS. Used only when applying a theme to the overlay window,
// which must never have its background overridden — no matter how a
// theme (built-in or custom) chooses to style the main window's body.
// Handles flat rule blocks; doesn't attempt to look inside @media blocks.
function stripBodyBackgroundRules(css: string): string {
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (match, selector: string) => {
    const targetsBody = selector
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .some((s) => /(^|[\s>+~])(html|body)([\s.:#\[]|$)/.test(s + ' '));
    return targetsBody ? '' : match;
  });
}

// Applies whichever theme is currently saved to storage, to THIS
// document's style tag. Safe to call from any window — always reads
// fresh from storage, so calling it repeatedly (e.g. on a timer) also
// works as a lightweight "pick up theme changes made elsewhere" poll.
// Pass stripBodyBackground for windows (like the overlay) that must
// stay transparent regardless of what a theme's CSS otherwise contains.
// Returns the applied theme's display name, or undefined if unchanged.
let lastAppliedSignature = '';
export function applyActiveTheme(options?: { stripBodyBackground?: boolean }): string | undefined {
  const ref = loadActiveRef();
  const customThemes = loadCustomThemes();
  let resolved = resolveTheme(ref, customThemes);
  if (!resolved) {
    resolved = resolveTheme({ kind: 'builtin', name: 'Blueprint' }, customThemes);
  }
  if (!resolved) return undefined;

  const signature = (ref.kind === 'builtin' ? `builtin:${ref.name}` : `custom:${ref.id}`) + (options?.stripBodyBackground ? ':stripped' : '');
  if (signature === lastAppliedSignature) return undefined; // no-op if nothing changed
  lastAppliedSignature = signature;

  const css = options?.stripBodyBackground ? stripBodyBackgroundRules(resolved.css) : resolved.css;
  getThemeStyleTag().textContent = css;
  return resolved.name;
}