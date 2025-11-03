import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface ThemeState {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',

      toggleTheme: () => {
        const currentTheme = get().theme;
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        set({ theme: newTheme });

        document.documentElement.classList.remove(currentTheme);
        document.documentElement.classList.add(newTheme);

        console.log(`Theme changed to ${newTheme}`);
      },

      setTheme: theme => {
        set({ theme });
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(theme);
      },
    }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => state => {
        if (state?.theme) {
          document.documentElement.classList.remove('light', 'dark');
          document.documentElement.classList.add(state.theme);
          console.log('Theme rehydrated:', state.theme);
        }
      },
    }
  )
);
