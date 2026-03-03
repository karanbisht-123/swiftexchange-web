import { RefreshCw, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../constants/routes';
import TradeAssetModal from '../../evm/feature/one-tap-pay/TradeAssetModal';
import { type Asset, useWalletAssets } from '../hooks/useWalletAssets';

import { useWalletStore } from '../store/walletConnectStore';

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

const AssetRow = memo(({ asset, onTrade }: { asset: Asset; onTrade: (asset: Asset) => void }) => {
  const isPriceLoading = asset.current_price === 0;
  const usdValue = (asset.balance || 0) * (asset.current_price || 0);
  const canTrade = canTradeAsset(asset);

  return (
    <div className="lg:px-4 px-0 py-4 hover:bg-hover transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative shrink-0">
            <img
              src={asset.image}
              className="w-12 h-12 rounded-full "
              alt={asset.symbol}
            />
            <div className="absolute -bottom-1 -right-1 w-5 h-5  rounded-full flex items-center bg-primary justify-center border border-color">
              {getChainIcon(asset) ? (
                <img src={getChainIcon(asset)} alt={asset.chainName} className="w-3.5 h-3.5 rounded-full" />
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
              {asset.balance?.toLocaleString(undefined, { maximumFractionDigits: 6 })}
            </div>
            <div className="text-sm text-muted mt-0.5">
              {isPriceLoading ? (
                <Shimmer className="h-3 w-16 ml-auto" />
              ) : (
                `$${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </div>
          </div>

          {canTrade && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onTrade(asset)}
                className="btn btn-primary btn-sm rounded-md"
              >
                Spot
              </button>
              <button
                onClick={() => { }}
                className="btn btn-primary btn-sm rounded-md"
              >
                Perp
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

AssetRow.displayName = 'AssetRow';

const WalletAssetsSection = () => {
  const navigate = useNavigate();
  const { network } = useWalletStore();
  const { assets, loading, totalValue, refetch } = useWalletAssets(network);

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);

  const hasLoadingPrices = assets.some(a => a.current_price === 0);

  const portfolioChange = useMemo(() => calculatePortfolioChange(assets), [assets]);
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

    setSelectedAsset(asset);
    setIsTradeModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsTradeModalOpen(false);
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
                  `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                )}
              </span>
              {!hasLoadingPrices && assets.length > 0 && (
                <div
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm font-semibold ${isPositive
                    ? 'bg-success-bg bg-green-600 text-success'
                    : 'bg-danger-bg bg-red-600 text-danger'
                    }`}
                >
                  {isPositive ? (
                    <TrendingUp size={14} />
                  ) : (
                    <TrendingDown size={14} />
                  )}
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
          {assets.length === 0 && !loading ? (
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
            assets.map(asset => (
              <AssetRow key={asset.id} asset={asset} onTrade={handleTrade} />
            ))
          )}
        </div>
      </section>

      {selectedAsset && selectedAsset.chainType !== 'stellar' && (
        <TradeAssetModal
          isOpen={isTradeModalOpen}
          onClose={handleCloseModal}
          assetName={selectedAsset.name}
          selectedAsset={{
            ...selectedAsset,
            balance: selectedAsset.balance ?? 0,
          }}
        />
      )}
    </>
  );
};

export default memo(WalletAssetsSection);