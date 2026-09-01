import { ArrowLeft } from 'lucide-react';
import React from 'react';

interface PageLayoutProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: React.ReactNode;
  className?: string;
  showBackButton?: boolean;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '7xl' | 'full';
  hasFooter?: boolean;
  footerContent?: React.ReactNode;
  headerActions?: React.ReactNode;
  isBeta?: boolean;
  betaMessage?: string;
}

const PageLayout: React.FC<PageLayoutProps> = ({
  title,
  subtitle,
  onBack,
  children,
  className = '',
  showBackButton = true,
  maxWidth = 'lg',
  hasFooter = false,
  footerContent,
  headerActions,
}) => {
  const maxWidthClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
    '2xl': 'max-w-6xl',
    '7xl': 'max-w-7xl',
    full: 'max-w-full',
  };

  const minHeightClasses = {
    sm: 'min-h-[380px]',
    md: 'min-h-[440px]',
    lg: 'min-h-[480px]',
    xl: 'min-h-[520px]',
    '2xl': 'min-h-[560px]',
    '7xl': 'min-h-[580px] lg:h-[calc(100dvh-5rem)]',
    full: 'min-h-[580px] h-full',
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[calc(100dvh-5rem)] p-3 sm:p-6 lg:p-8 bg-[var(--color-bg-primary)] overflow-hidden transition-colors">
      {/* Broad Ambient Atmosphere Glow (Top Light Source) */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] max-w-[90vw] h-[350px] bg-gradient-to-b from-[var(--color-brand-primary)]/10 via-[var(--color-brand-accent)]/5 to-transparent blur-[120px] rounded-full pointer-events-none -z-10" />

      {/* Main Crypto Card Container */}
      <div
        className={`
          w-full ${maxWidthClasses[maxWidth]} ${minHeightClasses[maxWidth]}
          relative
          bg-[var(--color-bg-secondary)]
          border border-[var(--color-border)]/80
          shadow-2xl shadow-black/60
          rounded-2xl
          flex flex-col
          overflow-hidden
          transition-all duration-200 ease-out
          ${className}
        `}
      >
        {/* Subtle Top-Edge Highlight Line */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />

        {/* Card Header */}
        <div className="shrink-0 overflow-x-auto max-w-screen p-4 sm:p-6 pb-3 sm:pb-4 border-b border-[var(--color-border)]/60">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {showBackButton && onBack && (
                <button
                  onClick={onBack}
                  className="shrink-0 w-8 h-8 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-brand-primary)] flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-all duration-150 cursor-pointer"
                  aria-label="Go back"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] truncate">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 truncate">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            {headerActions && <div className="shrink-0">{headerActions}</div>}
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-3 lg:p-4 max-w-[100vw] min-h-[280px]">
          {children}
        </div>

        {/* Card Footer Area */}
        {hasFooter && footerContent && (
          <div className="shrink-0 p-3 sm:p-4 border-t border-[var(--color-border)]/60 bg-[var(--color-bg-tertiary)]/20">
            {footerContent}
          </div>
        )}
      </div>
    </div>
  );
};

export default PageLayout;
