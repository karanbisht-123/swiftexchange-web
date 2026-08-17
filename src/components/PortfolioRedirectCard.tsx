import { ArrowRight } from 'lucide-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '../constants/routes';

export const PortfolioRedirectCard: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="relative overflow-hidden rounded-none sm:rounded-[16px] border-b sm:border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-sm flex flex-col justify-center py-2.5 px-4 sm:px-5 sm:py-3 w-full min-h-[76px] sm:min-h-[84px] group h-full">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <img
          src="/38823-560x240.jpg"
          alt="Stellar Portfolio Background"
          className="absolute right-0 top-0 bottom-0 h-full w-[150%] sm:w-[90%] object-cover object-right sm:object-right opacity-90 transition-transform duration-1000 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-bg-secondary)] via-[var(--color-bg-secondary)]/90 to-transparent" />
      </div>

      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between w-full">
        <div className="flex flex-col max-w-[260px] sm:max-w-[400px]">
          <h3 className="text-sm sm:text-base font-black text-[var(--color-text-primary)] tracking-tight leading-tight">
            Track Your <span className="text-[var(--color-brand-accent)]">Stellar Portfolio</span>
          </h3>
          <p className="text-[10px] sm:text-[11px] text-[var(--color-text-secondary)] mt-0.5 leading-snug font-medium">
            Real-time PnL, performance insights, and net worth across all your wallets.
          </p>
        </div>
        <button
          onClick={() => navigate(ROUTES.PORTFOLIO || '/stellar/portfolio')}
          className="mt-2.5 sm:mt-0 w-fit shrink-0 flex items-center gap-1.5 px-4 py-1.5 sm:py-2 bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-hover)] text-[var(--color-text-inverse)] font-bold text-[11px] sm:text-xs rounded-full transition-all active:scale-95 shadow-sm"
        >
          Explore PnL{' '}
          <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
};
