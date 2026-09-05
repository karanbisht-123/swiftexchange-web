import { ArrowRight, Sparkles } from 'lucide-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '@/constants/routes';

export const PortfolioRedirectCard: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(ROUTES.PORTFOLIO || '/stellar/portfolio')}
      className="relative overflow-hidden rounded-2xl border border-[var(--color-border)]/60 bg-[var(--color-bg-secondary)] hover:border-[var(--color-brand-primary)]/50 shadow-sm hover:shadow-md flex items-center justify-between py-3 px-4 sm:px-5 sm:py-3.5 w-full group h-full cursor-pointer active:scale-[0.99] transition-all duration-200 select-none"
    >
      {/* Background Graphic with Gradient Overlay */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <img
          src="/38823-560x240.jpg"
          alt="Stellar Portfolio Background"
          className="absolute right-0 top-0 bottom-0 h-full w-[130%] sm:w-[85%] object-cover object-right opacity-85 transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-bg-secondary)] via-[var(--color-bg-secondary)]/95 to-[var(--color-bg-secondary)]/30" />
      </div>

      {/* Content & Typography */}
      <div className="relative z-10 flex flex-col min-w-0 pr-2">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-md bg-[var(--color-brand-accent)]/15 text-[var(--color-brand-accent)] border border-[var(--color-brand-accent)]/25">
            <Sparkles size={9} />
            Analytics
          </span>
        </div>
        <h3 className="text-sm sm:text-base font-bold text-[var(--color-text-primary)] tracking-tight leading-tight group-hover:text-[var(--color-brand-primary)] transition-colors">
          Track Your <span className="text-[var(--color-brand-accent)]">Stellar Portfolio</span>
        </h3>
        <p className="text-[10px] sm:text-[11px] text-[var(--color-text-secondary)] mt-0.5 leading-snug font-medium truncate max-w-[240px] sm:max-w-none">
          Real-time PnL & net worth across your wallets
        </p>
      </div>

      {/* Sleek Right Action Arrow Button */}
      <div className="relative z-10 shrink-0">
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[var(--color-brand-primary)] text-white shadow-md shadow-blue-500/25 group-hover:scale-105 group-hover:bg-[var(--color-brand-primary-hover)] transition-all duration-200 flex items-center justify-center">
          <ArrowRight
            size={15}
            className="group-hover:translate-x-0.5 transition-transform duration-200"
          />
        </div>
      </div>
    </div>
  );
};
