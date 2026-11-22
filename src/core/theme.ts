import { useCallback, useState } from 'react';

/**
 * Light and dark, chosen by the person using the platform.
 *
 * Three rules hold here:
 *
 *   1. The choice is remembered locally, not stored on the server. Theme is not
 *      a business fact about an organization, and putting it in `system_settings`
 *      would let one operator's preference change the console for every business
 *      on the installation.
 *   2. Nothing is applied before the first paint. `applyStoredTheme()` runs from
 *      `main.tsx` synchronously, so a dark preference does not flash a white
 *      page first.
 *   3. With no stored choice the system preference decides, and that is a
 *      fallback rather than a claim: the toggle on screen always states which of
 *      the two the platform is currently showing.
 *
 * Reading `localStorage` is wrapped because it throws in a browser configured to
 * deny storage to this site. A theme is the least important thing on the page and
 * must not be able to break it.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'hassal_theme';

function systemPrefersDark(): boolean {
  try {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

/** What the browser was told last time, or the system's answer when it never was. */
export function storedTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage refused: fall through to the system preference.
  }
  return systemPrefersDark() ? 'dark' : 'light';
}

/** Put the class on `<html>` that every `dark:` utility in the app keys off. */
export function applyTheme(theme: Theme): Theme {
  if (typeof document === 'undefined') return theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  return theme;
}

/** Called once from `main.tsx`, before React mounts. */
export function applyStoredTheme(): Theme {
  return applyTheme(storedTheme());
}

export function setTheme(theme: Theme): Theme {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Refused storage costs the memory of the choice, not the choice itself:
    // the class is applied for this session either way.
  }
  return applyTheme(theme);
}

export function toggleTheme(current: Theme): Theme {
  return setTheme(current === 'dark' ? 'light' : 'dark');
}

/**
 * The React side of it.
 *
 * Components read `theme` through this hook rather than inspecting the class
 * list, so a re-render and the DOM never disagree about which one is showing.
 */
export function useTheme(): { theme: Theme; set: (theme: Theme) => void; toggle: () => void } {
  const read = (): Theme => (typeof document !== 'undefined'
    && document.documentElement.classList.contains('dark')
    ? 'dark'
    : 'light');

  const [theme, setThemeState] = useState<Theme>(read);

  const set = useCallback((next: Theme) => {
    setThemeState(setTheme(next));
  }, []);

  const toggle = useCallback(() => {
    set(theme === 'dark' ? 'light' : 'dark');
  }, [set, theme]);

  return { theme, set, toggle };
}
