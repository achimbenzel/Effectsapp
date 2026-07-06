/** UI chrome themes (independent of the artwork colour theme).
 *
 *  The active style is a `data-theme` attribute on <html>; each theme is a
 *  token-override block in styles/themes.css. Custom CSS uploaded by the
 *  user is injected into a dedicated <style> tag and can override anything,
 *  exactly like the built-in theme files. Both persist to localStorage. */

export interface UiTheme {
  id: string;
  name: string;
  description: string;
}

export const UI_THEMES: UiTheme[] = [
  { id: 'aero', name: 'Aero Dark', description: 'Frutiger-Aero glass on deep aqua (default)' },
  { id: 'light', name: 'Light', description: 'Same aqua language on light surfaces' },
  { id: 'clean', name: 'Clean', description: 'Flat neutral zinc, no glow or gloss' },
  { id: 'xp', name: 'Experience', description: 'Early-2000s desktop: silver + blue' },
  { id: 'signal', name: 'Signal Core', description: 'Near-black console with lime glow' },
];

const THEME_KEY = 'gridforge.uiTheme';
const CSS_KEY = 'gridforge.customCss';
const STYLE_TAG_ID = 'gf-custom-css';

export function getUiTheme(): string {
  return localStorage.getItem(THEME_KEY) ?? 'aero';
}

export function applyUiTheme(id: string): void {
  if (id === 'aero') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', id);
  localStorage.setItem(THEME_KEY, id);
}

export function getCustomCss(): string | null {
  return localStorage.getItem(CSS_KEY);
}

/** Inject (or clear, with null) user CSS. It loads after the app styles so
 *  it wins the cascade, mirroring how the bundled theme files work. */
export function applyCustomCss(css: string | null): void {
  let tag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
  if (css === null) {
    tag?.remove();
    localStorage.removeItem(CSS_KEY);
    return;
  }
  if (!tag) {
    tag = document.createElement('style');
    tag.id = STYLE_TAG_ID;
    document.head.appendChild(tag);
  }
  tag.textContent = css;
  localStorage.setItem(CSS_KEY, css);
}

/** Restore persisted theme + custom CSS on startup. */
export function initUiTheme(): void {
  applyUiTheme(getUiTheme());
  const css = getCustomCss();
  if (css) applyCustomCss(css);
}
