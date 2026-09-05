import { fireEvent, render, screen } from '@testing-library/react';

import { beforeEach, describe, expect, it } from 'vitest';

import { useThemeStore } from '../../store/themeStore';
import ThemeToggle from '../ThemeToggle';

const resetStore = () => {
  useThemeStore.setState({ theme: 'dark' });
  document.documentElement.classList.remove('light', 'dark');
};

describe('ThemeToggle', () => {
  beforeEach(() => {
    resetStore();
  });

  it('renders the toggle button with aria-label', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument();
  });

  it('shows the Sun icon when theme is dark', () => {
    useThemeStore.setState({ theme: 'dark' });
    const { container } = render(<ThemeToggle />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('shows the Moon icon when theme is light', () => {
    useThemeStore.setState({ theme: 'light' });
    const { container } = render(<ThemeToggle />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('opens dropdown and switches theme when an option is clicked', () => {
    useThemeStore.setState({ theme: 'dark' });
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
    fireEvent.click(screen.getByRole('button', { name: /Light/i }));

    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('switches to navy theme when Navy Classic is clicked', () => {
    useThemeStore.setState({ theme: 'dark' });
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
    fireEvent.click(screen.getByRole('button', { name: /Navy Classic/i }));

    expect(useThemeStore.getState().theme).toBe('navy');
  });
});
