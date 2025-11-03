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
        className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 transition-all duration-300 group border border-gray-300 dark:border-gray-600"
        aria-label="Toggle theme"
      >
        {theme === 'light' ? (
          <Moon className="w-5 h-5 text-gray-600 dark:text-gray-300 group-hover:scale-110 transition-transform" />
        ) : (
          <Sun className="w-5 h-5 text-yellow-500 group-hover:scale-110 transition-transform" />
        )}
      </button>
    </div>
  );
};

export default ThemeToggle;
