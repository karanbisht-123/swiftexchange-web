import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemeType = 'light' | 'dark' | 'navy';

interface ThemeState {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    set => ({
      theme: 'dark', // Default to the new premium dark mode

      setTheme: (theme: ThemeType) => {
        set({ theme });
        document.documentElement.classList.remove('light', 'dark', 'navy');
        if (theme !== 'light') {
          document.documentElement.classList.add(theme);
        }
      },
    }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => state => {
        if (state?.theme) {
          document.documentElement.classList.remove('light', 'dark', 'navy');
          if (state.theme !== 'light') {
            document.documentElement.classList.add(state.theme);
          }
        }
      },
    }
  )
);
