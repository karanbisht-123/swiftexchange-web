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

  // Portfolio State reading (Zero performance overhead since it just reads zustand)
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
    <div className="lg:rounded-2xl transition-all duration-300 bg-secondary shadow-sm h-full flex flex-col justify-center border-none">
      <div className="flex justify-between items-stretch px-4 py-3 lg:px-5 lg:pt-4 bg-secondary/80 rounded-t-2xl">
        <div className="min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-muted mb-1">
              <Wallet size={12} className="text-brand shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Portfolio</span>
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl lg:text-3xl font-extrabold tracking-tight text-primary truncate leading-none">
                {loading ? (
                  <div className="h-7 w-28 bg-tertiary animate-pulse rounded-md" />
                ) : (
                  portfolioUtils.formatUSD(totalValue)
                )}
              </span>
              {!loading && filteredAssets.length > 0 && (
                <div
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold shrink-0
                  ${isPositive ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}
                >
                  {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {isPositive ? '+' : ''}
                  {portfolioChange.toFixed(2)}%
                </div>
              )}
            </div>
          </div>
          <span className="text-[10px] text-muted mt-2 block leading-none">24h performance</span>
        </div>

        <div className="flex flex-col items-end justify-center shrink-0 pl-2 min-h-[58px]">
          <button
            onClick={() => refreshAssets(connectedWallets, network)}
            disabled={loading || isRefreshing}
            className={`p-2 rounded-lg text-muted hover:text-primary transition-all active:scale-95 group mb-auto ${
              loading || isRefreshing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-hover'
            }`}
            title="Refresh Portfolio"
          >
            <RefreshCw
              size={16}
              className={`${isRefreshing ? 'animate-spin text-brand' : 'group-hover:rotate-180 transition-transform duration-500'}`}
            />
          </button>
        </div>
      </div>

      <div className="p-2 px-0 lg:p-4">
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {actions.map(action => {
            const content = (
              <>
                <div
                  className={`w-14 h-14 lg:w-16 lg:h-16 rounded-2xl flex items-center justify-center mb-2.5
                             ${action.color} shadow-sm border-none
                            transition-all duration-300 group-hover:-translate-y-1.5 group-hover:shadow-md group-hover:brightness-110`}
                >
                  <div className="text-2xl lg:text-3xl drop-shadow-sm transition-transform duration-300 group-hover:scale-110">
                    {action.icon}
                  </div>
                </div>
                <span className="text-[11px] sm:text-[13px] font-bold text-primary tracking-tight transition-colors duration-300 group-hover:text-brand">
                  {action.name}
                </span>
              </>
            );

            const className =
              'group flex flex-col items-center justify-center p-1 sm:p-2 rounded-2xl transition-all duration-300 hover:bg-hover active:scale-95 cursor-pointer';

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
