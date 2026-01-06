import { ArrowLeft } from 'lucide-react';
import React from 'react';

interface PageLayoutProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: React.ReactNode;
  className?: string;
  showBackButton?: boolean;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
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
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-6xl',
    full: 'max-w-full',
  };

  return (
    <div className="flex flex-col items-center min-h-screen py-2  lg:p-6 bg-primary">
      <div
        className={`
          w-full ${maxWidthClasses[maxWidth]} 
          lg:bg-secondary p-3 md:p-6 rounded-xl
          flex flex-col
          ${className}
  
        `}
      >
        <div className="shrink-0 pb-4 border-b border-color">
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
        <div className="flex-1 overflow-y-auto scrollbar-thin py-4">{children}</div>
        {hasFooter && footerContent && (
          <div className="shrink-0 pt-4 border-t border-color">{footerContent}</div>
        )}
      </div>
    </div>
  );
};

export default PageLayout;
