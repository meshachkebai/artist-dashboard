import React from 'react';
import { useTheme } from '../hooks/useTheme';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <div
      className="theme-toggle-icon"
      onClick={toggleTheme}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && toggleTheme()}
      aria-label="Toggle theme"
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
    >
      <svg viewBox="0 0 24 24" width="20" height="20">
        {theme === 'light' ? (
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor" />
        ) : (
          <circle cx="12" cy="12" r="5" fill="currentColor" />
        )}
      </svg>
    </div>
  );
};

export default ThemeToggle;