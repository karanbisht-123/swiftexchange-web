import { AlertCircle, RefreshCw, TrendingDown, TrendingUp, Wallet, MoreHorizontal, } from 'lucide-react';
import { memo, useMemo, useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../constants/routes';
import { DydxDepositModal } from '../../dydx/components/DydxDepositModal';
import { useWalletAssets } from '../hooks/useWalletAssets';
import { useWalletStore } from '../store/walletConnectStore';
import { portfolioUtils } from '../utils/portfolioUtils';
import { getChainLogoUrl } from '../../evm/utils/Chainregistry';
import { type Asset } from '../store/portfolioStore';
import { FixedSizeList } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';

const ROW_HEIGHT = 76;

const getChainIcon = (asset: Asset): string | undefined => {
  const chainId = asset.chainType === 'stellar'
    ? (asset.chainName?.toLowerCase().includes('testnet') ? 'testnet' : 'pubnet')
    : asset.chainId;
  return getChainLogoUrl(chainId || 0);
};

const Shimmer = ({ className = 'h-4 w-16' }: { className?: string }) => (
  <div className={`${className} bg-tertiary animate-pulse rounded-md`} />
);

const canTradeAsset = (asset: Asset): boolean => {
  if (asset.chainType === 'stellar') return true;
  if (asset.chainType === 'evm') return true;
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


const MobileActionSheet = ({
  asset,
  isOpen,
  onClose,
  onTrade,
  onPerp,
  onSend,
  onReceive,
}: {
  asset: Asset;
  isOpen: boolean;
  onClose: () => void;
  onTrade: () => void;
  onPerp: () => void;
  onSend: () => void;
  onReceive: () => void;
}) => {
  const canTrade = canTradeAsset(asset);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const actions = [
    ...(canTrade ? [{ label: 'Spot', icon: '🔄', color: 'bg-green-500/10', fn: onTrade }] : []),
    { label: 'Perp', icon: '📊', color: 'bg-orange-500/10', fn: onPerp },
    { label: 'Receive', icon: '📥', color: 'bg-blue-500/10', fn: onReceive },
    { label: 'Send', icon: '🚀', color: 'bg-purple-500/10', fn: onSend },
  ];

  return ReactDOM.createPortal(
    <div
      className="lg:hidden"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        background: 'rgba(0,0,0,0.5)',
        animation: 'wsFadeIn 180ms ease both',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-bg-secondary, #fff)',
          borderRadius: '32px 32px 0 0',
          animation: 'wsSlideUp 260ms cubic-bezier(0.32,0.72,0,1) both',
          paddingBottom: 'env(safe-area-inset-bottom, 16px)',
        }}
        className="bg-secondary"
      >
        {/* drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 rounded-full bg-muted opacity-20" />
        </div>

        {/* asset identity row */}
        <div className="flex items-center gap-3 px-6 py-4">
          <div className="relative">
            <img
              src={asset.image}
              className="w-11 h-11 rounded-full shadow-sm"
              alt={asset.symbol}
              onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${asset.symbol}&background=random`; }}
            />
            <div className="absolute -bottom-1 -right-1 w-[20px] h-[20px] rounded-full bg-secondary border border-color flex items-center justify-center shadow-sm">
              {getChainIcon(asset)
                ? <img src={getChainIcon(asset)} className="w-3.5 h-3.5 rounded-full" />
                : <span className="text-[8px] font-bold text-muted">{asset.chainName?.[0]}</span>
              }
            </div>
          </div>
          <div>
            <p className="font-bold text-primary text-lg leading-tight">{asset.symbol}</p>
            <p className="text-xs text-muted font-medium">{asset.chainName}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="font-bold text-primary text-base leading-tight">{portfolioUtils.formatBalance(asset.balance)}</p>
            <p className="text-xs text-muted font-medium">{portfolioUtils.formatUSD((asset.balance || 0) * (asset.current_price || 0))}</p>
          </div>
        </div>

        {/* action list — clean grid with emojis */}
        <div
          className="grid gap-2 px-4 py-4"
          style={{
            gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))`
          }}
        >
          {actions.map(({ label, icon, color, fn }) => (
            <button
              key={label}
              onClick={() => { onClose(); fn(); }}
              className="flex flex-col items-center justify-center gap-2 py-3 rounded-2xl active:bg-hover transition-all duration-200"
            >
              <div className={`w-14 h-14 flex items-center justify-center ${color} rounded-2xl text-2xl shadow-sm mb-1`}>
                {icon}
              </div>
              <span className="text-[13px] font-bold text-primary">{label}</span>
            </button>
          ))}
        </div>

        {/* divider + cancel */}
        <div className="border-t border-color mx-4 mb-2" />
        <div className="px-4 pb-2">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-hover text-primary font-semibold text-sm active:opacity-60 transition-opacity"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Desktop dropdown 
const AssetMoreActions = ({ onSend, onReceive }: { onSend: () => void; onReceive: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cb = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', cb);
    return () => document.removeEventListener('mousedown', cb);
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        className={`btn btn-secondary btn-sm p-1.5 rounded-md transition-colors ${isOpen ? 'bg-tertiary' : ''}`}
      >
        <MoreHorizontal size={18} className="text-primary" />
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-32 bg-secondary border border-color rounded-xl shadow-premium z-20 flex flex-col py-1 animate-slide-up origin-top-right">
          <button
            onClick={(e) => { e.stopPropagation(); setIsOpen(false); onReceive(); }}
            className="px-4 py-2 text-left text-sm font-medium hover:bg-hover active:bg-tertiary transition-colors text-primary"
          >
            Receive
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIsOpen(false); onSend(); }}
            className="px-4 py-2 text-left text-sm font-medium hover:bg-hover active:bg-tertiary transition-colors text-primary"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
};

//Asset Row 
const AssetRow = memo(({
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const isPriceLoading = asset.current_price === 0 && (asset.balance || 0) > 0;
  const isBalanceLoading = asset.balance === null;
  const usdValue = (asset.balance || 0) * (asset.current_price || 0);
  const canTrade = canTradeAsset(asset);

  return (
    <>
      {/* Outer: virtualized list slot */}
      <div
        style={{
          ...style,
          paddingLeft: 12,
          paddingRight: 12,
          paddingTop: 4,
          paddingBottom: 4,
          boxSizing: 'border-box',
        }}
      >
        {/* Card */}
        <div
          className="flex items-center gap-3 h-full bg-secondary rounded-xl px-3"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.05)' }}
        >
          {/* Token icon */}
          <div className="relative shrink-0">
            <img
              src={asset.image}
              className="w-9 h-9 rounded-full bg-tertiary"
              alt={asset.symbol}
              onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${asset.symbol}&background=random`; }}
            />
            <div className="absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-full bg-secondary border border-color flex items-center justify-center">
              {getChainIcon(asset)
                ? <img src={getChainIcon(asset)} alt={asset.chainName} className="w-3 h-3 rounded-full" />
                : <span className="text-[7px] font-bold text-muted">{asset.chainType === 'stellar' ? asset.chainId : asset.chainName?.[0] || '?'}</span>
              }
            </div>
          </div>

          {/* Name + price */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm text-primary">{asset.symbol}</span>
              <span className="text-[11px] text-muted truncate">{asset.chainName}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isPriceLoading ? <Shimmer className="h-3 w-14" /> : (
                <>
                  <span className="text-xs text-muted">
                    ${asset.current_price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                  {asset.price_change_percentage_24h !== 0 && (
                    <span className={`text-[11px] font-medium ${asset.price_change_percentage_24h >= 0 ? 'price-up' : 'price-down'}`}>
                      {asset.price_change_percentage_24h >= 0 ? '+' : ''}{asset.price_change_percentage_24h?.toFixed(2)}%
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Balance */}
          <div className="text-right shrink-0">
            {isBalanceLoading ? (
              <>
                <Shimmer className="h-3.5 w-14 ml-auto mb-1" />
                <Shimmer className="h-3 w-10 ml-auto" />
              </>
            ) : (
              <>
                <div className="text-sm font-semibold text-primary">{portfolioUtils.formatBalance(asset.balance)}</div>
                <div className="text-xs text-muted mt-0.5">{portfolioUtils.formatUSD(usdValue)}</div>
              </>
            )}
          </div>

          {/* Desktop actions */}
          <div className="hidden lg:flex items-center gap-2 shrink-0">
            {canTrade && (
              <button onClick={() => onTrade(asset)} className="btn btn-primary btn-sm rounded-md px-3">
                Spot
              </button>
            )}
            <button onClick={() => onPerp(asset)} className="btn btn-primary btn-sm rounded-md px-3">
              Perp
            </button>
            <AssetMoreActions onSend={() => onSend(asset)} onReceive={() => onReceive(asset)} />
          </div>

          {/* Mobile: single tap target */}
          <button
            className="lg:hidden shrink-0 p-1.5 -mr-1 rounded-lg text-muted active:bg-hover transition-colors"
            onClick={(e) => { e.stopPropagation(); setSheetOpen(true); }}
          >
            <MoreHorizontal size={20} />
          </button>
        </div>
      </div>

      {/* Sheet is portaled to document.body — never clipped by the list */}
      <MobileActionSheet
        asset={asset}
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onTrade={() => onTrade(asset)}
        onPerp={() => onPerp(asset)}
        onSend={() => onSend(asset)}
        onReceive={() => onReceive(asset)}
      />
    </>
  );
});

AssetRow.displayName = 'AssetRow';

// ─── Skeleton ─────────────────────────────────────────────────────────────────
const SkeletonRows = () => (
  <div className="flex flex-col gap-2 px-3 py-3">
    {[1, 2, 3, 4, 5].map((i) => (
      <div
        key={i}
        className="flex items-center gap-3 px-3 py-3.5 bg-secondary rounded-xl"
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.05)' }}
      >
        <Shimmer className="w-9 h-9 rounded-full shrink-0" />
        <div className="flex-1">
          <Shimmer className="h-3.5 w-16 mb-2" />
          <Shimmer className="h-3 w-12" />
        </div>
        <div>
          <Shimmer className="h-3.5 w-14 ml-auto mb-1" />
          <Shimmer className="h-3 w-10 ml-auto" />
        </div>
      </div>
    ))}
  </div>
);

//Main Section
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
      navigate(ROUTES.TRADING_STEALLR, { state: { selectedAsset: asset, fromTradeButton: true } });
      return;
    }
    navigate(ROUTES.TRADING_EVM_SWAP, { state: { selectedAsset: asset } });
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
    if (asset.chainType === 'dydx') {
      navigate(ROUTES.TRADING_DYDX_FUTURES);
      return;
    }
    if (asset.chainType === 'stellar') {
      navigate(ROUTES.TRADING_EVM_SWAP, { state: { selectedAsset: asset, isPerp: true } });
      return;
    }
    setSelectedAsset(asset);
    setIsDepositModalOpen(true);
  }, [navigate]);

  const handleCloseDepositModal = useCallback(() => {
    setIsDepositModalOpen(false);
    setSelectedAsset(null);
  }, []);

  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => (
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

      <section className="card lg:mt-3 rounded-none border-none lg:rounded-lg lg:overflow-hidden p-0">

        {/* ── Header ── */}
        <div className="flex justify-between items-start px-4 py-2 lg:px-5  shadow-md">
          <div>
            <div className="flex items-center gap-1.5 text-muted mb-1.5">
              <Wallet size={14} />
              <span className="text-[11px] font-bold uppercase tracking-widest">Portfolio</span>
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="heading-3">
                {loading ? <Shimmer className="h-8 w-36" /> : portfolioUtils.formatUSD(totalValue)}
              </span>
              {!loading && filteredAssets.length > 0 && (
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold
                  ${isPositive ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}
                >
                  {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {isPositive ? '+' : ''}{portfolioChange.toFixed(2)}%
                </div>
              )}
            </div>
            <span className="text-[11px] text-muted mt-1 block">24h performance</span>
          </div>
          <button
            onClick={refetch}
            disabled={loading || isRefreshing}
            className="btn btn-ghost rounded-full p-2 mt-0.5"
            title="Refresh"
          >
            <RefreshCw size={18} className={`text-muted ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {/* ── Body ── */}
        <div className="min-h-[400px]">
          {hasError && filteredAssets.length === 0 ? (
            <div className="px-5 py-16 text-center flex flex-col items-center">
              <AlertCircle className="w-10 h-10 text-red-500 mb-3 opacity-70" />
              <h4 className="font-semibold text-primary mb-1">Connection issue</h4>
              <p className="text-sm text-muted mb-6 max-w-xs">
                {errorMessage || 'Unable to sync portfolio. Check your connection and try again.'}
              </p>
              <button
                onClick={refetch}
                disabled={loading}
                className="btn btn-primary px-6 py-2 flex items-center gap-2 rounded-xl"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Refreshing…' : 'Retry'}
              </button>
            </div>
          ) : filteredAssets.length === 0 && loading ? (
            <SkeletonRows />
          ) : filteredAssets.length === 0 ? (
            <div className="px-5 py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-tertiary flex items-center justify-center mx-auto mb-4">
                <Wallet size={28} className="text-muted opacity-40" />
              </div>
              <p className="font-medium text-primary mb-1">No assets</p>
              <p className="text-sm text-muted">Your wallet has no balances yet.</p>
            </div>
          ) : (
            <div className="w-full h-[71svh] lg:h-[65svh] pt-1">
              <AutoSizer
                renderProp={({ height, width }) => (
                  <FixedSizeList
                    height={height || 0}
                    itemCount={filteredAssets.length}
                    itemSize={ROW_HEIGHT}
                    width={width || 0}
                    className="hide-scrollbar"
                  >
                    {Row}
                  </FixedSizeList>
                )}
              />
            </div>
          )}

          {isRefreshing && assets.length > 0 && (
            <div className="flex items-center justify-center gap-2 py-2 border-t border-color">
              <RefreshCw size={11} className="animate-spin text-muted" />
              <span className="text-[10px] uppercase tracking-widest font-bold text-muted">Updating…</span>
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