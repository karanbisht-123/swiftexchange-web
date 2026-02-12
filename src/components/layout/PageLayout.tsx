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

  return (
    <div className="flex  flex-col items-center h-[calc(100vh-4rem)] md:h-[calc(100dvh-4rem)] lg:p-6 bg-primary overflow-hidden">
      <div
        className={`
          w-full ${maxWidthClasses[maxWidth]} 
          bg-secondary lg:rounded-xl
          flex flex-col h-full
          ${className}
        `}
      >
        <div className="shrink-0 overflow-x-auto w-screen p-3 md:pt-6 md:px-6 pb-2 md:pb-4 border-b border-color">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {showBackButton && onBack && (
                <button
                  onClick={onBack}
                  className="btn-ghost shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200"
                  aria-label="Go back"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="heading-4 truncate">{title}</h1>
                {subtitle && <p className="text-secondary  truncate">{subtitle}</p>}
              </div>
            </div>
            {headerActions && <div className="shrink-0">{headerActions}</div>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-3 md:p-6">{children}</div>
        {hasFooter && footerContent && (
          <div className="shrink-0 p-3 md:p-4 border-t border-color">{footerContent}</div>
        )}
      </div>
    </div>
  );
};

export default PageLayout;
