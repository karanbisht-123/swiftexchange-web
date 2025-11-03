import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { type FC, useEffect, useRef, useState } from 'react';

import TradeAssetModal from '../../evm/feature/one-tap-pay/TradeAssetModal';

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  image: string;
  balance: number;
  volume: number;
  current_price: number;
  price_change_percentage_24h: number;
}

interface AssetsSectionProps {
  title?: string;
  assets?: Asset[];
}

const WalletAssetsSection: FC<AssetsSectionProps> = ({
  title = 'My Assets',
  assets: propAssets,
}) => {
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const touchStartX = useRef<number>(0);
  const touchCurrentX = useRef<number>(0);

  const defaultAssets: Asset[] = [
    {
      id: 'bitcoin',
      symbol: 'btc',
      name: 'Bitcoin',
      image: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png?1696501400',
      current_price: 119527,
      price_change_percentage_24h: 1.06594,
      balance: 0.0234,
      volume: 34180968386,
    },
    {
      id: 'ethereum',
      symbol: 'eth',
      name: 'Ethereum',
      image: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628',
      current_price: 3934.92,
      price_change_percentage_24h: 3.87911,
      balance: 1.5,
      volume: 33534609694,
    },
    {
      id: 'ripple',
      symbol: 'xrp',
      name: 'XRP',
      image:
        'https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png?1696501442',
      current_price: 3.31,
      price_change_percentage_24h: 2.70115,
      balance: 500,
      volume: 5993615785,
    },
    {
      id: 'solana',
      symbol: 'sol',
      name: 'Solana',
      image: 'https://coin-images.coingecko.com/coins/images/4128/large/solana.png?1718769756',
      current_price: 193.83,
      price_change_percentage_24h: 3.2384,
      balance: 10.5,
      volume: 8983246094,
    },
  ];

  const assets = Array.isArray(propAssets) && propAssets.length > 0 ? propAssets : defaultAssets;

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
    setSelectedAsset(asset);
    setTradeModalOpen(true);
    setSwipedId(null);
  };

  const handleBuyClick = (asset: Asset) => {
    console.log(asset);
    window.open('https://buy.example.com', '_blank');
    setSwipedId(null);
  };

  const handleCloseModal = () => {
    setTradeModalOpen(false);
    setSelectedAsset(null);
  };

  useEffect(() => {
    const handleClickOutside = () => {
      setSwipedId(null);
    };

    if (swipedId) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [swipedId]);

  return (
    <section className="bg-secondary rounded-2xl mt-2 overflow-hidden shadow-lg">
      {title && (
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-xl font-bold text-primary">{title}</h2>
        </div>
      )}

      <div className="overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-4 px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-black/5 dark:bg-white/5">
          <div>Asset</div>
          <div>Balance</div>
          <div className="text-center">Hig / Low</div>
          <div className="text-right">Value</div>
          <div className="hidden sm:block text-right">Actions</div>
        </div>

        {/* Rows */}
        {assets.map((asset, index) => {
          const isSwiped = swipedId === asset.id;
          const usdValue = (asset.balance || 0) * (asset.current_price || 0);

          const high = (asset.current_price || 0) * 1.05;
          const low = (asset.current_price || 0) * 0.95;

          return (
            <div
              key={asset.id}
              className={`relative ${
                index !== assets.length - 1 ? 'border-b border-color/50' : ''
              } hover:bg-black/5 dark:hover:bg-white/5 transition-colors`}
            >
              {/* Swipe buttons (mobile only) */}
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
                <button
                  onClick={() => handleBuyClick(asset)}
                  className="btn-success btn-sm px-5 py-2 rounded-full shadow-md"
                >
                  Buy
                </button>
              </div>

              {/* Row */}
              <div
                className={`
                  grid grid-cols-4 sm:grid-cols-5 items-center gap-4 px-5 py-4
                  transition-transform duration-200 ease-out
                  ${isSwiped ? '-translate-x-32 sm:translate-x-0' : 'translate-x-0'}
                `}
                onTouchStart={e => handleTouchStart(e)}
                onTouchMove={e => handleTouchMove(e, asset.id)}
                onTouchEnd={handleTouchEnd}
              >
                {/* Asset */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative flex-shrink-0">
                    <img
                      src={asset.image}
                      alt={asset.name}
                      className="w-11 h-11 rounded-full ring-2 ring-gray-200/50 dark:ring-gray-700/50 bg-white"
                      onError={e => {
                        e.currentTarget.src =
                          'https://via.placeholder.com/44/cccccc/666666?text=' +
                          asset.symbol.toUpperCase();
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-primary text-sm truncate">{asset.name}</div>
                    <span className="text-xs text-gray-500 uppercase font-medium">
                      {asset.symbol}
                    </span>
                  </div>
                </div>

                {/* Balance */}
                <div className="text-sm font-medium text-secondary">
                  <div className="truncate">
                    {asset.balance.toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                    })}
                  </div>
                  <span className="text-xs text-gray-400">{asset.symbol.toUpperCase()}</span>
                </div>

                {/* High / Low */}
                <div className="text-center">
                  <div className="text-xs font-semibold text-green-500">${high.toFixed(2)}</div>
                  <div className="text-xs font-semibold text-red-500">${low.toFixed(2)}</div>
                </div>

                {/* Value */}
                <div className="text-right">
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
                </div>

                <div className="hidden sm:flex justify-end gap-2">
                  <button onClick={() => handleTradeClick(asset)} className="btn-primary btn-sm">
                    Trade
                  </button>
                  <button onClick={() => handleBuyClick(asset)} className="btn-success btn-sm">
                    Buy
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedAsset && (
        <TradeAssetModal
          isOpen={tradeModalOpen}
          onClose={handleCloseModal}
          assetName={selectedAsset.name}
        />
      )}
    </section>
  );
};

export default WalletAssetsSection;
