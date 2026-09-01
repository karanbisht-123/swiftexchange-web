import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemeType = 'light' | 'dark' | 'navy';

interface ThemeState {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark', // Default to the new premium dark mode

      setTheme: (theme: ThemeType) => {
        set({ theme });
        document.documentElement.classList.remove('light', 'dark', 'navy');
        document.documentElement.classList.add(theme);
      },

      toggleTheme: () => {
        const next = get().theme === 'light' ? 'dark' : 'light';
        get().setTheme(next);
      },
    }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => state => {
        if (state?.theme) {
          document.documentElement.classList.remove('light', 'dark', 'navy');
          document.documentElement.classList.add(state.theme);
        }
      },
    }
  )
);
