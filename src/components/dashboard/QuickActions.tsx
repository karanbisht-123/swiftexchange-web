import { RefreshCw, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import type { FC, JSX } from 'react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useAssetSelectorModal } from '@/modules/commonfeature/components/useAssetSelectorModal';
import { usePortfolioStore } from '@/modules/walletconnect/store/portfolioStore';
import { useWalletStore } from '@/modules/walletconnect/store/walletConnectStore';
import { portfolioUtils } from '@/modules/walletconnect/utils/portfolioUtils';

interface Action {
  name: string;
  icon: string | JSX.Element;
  color: string;
  to?: string;
  onClick?: () => void;
}

const QuickActions: FC = () => {
  const { openAssetSelector } = useAssetSelectorModal();

  // Portfolio State reading
  const network = useWalletStore(state => state.network);
  const connectedWallets = useWalletStore(state => state.connectedWallets);
  const assets = usePortfolioStore(state => state.assets);
  const loading = usePortfolioStore(state => state.isLoading);
  const isRefreshing = usePortfolioStore(state => state.isFetching);
  const refreshAssets = usePortfolioStore(state => state.refreshAssets);

  const filteredAssets = useMemo(() => assets.filter(asset => (asset.balance || 0) > 0), [assets]);
  const totalValue = useMemo(
    () => portfolioUtils.calculateTotalUSD(filteredAssets),
    [filteredAssets]
  );
  const portfolioChange = useMemo(
    () => portfolioUtils.calculatePortfolioChange(filteredAssets),
    [filteredAssets]
  );
  const isPositive = portfolioChange >= 0;

  const actions: Action[] = [
    {
      name: 'Send',
      icon: '🚀',
      color: 'bg-purple-500/10',
      onClick: () => openAssetSelector('SEND'),
    },
    {
      name: 'Receive',
      icon: '📥',
      color: 'bg-blue-500/10',
      onClick: () => openAssetSelector('RECEIVE'),
    },
    {
      name: 'Swap',
      icon: '🔄',
      color: 'bg-green-500/10',
      to: '/trading/swap',
    },
    {
      name: 'Buy',
      icon: '💳',
      color: 'bg-orange-500/10',
      to: '/trading/evm/fiat',
    },
    {
      name: 'Activity',
      icon: '🕒',
      color: 'bg-gray-500/10',
      to: '/transactions',
    },
  ];

  return (
    <div className="rounded-2xl transition-all duration-300 bg-[var(--color-bg-secondary)] border border-[var(--color-border)]/60 shadow-sm h-full flex flex-col justify-center overflow-hidden">
      <div className="flex justify-between items-stretch px-4 py-3 sm:px-5 sm:pt-4 border-b border-[var(--color-border)]/40">
        <div className="min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[var(--color-text-muted)] mb-1">
              <Wallet size={12} className="text-[var(--color-brand-primary)] shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Portfolio</span>
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)] truncate leading-none">
                {loading ? (
                  <div className="h-7 w-28 bg-[var(--color-bg-tertiary)] animate-pulse rounded-md" />
                ) : (
                  portfolioUtils.formatUSD(totalValue)
                )}
              </span>
              {!loading && filteredAssets.length > 0 && (
                <div
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0
                  ${isPositive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}
                >
                  {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {isPositive ? '+' : ''}
                  {portfolioChange.toFixed(2)}%
                </div>
              )}
            </div>
          </div>
          <span className="text-[10px] text-[var(--color-text-muted)] mt-1.5 block leading-none">
            24h performance
          </span>
        </div>

        <div className="flex flex-col items-end justify-center shrink-0 pl-2 min-h-[58px]">
          <button
            onClick={() => refreshAssets(connectedWallets, network)}
            disabled={loading || isRefreshing}
            className={`p-2 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-all active:scale-95 group mb-auto cursor-pointer ${
              loading || isRefreshing
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-[var(--color-bg-tertiary)]'
            }`}
            title="Refresh Portfolio"
          >
            <RefreshCw
              size={15}
              className={`${isRefreshing ? 'animate-spin text-[var(--color-brand-primary)]' : 'group-hover:rotate-180 transition-transform duration-500'}`}
            />
          </button>
        </div>
      </div>

      <div className="p-3 sm:p-4">
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {actions.map(action => {
            const content = (
              <>
                <div
                  className={`w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 rounded-2xl flex items-center justify-center mb-1.5 sm:mb-2
                             ${action.color} shadow-xs border border-white/5
                            transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-md group-hover:brightness-110`}
                >
                  <div className="text-xl sm:text-2xl lg:text-3xl drop-shadow-xs transition-transform duration-300 group-hover:scale-110">
                    {action.icon}
                  </div>
                </div>
                <span className="text-[11px] sm:text-xs font-bold text-[var(--color-text-primary)] tracking-tight transition-colors duration-300 group-hover:text-[var(--color-brand-primary)]">
                  {action.name}
                </span>
              </>
            );

            const className =
              'group flex flex-col items-center justify-center p-1 sm:p-2 rounded-xl transition-all duration-200 hover:bg-[var(--color-bg-tertiary)]/70 active:scale-95 cursor-pointer';

            if (action.to) {
              return (
                <Link key={action.name} to={action.to} className={className}>
                  {content}
                </Link>
              );
            }

            return (
              <button key={action.name} onClick={action.onClick} className={className}>
                {content}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default QuickActions;
