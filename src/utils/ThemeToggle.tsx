import { Moon, Sun } from 'lucide-react';

import { useThemeStore } from '../store/themeStore';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useThemeStore();

  const handleToggle = () => {
    console.log('Button clicked - Current theme:', theme);
    toggleTheme();
    console.log('Toggle function called');
  };

  console.log('ThemeToggle rendered with theme:', theme);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleToggle}
        className="relative rounded-full p-2 text-(--color-text-secondary) hover:bg-(--color-bg-tertiary) hover:text-(--color-text-primary) transition-colors"
        aria-label="Toggle theme"
      >
        {theme === 'light' ? (
          <Moon size={20} />
        ) : (
          <Sun size={20} />
        )}
      </button>
    </div>
  );
};

export default ThemeToggle;
