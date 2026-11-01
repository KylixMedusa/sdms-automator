import { useCallback, useState } from 'react';

export type Theme = 'light' | 'dark';

// index.html applies the initial theme before first paint; this keeps React in sync with it.
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#11151F' : '#F4F6FA');
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try {
        localStorage.setItem('theme', next);
      } catch {
        // private mode: the choice just won't persist
      }
      return next;
    });
  }, []);
  return { theme, toggle };
}
