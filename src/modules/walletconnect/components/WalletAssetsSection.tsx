import {
  AlertCircle,
  ArrowUpRight,
  Clock,
  MoreHorizontal,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { FixedSizeList } from 'react-window';

import { ROUTES } from '../../../constants/routes';
import { getChainLogoUrl } from '../../evm/utils/Chainregistry';
import { useIsMobile } from '../../perps/components/chart/hooks/useIsMobile';
import { useWalletAssets } from '../hooks/useWalletAssets';
import { useWalletConnect } from '../hooks/useWalletConnect';
import { type Asset } from '../store/portfolioStore';
import type { ProviderStatus } from '../store/portfolioStore';
import { useWalletStore } from '../store/walletConnectStore';
import { portfolioUtils } from '../utils/portfolioUtils';

const ROW_HEIGHT = 76;

const formatRelativeTime = (ms: number): string => {
  const diff = Math.max(0, Date.now() - ms);
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
};

// Maps provider id to a human-readable chain label
const PROVIDER_LABELS: Record<string, string> = {
  evm: 'EVM',
  stellar: 'Stellar',
  dydx: 'dYdX',
};

const ProviderStaleBanners = ({
  providerStatus,
  onRetry,
  isRetrying,
}: {
  providerStatus: Record<string, ProviderStatus>;
  onRetry: () => void;
  isRetrying: boolean;
}) => {
  const staleProviders = Object.entries(providerStatus).filter(([, ps]) => ps.status === 'stale');

  if (staleProviders.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-3 pt-2">
      {staleProviders.map(([id, ps]) => (
        <div
          key={id}
          className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
          }}
        >
          <Clock size={12} style={{ color: '#F59E0B', flexShrink: 0 }} />
          <span className="text-xs font-medium flex-1" style={{ color: '#D97706' }}>
            <span className="font-semibold">{PROVIDER_LABELS[id] ?? id}</span>
            {' data outdated'}
            {ps.lastSuccess && (
              <span className="font-normal opacity-75">
                {' · last synced '}
                {formatRelativeTime(ps.lastSuccess)}
              </span>
            )}
          </span>
          <button
            onClick={onRetry}
            disabled={isRetrying}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold transition-opacity"
            style={{
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#D97706',
              opacity: isRetrying ? 0.5 : 1,
              cursor: isRetrying ? 'not-allowed' : 'pointer',
            }}
          >
            {isRetrying ? (
              <RefreshCw size={10} className="animate-spin" />
            ) : (
              <RefreshCw size={10} />
            )}
            Retry
          </button>
        </div>
      ))}
    </div>
  );
};

const getChainIcon = (asset: Asset): string | undefined => {
  const chainId =
    asset.chainType === 'stellar'
      ? asset.chainName?.toLowerCase().includes('testnet')
        ? 'testnet'
        : 'pubnet'
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
    return () => {
      document.body.style.overflow = '';
    };
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
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: 'rgba(0,0,0,0.5)',
        animation: 'wsFadeIn 180ms ease both',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
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
              onError={e => {
                e.currentTarget.src = `https://ui-avatars.com/api/?name=${asset.symbol}&background=random`;
              }}
            />
            <div className="absolute -bottom-1 -right-1 w-[20px] h-[20px] rounded-full bg-secondary border border-color flex items-center justify-center shadow-sm">
              {getChainIcon(asset) ? (
                <img
                  src={getChainIcon(asset)}
                  alt={asset.chainName}
                  className="w-3.5 h-3.5 rounded-full"
                />
              ) : (
                <span className="text-[8px] font-bold text-muted">{asset.chainName?.[0]}</span>
              )}
            </div>
          </div>
          <div>
            <p className="font-bold text-primary text-lg leading-tight">{asset.symbol}</p>
            <p className="text-xs text-muted font-medium">{asset.chainName}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="font-bold text-primary text-base leading-tight">
              {portfolioUtils.formatBalance(asset.balance)}
            </p>
            <p className="text-xs text-muted font-medium">
              {portfolioUtils.formatUSD((asset.balance || 0) * (asset.current_price || 0))}
            </p>
          </div>
        </div>

        {/* action list — clean grid with emojis */}
        <div
          className="grid gap-2 px-4 py-4"
          style={{
            gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))`,
          }}
        >
          {actions.map(({ label, icon, color, fn }) => (
            <button
              key={label}
              onClick={() => {
                onClose();
                fn();
              }}
              className="flex flex-col items-center justify-center gap-2 py-3 rounded-2xl active:bg-hover transition-all duration-200"
            >
              <div
                className={`w-14 h-14 flex items-center justify-center ${color} rounded-2xl text-2xl shadow-sm mb-1`}
              >
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
const AssetMoreActions = ({
  onSend,
  onReceive,
  onOpenChange,
}: {
  onSend: () => void;
  onReceive: () => void;
  onOpenChange?: (open: boolean) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

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
        onClick={e => {
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
            onClick={e => {
              e.stopPropagation();
              setIsOpen(false);
              onReceive();
            }}
            className="px-4 py-2 text-left text-sm font-medium hover:bg-hover active:bg-tertiary transition-colors text-primary"
          >
            Receive
          </button>
          <button
            onClick={e => {
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

//Asset Row
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
    const [sheetOpen, setSheetOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
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
            zIndex: menuOpen ? 50 : 'auto',
          }}
        >
          {/* Card */}
          <div
            onClick={() => {
              if (window.innerWidth < 1024) setSheetOpen(true);
            }}
            className="flex items-center gap-3.5 h-full bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)]/75 border border-[var(--color-border)]/40 hover:border-[var(--color-brand-primary)]/40 rounded-xl px-3.5 cursor-pointer lg:cursor-default active:scale-[0.99] lg:active:scale-100 transition-all duration-150 shadow-xs group"
          >
            {/* Token icon */}
            <div className="relative shrink-0">
              <img
                src={asset.image}
                className="w-9 h-9 rounded-full bg-[var(--color-bg-tertiary)] group-hover:scale-105 transition-transform"
                alt={asset.symbol}
                onError={e => {
                  e.currentTarget.src = `https://ui-avatars.com/api/?name=${asset.symbol}&background=random`;
                }}
              />
              <div className="absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] flex items-center justify-center">
                {getChainIcon(asset) ? (
                  <img
                    src={getChainIcon(asset)}
                    alt={asset.chainName}
                    className="w-3 h-3 rounded-full"
                  />
                ) : (
                  <span className="text-[7px] font-bold text-[var(--color-text-muted)]">
                    {asset.chainType === 'stellar' ? asset.chainId : asset.chainName?.[0] || '?'}
                  </span>
                )}
              </div>
            </div>

            {/* Name + price */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-[var(--color-text-primary)] group-hover:text-[var(--color-brand-primary)] transition-colors">
                  {asset.symbol}
                </span>
                <span className="text-[11px] text-[var(--color-text-muted)] truncate">
                  {asset.chainName}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isPriceLoading ? (
                  <Shimmer className="h-3 w-14" />
                ) : (
                  <>
                    <span className="text-xs font-mono text-[var(--color-text-muted)]">
                      $
                      {asset.current_price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                    {asset.price_change_percentage_24h !== 0 && (
                      <span
                        className={`text-[10.5px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                          (asset.price_change_percentage_24h || 0) >= 0
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}
                      >
                        {(asset.price_change_percentage_24h || 0) >= 0 ? '+' : ''}
                        {asset.price_change_percentage_24h?.toFixed(2)}%
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
                  <div className="text-sm font-mono font-bold text-[var(--color-text-primary)]">
                    {portfolioUtils.formatBalance(asset.balance)}
                  </div>
                  <div className="text-xs font-mono text-[var(--color-text-muted)] mt-0.5">
                    {portfolioUtils.formatUSD(usdValue)}
                  </div>
                </>
              )}
            </div>

            {/* Desktop actions */}
            <div className="hidden lg:flex items-center gap-1.5 shrink-0">
              {canTrade && (
                <button
                  onClick={() => onTrade(asset)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-brand-primary)] text-[var(--color-text-primary)] hover:text-white border border-[var(--color-border)]/60 hover:border-transparent transition-all cursor-pointer shadow-xs"
                >
                  Spot
                </button>
              )}
              <button
                onClick={() => onPerp(asset)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-brand-primary)] text-[var(--color-text-primary)] hover:text-white border border-[var(--color-border)]/60 hover:border-transparent transition-all cursor-pointer shadow-xs"
              >
                Perp
              </button>
              <AssetMoreActions
                onSend={() => onSend(asset)}
                onReceive={() => onReceive(asset)}
                onOpenChange={setMenuOpen}
              />
            </div>
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
  }
);

AssetRow.displayName = 'AssetRow';

// Skeleton
const SkeletonRows = () => (
  <div className="flex flex-col gap-2 px-3 py-3">
    {[1, 2, 3, 4, 5].map(i => (
      <div key={i} className="flex items-center gap-3 px-3 py-3.5 bg-secondary rounded-xl">
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

// Smooth Sparkline SVG Component with Glowing Area Gradient
const Sparkline = ({
  data,
  isGain,
  width = 54,
  height = 22,
}: {
  data: number[];
  isGain: boolean;
  width?: number;
  height?: number;
}) => {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pad = 2;
  const h = height - pad * 2;
  const pts = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = pad + h - ((val - min) / range) * h;
    return { x, y };
  });

  // Generate smooth cubic Bézier curve
  let pathD = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const curr = pts[i];
    const next = pts[i + 1];
    const cp1x = curr.x + (next.x - curr.x) / 2;
    const cp1y = curr.y;
    const cp2x = curr.x + (next.x - curr.x) / 2;
    const cp2y = next.y;
    pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
  }

  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;
  const strokeColor = isGain ? '#10b981' : '#f43f5e';
  const gradId = `sparkGrad-${isGain ? 'gain' : 'loss'}`;
  const lastPt = pts[pts.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.35} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
        </linearGradient>
      </defs>
      {/* Area Fill */}
      <path d={areaD} fill={`url(#${gradId})`} />
      {/* Smooth Stroke */}
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Glowing End Point */}
      <circle cx={lastPt.x} cy={lastPt.y} r="2" fill={strokeColor} />
    </svg>
  );
};

const MoverCard = ({
  asset,
  type,
  onClick,
}: {
  asset: Asset;
  type: 'gain' | 'loss';
  onClick: () => void;
}) => {
  const isGain = type === 'gain';
  // const colorClass = isGain ? 'text-emerald-400' : 'text-rose-400';
  const bgBadge = isGain
    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
    : 'bg-rose-500/10 border-rose-500/20 text-rose-400';

  return (
    <div
      onClick={onClick}
      className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-2.5 p-2.5 sm:p-3 bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)]/80 rounded-xl cursor-pointer transition-all duration-150 border border-[var(--color-border)]/50 hover:border-[var(--color-brand-primary)]/40 hover:shadow-md group select-none"
    >
      {/* Mobile Top Row / Desktop Left Side */}
      <div className="flex items-start justify-between w-full lg:w-auto">
        <div className="relative shrink-0">
          <img
            src={asset.image}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[var(--color-bg-tertiary)] group-hover:scale-105 transition-transform"
            alt={asset.symbol}
            onError={e => {
              e.currentTarget.src = `https://ui-avatars.com/api/?name=${asset.symbol}&background=random`;
            }}
          />
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] flex items-center justify-center">
            {getChainIcon(asset) ? (
              <img
                src={getChainIcon(asset)}
                alt={asset.chainName}
                className="w-2.5 h-2.5 rounded-full"
              />
            ) : (
              <span className="text-[6px] font-bold text-[var(--color-text-muted)]">
                {asset.chainType === 'stellar' ? asset.chainId : asset.chainName?.[0] || '?'}
              </span>
            )}
          </div>
        </div>

        {/* Rate on Mobile (Top Right) */}
        <div
          className={`lg:hidden text-[11px] font-mono font-bold px-1.5 py-0.2 rounded-md border ${bgBadge}`}
        >
          {isGain ? '+' : ''}
          {asset.price_change_percentage_24h?.toFixed(2)}%
        </div>
      </div>

      {/* Middle area (Symbol & Price) */}
      <div className="flex-1 min-w-0 pr-1 flex flex-col lg:justify-center">
        <div className="font-bold text-[12.5px] sm:text-[13px] text-[var(--color-text-primary)] truncate group-hover:text-[var(--color-brand-primary)] transition-colors">
          {asset.symbol}
        </div>
        <div className="text-[10.5px] sm:text-[11px] font-mono text-[var(--color-text-muted)] truncate">
          {portfolioUtils.formatUSD(asset.current_price)}
        </div>
      </div>

      {/* Smooth Sparkline with Gradient Glow (Desktop & Mobile) */}
      {asset.sparkline && asset.sparkline.length > 1 && (
        <div className="shrink-0 opacity-90 hidden lg:block">
          <Sparkline data={asset.sparkline} isGain={isGain} width={54} height={22} />
        </div>
      )}

      {/* Mobile Mini Sparkline */}
      {asset.sparkline && asset.sparkline.length > 1 && (
        <div className="lg:hidden w-full pt-1 opacity-90 flex justify-center">
          <Sparkline data={asset.sparkline} isGain={isGain} width={98} height={18} />
        </div>
      )}

      {/* Rate on Desktop (Far Right) */}
      <div
        className={`hidden lg:block text-xs font-mono font-bold px-2 py-0.5 rounded-md border shrink-0 ${bgBadge}`}
      >
        {isGain ? '+' : ''}
        {asset.price_change_percentage_24h?.toFixed(2)}%
      </div>
    </div>
  );
};

//Main Section
const WalletAssetsSection = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { network } = useWalletStore();
  const { connectedWallets, openModal } = useWalletConnect();
  const { assets, loading, isRefreshing, hasError, errorMessage, providerStatus, refetch } =
    useWalletAssets(network);

  const hasAnyConnectedWallet = useMemo(
    () => Object.values(connectedWallets).some(w => !!w?.address),
    [connectedWallets]
  );

  const filteredAssets = useMemo(() => assets.filter(asset => (asset.balance || 0) > 0), [assets]);

  const topGainers = useMemo(() => {
    const unique = new Map<string, Asset>();
    [...filteredAssets]
      .filter(a => (a.price_change_percentage_24h || 0) > 0)
      .sort((a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0))
      .forEach(a => {
        if (!unique.has(a.symbol)) unique.set(a.symbol, a);
      });
    return Array.from(unique.values()).slice(0, 4);
  }, [filteredAssets]);

  const topLosers = useMemo(() => {
    const unique = new Map<string, Asset>();
    [...filteredAssets]
      .filter(a => (a.price_change_percentage_24h || 0) < 0)
      .sort((a, b) => (a.price_change_percentage_24h || 0) - (b.price_change_percentage_24h || 0))
      .forEach(a => {
        if (!unique.has(a.symbol)) unique.set(a.symbol, a);
      });
    return Array.from(unique.values()).slice(0, 4);
  }, [filteredAssets]);

  const hasMovers = topGainers.length > 0 || topLosers.length > 0;

  const handleTrade = useCallback(
    (asset: Asset) => {
      navigate(ROUTES.TRADING_EVM_SWAP, { state: { selectedAsset: asset } });
    },
    [navigate, ROUTES.TRADING_EVM_SWAP]
  );

  const handleSend = useCallback(
    (asset: Asset) => {
      const chainId = asset.chainType === 'stellar' ? 'stellar' : asset.chainId;
      navigate(`${ROUTES.SEND}?asset=${asset.symbol}&chainId=${chainId}`);
    },
    [navigate]
  );

  const handleReceive = useCallback(
    (asset: Asset) => {
      const chainId = asset.chainType === 'stellar' ? 'stellar' : asset.chainId;
      navigate(`${ROUTES.RECEIVE}?asset=${asset.symbol}&chainId=${chainId}`);
    },
    [navigate]
  );

  const handlePerp = useCallback(
    (_asset: Asset) => {
      // if (_asset.chainType === 'dydx') {
      //   navigate(ROUTES.TRADING_DYDX_FUTURES);
      //   return;
      // }
      if (_asset.chainType === 'stellar') {
        navigate(`${ROUTES.TRADING_EVM_SWAP}?asset=${_asset.symbol}`);
        return;
      }
      // setSelectedAsset(_asset);
      // setIsDepositModalOpen(true);
      navigate(ROUTES.TRADING_PERPS);
    },
    [navigate]
  );

  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => (
      <AssetRow
        asset={filteredAssets[index]}
        onTrade={handleTrade}
        onPerp={handlePerp}
        onSend={handleSend}
        onReceive={handleReceive}
        style={style}
      />
    ),
    [filteredAssets, handleTrade, handlePerp, handleSend, handleReceive]
  );

  return (
    <div className="flex flex-col lg:flex-row-reverse gap-2 sm:gap-4 lg:gap-6 lg:items-start lg:mt-3">
      {hasMovers && isMobile && (
        <div className="w-full flex flex-col gap-2 pb-1">
          <div className="flex items-center gap-1.5 px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Top Movers
            </span>
          </div>
          <div className="w-full flex overflow-x-auto hide-scrollbar gap-3 pb-2  px-2 sm:mx-0 sm:px-0">
            {[
              ...topGainers.map(a => ({ ...a, type: 'gain' as const })),
              ...topLosers.map(a => ({ ...a, type: 'loss' as const })),
            ].map(asset => (
              <div key={asset.id} className="shrink-0 w-[124px]">
                <MoverCard asset={asset} type={asset.type} onClick={() => handleTrade(asset)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {hasMovers && !isMobile && (
        <div className="w-full lg:w-[40%] shrink-0 flex flex-col gap-6 bg-secondary/80 backdrop-blur-xl rounded-xl p-4 lg:p-5 shadow-premium border-none">
          {topGainers.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted flex items-center gap-1.5 px-1">
                <TrendingUp size={14} className="text-success" /> Top Gainers
              </h3>
              <div className="flex flex-col gap-1.5">
                {topGainers.map(asset => (
                  <MoverCard
                    key={asset.id}
                    asset={asset}
                    type="gain"
                    onClick={() => handleTrade(asset)}
                  />
                ))}
              </div>
            </div>
          )}
          {topLosers.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted flex items-center gap-1.5 px-1">
                <TrendingDown size={14} className="text-danger" /> Top Losers
              </h3>
              <div className="flex flex-col gap-1.5">
                {topLosers.map(asset => (
                  <MoverCard
                    key={asset.id}
                    asset={asset}
                    type="loss"
                    onClick={() => handleTrade(asset)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <section className="flex-1 min-w-0 rounded-2xl border border-[var(--color-border)]/60 overflow-hidden p-0 shadow-sm bg-[var(--color-bg-secondary)]">
        {/* ── Portfolio List ── */}
        <div className="flex flex-col h-full bg-[var(--color-bg-secondary)]/90 backdrop-blur-xl">
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
                <p className="font-medium text-primary mb-1">
                  {hasAnyConnectedWallet ? 'No assets' : 'Connect Wallet to View Assets'}
                </p>
                <p className="text-sm text-muted mb-4 max-w-xs mx-auto">
                  {hasAnyConnectedWallet
                    ? 'Your wallet has no balances yet.'
                    : 'Connect your EVM or Stellar wallet to view balances, track your portfolio, and trade.'}
                </p>
                {hasAnyConnectedWallet ? (
                  <button
                    onClick={() => navigate(ROUTES.MY_ASSETS)}
                    className="group inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-primary font-bold text-xs uppercase tracking-wider bg-secondary border border-color hover:bg-hover active:scale-95 transition-all duration-200 cursor-pointer mx-auto shadow-sm"
                  >
                    <span>View Full Portfolio</span>
                    <ArrowUpRight
                      size={14}
                      className="text-muted group-hover:text-primary transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 shrink-0"
                    />
                  </button>
                ) : (
                  <button
                    onClick={openModal}
                    className="btn btn-primary px-6 py-2.5 rounded-xl font-bold text-sm inline-flex items-center gap-2"
                  >
                    <Wallet size={16} />
                    Connect Wallet
                  </button>
                )}
              </div>
            ) : (
              <div className="w-full h-[71svh] lg:h-[65svh] pt-1">
                {/* Per-provider stale banners — shown above the list when a refresh failed but cached data exists */}
                <ProviderStaleBanners
                  providerStatus={providerStatus}
                  onRetry={refetch}
                  isRetrying={isRefreshing}
                />
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
                <span className="text-[10px] uppercase tracking-widest font-bold text-muted">
                  Updating…
                </span>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default memo(WalletAssetsSection);
