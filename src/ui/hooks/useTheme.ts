import { useEffect } from 'react';
import type { ThemeId } from '@/core/settings/schema';

/**
 * Apply the theme preference to <html>. "system" follows the OS and keeps
 * following it while the popup is open.
 */
export function useTheme(theme: ThemeId): void {
  useEffect(() => {
    const root = document.documentElement;

    const apply = (dark: boolean): void => {
      root.classList.toggle('dark', dark);
    };

    if (theme !== 'system') {
      apply(theme === 'dark');
      return;
    }

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    apply(query.matches);

    const listener = (event: MediaQueryListEvent): void => apply(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, [theme]);
}
