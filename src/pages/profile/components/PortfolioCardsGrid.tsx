import { Activity, Check, ChevronRight, Compass, Copy, Sparkles, Wallet } from 'lucide-react';
import React from 'react';

import { dydxDataService } from '../../../modules/dydx/service/dydxOrderService';
import { type PortfolioTab } from '../../../modules/walletconnect/hooks/useProfilePortfolio';
import { portfolioUtils } from '../../../modules/walletconnect/utils/portfolioUtils';

interface PortfolioCardsGridProps {
  activeTabs: PortfolioTab[];
  activeTab: PortfolioTab;
  setActiveTab: (tab: PortfolioTab) => void;
  grandTotal: number;
  evmTotal: number;
  stellarTotal: number;
  dydxTotal: number;
  connectedWallets: any;
  copiedStates: Record<string, boolean>;
  handleCopy: (text: string, key: string) => void;
  cardPnL: Record<string, { change: number; percent: number }>;
  openModal: () => void;
}

export const PortfolioCardsGrid: React.FC<PortfolioCardsGridProps> = ({
  activeTabs,
  activeTab,
  setActiveTab,
  grandTotal,
  evmTotal,
  stellarTotal,
  dydxTotal,
  connectedWallets,
  copiedStates,
  handleCopy,
  cardPnL,
  openModal,
}) => {
  const getCardDetails = (tab: PortfolioTab) => {
    switch (tab) {
      case 'total':
        return {
          title: 'Total Portfolio',
          icon: <Sparkles size={20} className="text-amber-400" />,
          total: grandTotal,
          walletId: 'Aggregate Asset View',
          address: '',
          color: 'from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-400',
          glow: 'shadow-amber-500/10',
          activeBg:
            'bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent border-amber-500 shadow-amber-500/10',
        };
      case 'evm': {
        const isEvmConnected = !!connectedWallets.evm?.address;
        return {
          title: 'EVM Portfolio',
          icon: <Wallet size={20} className="text-blue-400" />,
          total: evmTotal,
          walletId: isEvmConnected
            ? connectedWallets.evm?.walletId || 'Connected'
            : 'Not Connected',
          address: isEvmConnected ? connectedWallets.evm?.address || '' : '',
          color: 'from-blue-500/20 to-indigo-500/10 border-blue-500/30 text-blue-400',
          glow: 'shadow-blue-500/10',
          activeBg:
            'bg-gradient-to-br from-blue-500/20 via-indigo-500/10 to-transparent border-blue-500 shadow-blue-500/10',
        };
      }
      case 'stellar': {
        const isStellarConnected = !!connectedWallets.stellar?.address;
        return {
          title: 'Stellar Portfolio',
          icon: <Compass size={20} className="text-purple-400" />,
          total: stellarTotal,
          walletId: isStellarConnected
            ? connectedWallets.stellar?.walletId || 'Connected'
            : 'Not Connected',
          address: isStellarConnected ? connectedWallets.stellar?.address || '' : '',
          color: 'from-purple-500/20 to-pink-500/10 border-purple-500/30 text-purple-400',
          glow: 'shadow-purple-500/10',
          activeBg:
            'bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-transparent border-purple-500 shadow-purple-500/10',
        };
      }
      case 'dydx': {
        const isDydxConnected = dydxDataService.isReady();
        return {
          title: 'dYdX Account',
          icon: <Activity size={20} className="text-emerald-400" />,
          total: dydxTotal,
          walletId: isDydxConnected
            ? connectedWallets.evm?.dydxAddress
              ? connectedWallets.evm.walletId
              : 'Derived'
            : 'Not Connected',
          address: isDydxConnected ? connectedWallets.evm?.dydxAddress || '' : '',
          color: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-400',
          glow: 'shadow-emerald-500/10',
          activeBg:
            'bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-transparent border-emerald-500 shadow-emerald-500/10',
        };
      }
    }
  };

  return (
    <div
      className={`grid gap-4 ${
        activeTabs.length === 2
          ? 'grid-cols-1 md:grid-cols-2'
          : activeTabs.length === 3
            ? 'grid-cols-1 md:grid-cols-3'
            : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
      }`}
    >
      {activeTabs.map(tab => {
        const details = getCardDetails(tab);
        const isActive = activeTab === tab;
        const isCopied = copiedStates[tab];
        const pnl = cardPnL[tab] || { change: 0, percent: 0 };
        const percentageOfTotal = grandTotal > 0 ? (details.total / grandTotal) * 100 : 0;

        return (
          <div
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer relative overflow-hidden group flex flex-col justify-between h-full bg-(--color-bg-secondary) backdrop-blur-md ${
              isActive
                ? `${details.activeBg} ${details.glow} shadow-lg shadow-indigo-500/10`
                : 'border-(--color-border) hover:border-brand-primary/30 hover:-translate-y-0.5 shadow-sm'
            }`}
          >
            <div className="absolute top-0 right-0 w-20 h-20 bg-brand-primary/5 rounded-full blur-2xl pointer-events-none group-hover:scale-150 transition-all duration-500" />

            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-(--color-bg-tertiary) border border-(--color-border) flex items-center justify-center shadow-sm">
                  {details.icon}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-(--color-text-primary)">{details.title}</h4>
                  <span className="text-[10px] text-(--color-text-secondary)">
                    {details.walletId}
                  </span>
                </div>
              </div>
              <ChevronRight
                size={16}
                className={`text-(--color-text-secondary) group-hover:translate-x-0.5 transition-transform ${isActive ? 'rotate-90' : ''}`}
              />
            </div>

            <div className="mt-3 flex items-end justify-between">
              <div>
                <span className="text-xs text-(--color-text-secondary)">Total Balance</span>
                <div className="text-2xl font-black tracking-tight text-(--color-text-primary) mt-0.5">
                  {portfolioUtils.formatUSD(details.total)}
                </div>
              </div>
              <div className="text-right">
                {pnl.change !== 0 && (
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-0.5 border ${
                      pnl.change >= 0
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}
                  >
                    {pnl.change >= 0 ? '▲' : '▼'} {Math.abs(pnl.percent).toFixed(1)}%
                  </span>
                )}
                {percentageOfTotal > 0 && (
                  <div className="text-[10px] font-semibold text-(--color-text-secondary) mt-0.5">
                    {percentageOfTotal.toFixed(0)}% of total
                  </div>
                )}
              </div>
            </div>

            <div
              onClick={e => e.stopPropagation()}
              className="mt-4 pt-3 border-t border-(--color-border) flex items-center justify-between text-xs text-(--color-text-secondary)"
            >
              {tab === 'total' ? (
                <span className="text-[10.5px] font-medium text-brand-primary/80">
                  Unified View
                </span>
              ) : details.address ? (
                <div className="flex items-center justify-between w-full">
                  <span className="font-mono truncate max-w-[70%] text-[11px]">
                    {`${details.address.slice(0, 6)}...${details.address.slice(-6)}`}
                  </span>
                  <button
                    onClick={() => handleCopy(details.address, tab)}
                    className="p-1.5 bg-(--color-bg-tertiary) hover:bg-(--color-bg-tertiary)/80 rounded-md text-(--color-text-secondary) hover:text-(--color-text-primary) transition cursor-pointer flex items-center justify-center"
                  >
                    {isCopied ? (
                      <Check size={12} className="text-emerald-500" />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                </div>
              ) : (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    openModal();
                  }}
                  className="text-[10.5px] font-bold text-brand-primary hover:underline"
                >
                  Connect Wallet
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
