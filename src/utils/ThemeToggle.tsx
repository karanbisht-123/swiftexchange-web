import { ChevronDown, Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { type ThemeType, useThemeStore } from '../store/themeStore';

const ThemeToggle = () => {
  const { theme, setTheme } = useThemeStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const themes: { value: ThemeType; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: 'Light', icon: <Sun size={16} /> },
    { value: 'dark', label: 'Midnight', icon: <Moon size={16} /> },
    { value: 'navy', label: 'Navy Classic', icon: <Monitor size={16} /> },
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full p-2 lg:px-3 lg:py-2 text-(--color-text-secondary) hover:bg-(--color-bg-tertiary) hover:text-(--color-text-primary) transition-colors border border-transparent hover:border-(--color-border) bg-transparent"
        aria-label="Toggle theme"
      >
        {theme === 'light' ? (
          <Sun size={18} />
        ) : theme === 'navy' ? (
          <Monitor size={18} />
        ) : (
          <Moon size={18} />
        )}
        <ChevronDown
          size={14}
          className={`hidden lg:block transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-40 rounded-xl bg-bg-secondary border border-border shadow-xl overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2">
          <div className="p-1">
            {themes.map(t => (
              <button
                key={t.value}
                onClick={() => {
                  setTheme(t.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  theme === t.value
                    ? 'bg-brand-primary/10 text-brand'
                    : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                }`}
              >
                <span className={theme === t.value ? 'text-brand' : 'text-text-muted'}>
                  {t.icon}
                </span>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ThemeToggle;
