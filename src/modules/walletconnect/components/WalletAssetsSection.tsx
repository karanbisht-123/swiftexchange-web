import { AlertCircle, RefreshCw, TrendingDown, TrendingUp, Wallet, MoreHorizontal } from 'lucide-react';
import { memo, useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../constants/routes';
import { DydxDepositModal } from '../../dydx/components/DydxDepositModal';
import { type Asset, useWalletAssets } from '../hooks/useWalletAssets';
import { useWalletStore } from '../store/walletConnectStore';
import { portfolioUtils } from '../utils/portfolioUtils';

const CHAIN_ICONS: Record<string, string> = {
  ETH: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png',
  BNB: 'https://tokens.pancakeswap.finance/images/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c.png',
  STELLAR: 'https://coin-images.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png',
};

const getChainIcon = (asset: Asset): string | undefined => {
  if (asset.chainType === 'stellar') return CHAIN_ICONS.STELLAR;
  if (asset.chainId === 1) return CHAIN_ICONS.ETH;
  if (asset.chainId === 56) return CHAIN_ICONS.BNB;

  if (asset.chainName?.includes('Ethereum')) return CHAIN_ICONS.ETH;
  if (asset.chainName?.includes('BNB')) return CHAIN_ICONS.BNB;

  return undefined;
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
    if (asset.balance && asset.current_price > 0) {
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
  }: {
    asset: Asset;
    onTrade: (asset: Asset) => void;
    onPerp: (asset: Asset) => void;
    onSend: (asset: Asset) => void;
    onReceive: (asset: Asset) => void;
  }) => {
    const isPriceLoading = asset.current_price === 0;
    const isBalanceLoading = asset.balance === null;
    const usdValue = (asset.balance || 0) * (asset.current_price || 0);
    const canTrade = canTradeAsset(asset);
    const canPrep = asset.chainType !== 'stellar';

    return (
      <div className="lg:px-4 px-0 py-4 hover:bg-hover transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative shrink-0">
              <img src={asset.image} className="w-12 h-12 rounded-full " alt={asset.symbol} />
              <div className="absolute -bottom-1 -right-1 w-5 h-5  rounded-full flex items-center bg-gray-100 justify-center border border-color">
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
                      $
                      {asset.current_price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                    {asset.price_change_percentage_24h !== 0 && (
                      <span
                        className={`text-xs font-medium ${asset.price_change_percentage_24h >= 0 ? 'price-up' : 'price-down'
                          }`}
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
                {isPriceLoading || isBalanceLoading ? (
                  <Shimmer className="h-3 w-16 ml-auto" />
                ) : (
                  portfolioUtils.formatUSD(usdValue)
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canTrade && (
                <button
                  onClick={() => onTrade(asset)}
                  className="btn btn-primary btn-sm rounded-md"
                >
                  Spot
                </button>
              )}
              {canPrep && (
                <button
                  onClick={() => onPerp(asset)}
                  className="btn btn-primary btn-sm rounded-md"
                >
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

const WalletAssetsSection = () => {
  const navigate = useNavigate();
  const { network } = useWalletStore();
  const { assets, loading, totalValue, hasError, errorMessage, refetch } = useWalletAssets(network);

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);

  const hasLoadingPrices = assets.some(a => a.current_price === 0);
  
  const filteredAssets = useMemo(() => {
    return assets.filter(asset => (asset.balance || 0) > 0);
  }, [assets]);

  const portfolioChange = useMemo(() => calculatePortfolioChange(filteredAssets), [filteredAssets]);
  const isPositive = portfolioChange >= 0;

  const handleTrade = (asset: Asset) => {
    if (asset.chainType === 'stellar') {
      navigate(ROUTES.TRADING_STEALLR, {
        state: {
          selectedAsset: asset,
          fromTradeButton: true,
        },
      });
      return;
    }

    navigate(ROUTES.BRIDGE, { state: { selectedAsset: asset } });
  };

  const handleSend = (asset: Asset) => {
    const chainId = asset.chainType === 'stellar' ? 'stellar' : asset.chainId;
    navigate(`${ROUTES.SEND}?asset=${asset.symbol}&chainId=${chainId}`);
  };

  const handleReceive = (asset: Asset) => {
    const chainId = asset.chainType === 'stellar' ? 'stellar' : asset.chainId;
    navigate(`${ROUTES.RECEIVE}?asset=${asset.symbol}&chainId=${chainId}`);
  };

  const handlePerp = (asset: Asset) => {
    setSelectedAsset(asset);
    setIsDepositModalOpen(true);
  };

  const handleCloseDepositModal = () => {
    setIsDepositModalOpen(false);
    setSelectedAsset(null);
  };

  return (
    <>
      <section className="card mt-1 lg:mt-3 rounded-none border-none lg:rounded-lg overflow-hidden">
        <div className="card-header flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2 text-muted mb-2">
              <Wallet size={16} />
              <span className="text-xs font-bold uppercase tracking-wider">Portfolio</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="heading-3">
                {hasLoadingPrices ? (
                  <Shimmer className="h-10 w-40" />
                ) : (
                  portfolioUtils.formatUSD(totalValue)
                )}
              </span>
              {!hasLoadingPrices && filteredAssets.length > 0 && (
                <div
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm font-semibold ${isPositive
                    ? 'bg-success-bg bg-green-600 text-white'
                    : 'bg-danger-bg bg-red-600 text-white'
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
            <span className="text-xs text-muted mt-1 block">24h change</span>
          </div>
          <button
            onClick={refetch}
            disabled={loading}
            className="btn btn-ghost btn-sm"
            title="Refresh portfolio"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="">
          {hasError ? (
            <div className="px-6 py-8 text-center flex flex-col items-center justify-center">
              <AlertCircle className="w-12 h-12 text-red-500 mb-4 opacity-80" />
              <h4 className="font-semibold text-primary mb-2">Connection Error</h4>
              <p className="text-sm text-secondary mb-6 max-w-sm">
                {errorMessage ||
                  'Unable to fetch your portfolio. Please check your connection or try again later.'}
              </p>
              <button
                onClick={refetch}
                disabled={loading}
                className="btn-primary px-6 py-2 flex items-center gap-2 rounded-md"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Retrying...' : 'Retry Connection'}
              </button>
            </div>
          ) : assets.length === 0 && !loading ? (
            <div className="px-6 py-12 text-center">
              <Wallet size={48} className="mx-auto mb-4 text-muted opacity-40" />
              <p className="text-sm text-muted">No assets found in connected wallets</p>
            </div>
          ) : loading && assets.length === 0 ? (
            <div className="px-4 py-8">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3 py-4">
                  <Shimmer className="w-12 h-12 rounded-full" />
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
          ) : (
            filteredAssets.map(asset => (
              <AssetRow
                key={asset.id}
                asset={asset}
                onTrade={handleTrade}
                onPerp={handlePerp}
                onSend={handleSend}
                onReceive={handleReceive}
              />
            ))
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
