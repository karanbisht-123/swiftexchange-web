import { beforeEach, describe, expect, it } from 'vitest';

import { useThemeStore } from '../themeStore';

const resetStore = () => {
  useThemeStore.setState({ theme: 'dark' });
  document.documentElement.classList.remove('light', 'dark');
};

describe('themeStore', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('initial state', () => {
    it('defaults to dark theme', () => {
      expect(useThemeStore.getState().theme).toBe('dark');
    });
  });

  describe('toggleTheme', () => {
    it('switches theme from dark to light', () => {
      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().theme).toBe('light');
    });

    it('switches theme from light to dark', () => {
      useThemeStore.setState({ theme: 'light' });
      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().theme).toBe('dark');
    });

    it('adds the new theme class to documentElement', () => {
      useThemeStore.getState().toggleTheme();
      expect(document.documentElement.classList.contains('light')).toBe(true);
    });

    it('removes the old theme class from documentElement', () => {
      document.documentElement.classList.add('dark');
      useThemeStore.getState().toggleTheme();
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  describe('setTheme', () => {
    it('sets theme to light explicitly', () => {
      useThemeStore.getState().setTheme('light');
      expect(useThemeStore.getState().theme).toBe('light');
    });

    it('sets theme to dark explicitly', () => {
      useThemeStore.setState({ theme: 'light' });
      useThemeStore.getState().setTheme('dark');
      expect(useThemeStore.getState().theme).toBe('dark');
    });

    it('applies the correct class to documentElement', () => {
      useThemeStore.getState().setTheme('light');
      expect(document.documentElement.classList.contains('light')).toBe(true);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('removes both theme classes before applying the new one', () => {
      document.documentElement.classList.add('dark');
      useThemeStore.getState().setTheme('dark');
      const classCount = Array.from(document.documentElement.classList).filter(
        c => c === 'light' || c === 'dark'
      ).length;
      expect(classCount).toBe(1);
    });
  });
});
