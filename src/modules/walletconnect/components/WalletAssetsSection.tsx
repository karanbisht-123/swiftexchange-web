import { AlertCircle, RefreshCw, TrendingDown, TrendingUp, Wallet, MoreHorizontal } from 'lucide-react';
import { memo, useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../constants/routes';
import { DydxDepositModal } from '../../dydx/components/DydxDepositModal';
import { useWalletAssets } from '../hooks/useWalletAssets';
import { useWalletStore } from '../store/walletConnectStore';
import { portfolioUtils } from '../utils/portfolioUtils';
import { getChainLogoUrl } from '../../evm/utils/Chainregistry';
import { type Asset } from '../store/portfolioStore';
import { FixedSizeList } from 'react-window';

const ROW_HEIGHT = 80;
const VISIBLE_HEIGHT = 500;

const getChainIcon = (asset: Asset): string | undefined => {
  const chainId = asset.chainType === 'stellar'
    ? (asset.chainName?.toLowerCase().includes('testnet') ? 9000001 : 9000000)
    : asset.chainId;
  return getChainLogoUrl(chainId || 0);
};

const Shimmer = ({ className = 'h-4 w-16' }: { className?: string }) => (
  <div className={`${className} bg-tertiary animate-pulse rounded-md`} />
);

const canTradeAsset = (asset: Asset): boolean => {
  if (asset.chainType === 'stellar') return true;
  if (asset.chainType === 'evm') {
    const symbol = asset.symbol.toUpperCase();
    return ['USDT', 'USDC'].includes(symbol);
  }
  return false;
};

const calculatePortfolioChange = (assets: Asset[]): number => {
  let totalValue = 0;
  let weightedChange = 0;

  for (const asset of assets) {
    if (asset.balance && (asset.current_price || 0) > 0) {
      const assetValue = asset.balance * asset.current_price;
      totalValue += assetValue;
      weightedChange += assetValue * (asset.price_change_percentage_24h || 0);
    }
  }

  if (totalValue === 0) return 0;
  return weightedChange / totalValue;
};

const AssetMoreActions = ({ onSend, onReceive }: { onSend: () => void; onReceive: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`btn btn-secondary btn-sm p-1.5 rounded-md transition-colors ${isOpen ? 'bg-tertiary' : ''}`}
      >
        <MoreHorizontal size={18} className="text-primary" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-32 bg-secondary border border-color rounded-xl shadow-premium z-20 flex flex-col py-1 animate-slide-up origin-top-right">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
              onReceive();
            }}
            className="px-4 py-2 text-left text-sm font-medium hover:bg-hover active:bg-tertiary transition-colors text-primary"
          >
            Receive
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
              onSend();
            }}
            className="px-4 py-2 text-left text-sm font-medium hover:bg-hover active:bg-tertiary transition-colors text-primary"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
};

const AssetRow = memo(
  ({
    asset,
    onTrade,
    onPerp,
    onSend,
    onReceive,
    style,
  }: {
    asset: Asset;
    onTrade: (asset: Asset) => void;
    onPerp: (asset: Asset) => void;
    onSend: (asset: Asset) => void;
    onReceive: (asset: Asset) => void;
    style?: React.CSSProperties;
  }) => {
    const isPriceLoading = asset.current_price === 0 && (asset.balance || 0) > 0;
    const isBalanceLoading = asset.balance === null;
    const usdValue = (asset.balance || 0) * (asset.current_price || 0);
    const canTrade = canTradeAsset(asset);
    const canPrep = asset.chainType !== 'stellar';

    return (
      <div style={style} className="lg:px-4 px-0 py-2 border-b border-color hover:bg-hover transition-colors box-border">
        <div className="flex items-center justify-between h-full">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative shrink-0">
              <img
                src={asset.image}
                className="w-10 h-10 rounded-full bg-primary"
                alt={asset.symbol}
                onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${asset.symbol}&background=random` }}
              />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center bg-gray-100 justify-center border border-color">
                {getChainIcon(asset) ? (
                  <img
                    src={getChainIcon(asset)}
                    alt={asset.chainName}
                    className="w-3.5 h-3.5 rounded-full"
                  />
                ) : (
                  <span className="text-[8px] font-bold text-primary">
                    {asset.chainType === 'stellar' ? '★' : asset.chainName?.[0] || '?'}
                  </span>
                )}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-base text-primary">{asset.symbol}</span>
                <span className="text-xs text-muted bg-secondary truncate">{asset.chainName}</span>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                {isPriceLoading ? (
                  <Shimmer className="h-3 w-16" />
                ) : (
                  <>
                    <span className="text-sm text-secondary font-medium">
                      ${asset.current_price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                    {asset.price_change_percentage_24h !== 0 && (
                      <span
                        className={`text-xs font-medium ${asset.price_change_percentage_24h >= 0 ? 'price-up' : 'price-down'}`}
                      >
                        {asset.price_change_percentage_24h >= 0 ? '+' : ''}
                        {asset.price_change_percentage_24h?.toFixed(2)}%
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right shrink-0">
              <div className="text-base font-semibold text-primary">
                {isBalanceLoading ? (
                  <Shimmer className="h-4 w-16 ml-auto" />
                ) : (
                  portfolioUtils.formatBalance(asset.balance)
                )}
              </div>
              <div className="text-sm text-muted mt-0.5">
                {isBalanceLoading ? (
                  <Shimmer className="h-3 w-16 ml-auto" />
                ) : (
                  portfolioUtils.formatUSD(usdValue)
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canTrade && (
                <button onClick={() => onTrade(asset)} className="btn btn-primary btn-sm rounded-md px-3">
                  Spot
                </button>
              )}
              {canPrep && (
                <button onClick={() => onPerp(asset)} className="btn btn-primary btn-sm rounded-md px-3">
                  Prep
                </button>
              )}
              <AssetMoreActions
                onSend={() => onSend(asset)}
                onReceive={() => onReceive(asset)}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
);

AssetRow.displayName = 'AssetRow';

const SkeletonRows = () => (
  <div className="px-4 py-8">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex items-center gap-3 py-4 border-b border-color">
        <Shimmer className="w-10 h-10 rounded-full" />
        <div className="flex-1">
          <Shimmer className="h-4 w-20 mb-2" />
          <Shimmer className="h-3 w-16" />
        </div>
        <div className="text-right">
          <Shimmer className="h-4 w-16 mb-2 ml-auto" />
          <Shimmer className="h-3 w-12 ml-auto" />
        </div>
      </div>
    ))}
  </div>
);

const WalletAssetsSection = () => {
  const navigate = useNavigate();
  const { network } = useWalletStore();
  const { assets, loading, isRefreshing, totalValue, hasError, errorMessage, refetch } = useWalletAssets(network);

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const filteredAssets = useMemo(
    () => assets.filter((asset) => (asset.balance || 0) > 0),
    [assets]
  );

  const portfolioChange = useMemo(() => calculatePortfolioChange(filteredAssets), [filteredAssets]);
  const isPositive = portfolioChange >= 0;

  const handleTrade = useCallback((asset: Asset) => {
    if (asset.chainType === 'stellar') {
      navigate(ROUTES.TRADING_STEALLR, {
        state: { selectedAsset: asset, fromTradeButton: true },
      });
      return;
    }
    navigate(ROUTES.BRIDGE, { state: { selectedAsset: asset } });
  }, [navigate]);

  const handleSend = useCallback((asset: Asset) => {
    const chainId = asset.chainType === 'stellar' ? 'stellar' : asset.chainId;
    navigate(`${ROUTES.SEND}?asset=${asset.symbol}&chainId=${chainId}`);
  }, [navigate]);

  const handleReceive = useCallback((asset: Asset) => {
    const chainId = asset.chainType === 'stellar' ? 'stellar' : asset.chainId;
    navigate(`${ROUTES.RECEIVE}?asset=${asset.symbol}&chainId=${chainId}`);
  }, [navigate]);

  const handlePerp = useCallback((asset: Asset) => {
    setSelectedAsset(asset);
    setIsDepositModalOpen(true);
  }, []);

  const handleCloseDepositModal = useCallback(() => {
    setIsDepositModalOpen(false);
    setSelectedAsset(null);
  }, []);

  const Row = useCallback(({ index, style }: { index: number, style: React.CSSProperties }) => (
    <AssetRow
      asset={filteredAssets[index]}
      onTrade={handleTrade}
      onPerp={handlePerp}
      onSend={handleSend}
      onReceive={handleReceive}
      style={style}
    />
  ), [filteredAssets, handleTrade, handlePerp, handleSend, handleReceive]);

  return (
    <>
      <section className="card mt-1 lg:mt-3 rounded-none border-none lg:rounded-lg overflow-hidden">
        <div className="card-header flex justify-between items-center px-4 pt-6 pb-4">
          <div>
            <div className="flex items-center gap-2 text-muted mb-2">
              <Wallet size={16} />
              <span className="text-xs font-bold uppercase tracking-wider">Portfolio</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="heading-3">
                {loading ? (
                  <Shimmer className="h-10 w-40" />
                ) : (
                  portfolioUtils.formatUSD(totalValue)
                )}
              </span>
              {!loading && filteredAssets.length > 0 && (
                <div
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold ${isPositive
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-red-500/10 text-red-500'
                    }`}
                >
                  {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  <span>
                    {isPositive ? '+' : ''}
                    {portfolioChange.toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
            <span className="text-xs text-muted mt-1 block">24h dynamic portfolio performance</span>
          </div>
          <button
            onClick={refetch}
            disabled={loading || isRefreshing}
            className="btn btn-ghost btn-md hover:bg-hover rounded-full p-2 relative"
            title="Refresh portfolio"
          >
            <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing && assets.length > 0 && (
               <span className="absolute -top-1 -right-1 flex h-3 w-3">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-500"></span>
               </span>
            )}
          </button>
        </div>

        <div className="min-h-[400px]">
          {hasError && filteredAssets.length === 0 ? (
            <div className="px-6 py-20 text-center flex flex-col items-center justify-center">
              <AlertCircle className="w-12 h-12 text-red-500 mb-4 opacity-80" />
              <h4 className="font-semibold text-primary mb-2 text-lg">Connection Sync Issue</h4>
              <p className="text-sm text-secondary mb-8 max-w-sm">
                {errorMessage || 'Unable to sync your portfolio data. Please check your network or try again.'}
              </p>
              <button
                onClick={refetch}
                disabled={loading}
                className="btn btn-primary px-8 py-2.5 flex items-center gap-3 rounded-xl shadow-md"
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Refreshing...' : 'Retry Connection'}
              </button>
            </div>
          ) : (filteredAssets.length === 0 && loading) ? (
            <SkeletonRows />
          ) : (filteredAssets.length === 0 && !loading) ? (
            <div className="px-6 py-24 text-center">
              <div className="bg-secondary w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Wallet size={40} className="text-muted opacity-40" />
              </div>
              <p className="text-lg font-medium text-primary mb-1">No Assets Detected</p>
              <p className="text-sm text-muted">You don't have any assets in this wallet yet.</p>
            </div>
          ) : (
            <div className="w-full" style={{ height: Math.min(filteredAssets.length * ROW_HEIGHT, VISIBLE_HEIGHT) }}>
              <FixedSizeList
                height={Math.min(filteredAssets.length * ROW_HEIGHT, VISIBLE_HEIGHT)}
                itemCount={filteredAssets.length}
                itemSize={ROW_HEIGHT}
                width="100%"
                className="hide-scrollbar"
              >
                {Row}
              </FixedSizeList>
            </div>
          )}
          {isRefreshing && assets.length > 0 && (
             <div className="px-4 py-2 bg-secondary/30 backdrop-blur-sm border-t border-color flex justify-center items-center gap-2">
                <RefreshCw size={12} className="animate-spin text-muted" />
                <span className="text-[10px] uppercase font-bold tracking-widest text-muted">Updating Portfolio...</span>
             </div>
          )}
        </div>
      </section>

      {selectedAsset && isDepositModalOpen && (
        <DydxDepositModal
          isOpen={isDepositModalOpen}
          onClose={handleCloseDepositModal}
          initialAsset={selectedAsset}
        />
      )}
    </>
  );
};

export default memo(WalletAssetsSection);