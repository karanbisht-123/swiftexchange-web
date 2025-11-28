import { ArrowDownRight, ArrowUpRight, Clock, RefreshCw } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { type FC, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../constants/routes';
import { type Asset, useWalletAssets } from '../hooks/useWalletAssets';

interface AssetsSectionProps {
  title?: string;
}

const WalletAssetsSection: FC<AssetsSectionProps> = ({ title = 'My Assets' }) => {
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigate = useNavigate();
  const { assets, loading, refetch } = useWalletAssets();

  const touchStartX = useRef<number>(0);
  const touchCurrentX = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent, id: string) => {
    touchCurrentX.current = e.touches[0].clientX;
    const diff = touchStartX.current - touchCurrentX.current;

    if (diff > 50) {
      setSwipedId(id);
    } else if (diff < -20) {
      setSwipedId(null);
    }
  };

  const handleTouchEnd = () => {
    touchStartX.current = 0;
    touchCurrentX.current = 0;
  };

  const handleTradeClick = (asset: Asset) => {
    // Navigate to trading page with asset info and flag that we came from trade button
    // This will handle pairs like ETH/USDC, BNB/USDC, XLM/USDC via Stellar trade
    navigate(ROUTES.TRADING_STEALLR, {
      state: {
        selectedAsset: asset,
        fromTradeButton: true,
      },
    });
    setSwipedId(null);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  if (loading && assets.length === 0) {
    return (
      <section className="bg-secondary rounded-2xl mt-2 overflow-hidden shadow-lg flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </section>
    );
  }

  if (assets.length === 0) {
    return (
      <section className="bg-secondary rounded-2xl mt-2 overflow-hidden shadow-lg text-center py-8">
        <p className="text-muted">No assets found. Connect a wallet to view your portfolio.</p>
      </section>
    );
  }

  return (
    <section className="bg-secondary rounded-2xl mt-2 overflow-hidden shadow-lg">
      {title && (
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold text-primary">{title}</h2>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh balances"
          >
            <RefreshCw
              size={18}
              className={`text-gray-500 ${isRefreshing ? 'animate-spin' : ''}`}
            />
          </button>
        </div>
      )}

      <div className="overflow-hidden">
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-4 px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-black/5 dark:bg-white/5">
          <div>Asset</div>
          <div>Balance</div>
          <div className="text-center">High / Low</div>
          <div className="text-right">Value</div>
          <div className="hidden sm:block text-right">Actions</div>
        </div>

        {assets.map((asset, index) => {
          const isSwiped = swipedId === asset.id;
          const usdValue = (asset.balance || 0) * (asset.current_price || 0);

          const high = (asset.current_price || 0) * 1.05;
          const low = (asset.current_price || 0) * 0.95;

          const canTrade =
            !asset.isComingSoon && ['ETH', 'BNB', 'XLM'].includes(asset.symbol.toUpperCase());

          // Always show all assets
          return (
            <div
              key={asset.id}
              className={`relative ${
                index !== assets.length - 1 ? 'border-b border-color/50' : ''
              } ${
                asset.isComingSoon
                  ? 'opacity-75 bg-gradient-to-r from-transparent via-gray-50/5 to-transparent'
                  : 'hover:bg-black/5 dark:hover:bg-white/5'
              } transition-colors`}
            >
              {canTrade && (
                <div
                  className={`
                    absolute right-0 top-0 bottom-0 flex items-center gap-2 px-4
                    transition-opacity duration-200
                    ${isSwiped ? 'opacity-100' : 'opacity-0 pointer-events-none'}
                  `}
                >
                  <button
                    onClick={() => handleTradeClick(asset)}
                    className="btn-primary btn-sm px-5 py-2 rounded-full shadow-md"
                  >
                    Trade
                  </button>
                </div>
              )}

              {/* Row */}
              <div
                className={`
                  grid grid-cols-4 sm:grid-cols-5 items-center gap-4 px-5 py-4
                  transition-transform duration-200 ease-out
                  ${isSwiped && canTrade ? '-translate-x-32 sm:translate-x-0' : 'translate-x-0'}
                `}
                onTouchStart={e => canTrade && handleTouchStart(e)}
                onTouchMove={e => canTrade && handleTouchMove(e, asset.id)}
                onTouchEnd={canTrade ? handleTouchEnd : undefined}
              >
                {/* Asset */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative flex-shrink-0">
                    <img
                      src={asset.image}
                      alt={asset.name}
                      className={`w-11 h-11 rounded-full ring-2 ring-gray-200/50 dark:ring-gray-700/50 bg-white ${
                        asset.isComingSoon ? 'grayscale' : ''
                      }`}
                      onError={e => {
                        e.currentTarget.src =
                          'https://via.placeholder.com/44/cccccc/666666?text=' +
                          asset.symbol.toUpperCase();
                      }}
                    />
                    {asset.isComingSoon && (
                      <div className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-1">
                        <Clock size={10} className="text-white" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-bold text-primary text-sm truncate">
                        {asset.name}
                        {asset.chainName && (
                          <span className="text-xs text-gray-400 ml-1">({asset.chainName})</span>
                        )}
                      </div>
                      {asset.isComingSoon && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap">
                          Coming Soon
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 uppercase font-medium">
                      {asset.symbol}
                    </span>
                  </div>
                </div>

                {/* Balance */}
                <div className="text-sm font-medium text-secondary">
                  {asset.isComingSoon ? (
                    <div className="text-gray-400">—</div>
                  ) : (
                    <>
                      <div className="truncate">
                        {asset.balance.toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        })}
                      </div>
                      <span className="text-xs text-gray-400">{asset.symbol.toUpperCase()}</span>
                    </>
                  )}
                </div>

                {/* High / Low */}
                <div className="text-center">
                  <div className="text-xs font-semibold text-green-500">${high.toFixed(2)}</div>
                  <div className="text-xs font-semibold text-red-500">${low.toFixed(2)}</div>
                </div>

                {/* Value */}
                <div className="text-right">
                  {asset.isComingSoon ? (
                    <div className="text-sm text-gray-400">—</div>
                  ) : (
                    <>
                      <div className="font-semibold text-primary text-sm">
                        $
                        {usdValue.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                      <div
                        className={`flex items-center justify-end gap-1 text-xs font-medium ${
                          asset.price_change_percentage_24h >= 0 ? 'text-green-500' : 'text-red-500'
                        }`}
                      >
                        {asset.price_change_percentage_24h >= 0 ? (
                          <ArrowUpRight size={12} />
                        ) : (
                          <ArrowDownRight size={12} />
                        )}
                        {asset.price_change_percentage_24h.toFixed(2)}%
                      </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="hidden sm:flex justify-end gap-2">
                  {asset.isComingSoon ? (
                    <button
                      disabled
                      className="btn-sm px-4 py-2 rounded-lg bg-gray-200 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed"
                    >
                      Coming Soon
                    </button>
                  ) : canTrade ? (
                    <button onClick={() => handleTradeClick(asset)} className="btn-primary btn-sm">
                      Trade
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default WalletAssetsSection;
