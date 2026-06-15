import { Edit2, Loader2, RefreshCw, TrendingDown, TrendingUp, X, PlusCircle } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Notification } from '../../../../components/common/Notification';
import { Tooltip } from '../../../../components/common/Tooltip';
import { ConfirmationModal } from '../../../../components/common/ConfirmationModal';
import { getIndexerClient } from '../../client/clients';
import { useDydxData } from '../../hooks/useDydxData';
import { useDydxTrading } from '../../hooks/useDydxTrading';
import { useOraclePrices } from '../../hooks/useOraclePrices';
import { metadataService } from '../../hooks/useMetadata';
import useMarketStore from '../../store/marketStore';
import { useWebSocketStore } from '../../store/websocketStore';
import { dydxWalletService } from '../../service/dydxWalletService';
import { type Position } from '../../types/trading.types';
import {
  calculateCrossLiquidationPrice,
  calculateIsolatedLiquidationPrice,
} from '../../utils/marginCalculator';
import PriceTriggers, { type TriggerConfig } from '../PriceTriggers';
import AddMarginModal from '../shared/Addmarginmodal';

const ISOLATED_SUBACCOUNT_START = 128;

interface OraclePriceCellProps {
  oraclePrice: number | null;
  formatPrice: (value: string | number) => string;
}

const OraclePriceCell = React.memo(function OraclePriceCell({ oraclePrice, formatPrice }: OraclePriceCellProps) {
  return (
    <span className="text-blue-400 font-mono">
      {oraclePrice !== null ? `$${formatPrice(oraclePrice)}` : '—'}
    </span>
  );
});

interface PnlCellProps {
  oraclePrice: number | null;
  margin: number;
  entryPrice: number;
  size: number;
  mobile?: boolean;
}

const PnlCell = React.memo(function PnlCell({ oraclePrice, margin, entryPrice, size, mobile = false }: PnlCellProps) {
  const unrealizedPnl = oraclePrice !== null && entryPrice > 0
    ? size * (oraclePrice - entryPrice)
    : 0;

  const pnlPercentage = margin > 0 ? (unrealizedPnl / margin) * 100 : 0;
  const isPositive = unrealizedPnl >= 0;
  const formatted = unrealizedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (mobile) {
    return (
      <div className={`font-medium font-mono ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
        <div>{isPositive ? '+' : ''}${formatted}</div>
        <div className="text-[9px] opacity-80">({pnlPercentage.toFixed(2)}%)</div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col font-mono ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
      <span>{isPositive ? '+' : ''}${formatted}</span>
      <span className="text-[9px] opacity-80">({pnlPercentage.toFixed(2)}%)</span>
    </div>
  );
});

interface RefreshAllButtonProps {
  markets: string[];
  label?: boolean;
}

const RefreshAllButton = React.memo(function RefreshAllButton({ markets, label = false }: RefreshAllButtonProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const marketsRef = useRef(markets);
  marketsRef.current = markets;

  const handleClick = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.allSettled(
        marketsRef.current.map(ticker =>
          getIndexerClient()
            .markets.getPerpetualMarkets(ticker)
            .then((res: any) => {
              const raw = res?.markets?.[ticker];
              if (!raw) return;
              useWebSocketStore.getState().updateMarket(ticker, {
                ticker,
                oraclePrice: raw.oraclePrice ?? '0',
                priceChange24H: raw.priceChange24H ?? '0',
                volume24H: raw.volume24H ?? '0',
                openInterest: raw.openInterest ?? '0',
                nextFundingRate: raw.nextFundingRate ?? '0',
                lastUpdate: Date.now(),
              });
            })
            .catch(() => { })
        )
      );
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  if (label) {
    return (
      <button
        onClick={handleClick}
        disabled={isRefreshing}
        className="flex items-center justify-center gap-1.5 py-2 px-3 bg-secondary hover:bg-hover border border-color text-muted hover:text-primary rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
        {isRefreshing ? 'Refreshing...' : 'Refresh P&L'}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={isRefreshing}
      className="p-0.5 hover:bg-secondary rounded text-muted hover:text-primary transition-all disabled:opacity-40"
    >
      <RefreshCw size={9} className={isRefreshing ? 'animate-spin' : ''} />
    </button>
  );
});

interface PositionRowProps {
  position: Position;
  metrics: ReturnType<typeof computePositionMetrics>;
  oraclePrice: number | null;
  isClosing: boolean;
  onEdit: (position: Position) => void;
  onClose: (position: Position) => void;
  onAddMargin: (position: Position) => void;
  getMarketIcon: (market: string) => React.ReactNode;
  formatPrice: (value: string | number) => string;
}

const PositionRow = React.memo(function PositionRow({
  position,
  metrics,
  oraclePrice,
  isClosing,
  onEdit,
  onClose,
  onAddMargin,
  getMarketIcon,
  formatPrice,
}: PositionRowProps) {
  const isIsolated = (position.subaccountNumber ?? 0) >= ISOLATED_SUBACCOUNT_START;

  return (
    <tr className="border-b border-color hover:bg-hover transition-colors">
      <td className="p-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
            {getMarketIcon(position.market)}
          </div>
          <span className="font-bold text-primary">{position.market}</span>
        </div>
      </td>

      <td className="p-3">
        <span className="px-1.5 py-1 rounded text-[10px] font-bold bg-secondary text-primary">
          {metrics.leverage.toFixed(1)}×
        </span>
      </td>

      <td className="p-3">
        <span className="px-1.5 py-1 rounded text-[10px] font-medium bg-secondary text-primary">
          {metrics.marginType}
        </span>
      </td>

      <td className="p-3 text-right text-primary font-mono">
        {metrics.absSize.toFixed(4)}
      </td>

      <td className="p-3 text-right text-primary font-mono">
        ${formatPrice(metrics.notional)}
      </td>

      <td className="p-3 text-right">
        <PnlCell
          oraclePrice={oraclePrice}
          margin={metrics.margin}
          entryPrice={metrics.entryPrice}
          size={parseFloat(position.size)}
        />
      </td>

      <td className="p-3 text-right font-mono">
        <div className="flex items-center justify-end gap-1.5 text-primary">
          <span>${formatPrice(metrics.margin)}</span>
          {isIsolated && (
            <button
              onClick={() => onAddMargin(position)}
              disabled={isClosing}
              className="p-1 hover:bg-blue-900/30 rounded text-muted hover:text-blue-400 transition-all disabled:opacity-50"
              title="Add Margin"
            >
              <PlusCircle size={12} />
            </button>
          )}
        </div>
      </td>

      <td className="p-3 text-right text-muted font-mono">
        ${formatPrice(metrics.entryPrice)}
      </td>

      <td className="p-3 text-right">
        <OraclePriceCell oraclePrice={oraclePrice} formatPrice={formatPrice} />
      </td>

      <td className="p-3 text-right text-orange-400 font-mono">
        ${metrics.liquidationPrice ? formatPrice(metrics.liquidationPrice) : '—'}
      </td>

      <td className="p-3 text-right text-muted font-mono">
        {parseFloat(position.netFunding || '0').toFixed(4)}
      </td>

      <td className="p-3 text-center">
        <div className="flex justify-center gap-1.5">
          <button
            onClick={() => onEdit(position)}
            disabled={isClosing}
            className="p-1.5 bg-secondary hover:bg-hover rounded text-muted hover:text-primary transition-all disabled:opacity-50"
            title="Set TP/SL"
          >
            <Edit2 size={12} />
          </button>
          <button
            onClick={() => onClose(position)}
            disabled={isClosing}
            className="p-1.5 bg-secondary hover:bg-red-900/40 rounded text-muted hover:text-red-400 transition-all disabled:opacity-50"
            title="Close Position"
          >
            {isClosing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <X size={12} />
            )}
          </button>
        </div>
      </td>
    </tr>
  );
});

interface PositionCardProps {
  position: Position;
  metrics: ReturnType<typeof computePositionMetrics>;
  oraclePrice: number | null;
  isClosing: boolean;
  onEdit: (position: Position) => void;
  onClose: (position: Position) => void;
  onAddMargin: (position: Position) => void;
  getMarketIcon: (market: string) => React.ReactNode;
  formatPrice: (value: string | number) => string;
}

const PositionCard = React.memo(function PositionCard({
  position,
  metrics,
  oraclePrice,
  isClosing,
  onEdit,
  onClose,
  onAddMargin,
  getMarketIcon,
  formatPrice,
}: PositionCardProps) {
  const isShort = position.side === 'SHORT';
  const isIsolated = (position.subaccountNumber ?? 0) >= ISOLATED_SUBACCOUNT_START;

  return (
    <div className="bg-secondary border border-color rounded-lg p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center overflow-hidden">
            {getMarketIcon(position.market)}
          </div>
          <span className="font-bold text-primary">{position.market}</span>
          <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-yellow-500/10 text-yellow-400">
            {metrics.leverage.toFixed(1)}×
          </span>
          <span className="px-1 py-0.5 rounded text-[9px] font-medium bg-secondary text-primary">
            {metrics.marginType}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${isShort ? 'text-red-400 bg-red-400/10' : 'text-green-400 bg-green-400/10'}`}
          >
            {isShort ? <TrendingDown size={10} /> : <TrendingUp size={10} />}
            {position.side}
          </div>
          <button
            onClick={() => onEdit(position)}
            disabled={isClosing}
            className="p-1.5 bg-primary hover:bg-hover rounded text-muted hover:text-primary transition-all disabled:opacity-50"
            title="Set TP/SL"
          >
            <Edit2 size={12} />
          </button>
          <button
            onClick={() => onClose(position)}
            disabled={isClosing}
            className="p-1.5 bg-primary hover:bg-red-900/40 rounded text-muted hover:text-red-400 transition-all disabled:opacity-50"
            title="Close Position"
          >
            {isClosing ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
          </button>
        </div>
      </div>

      <div className="border-t border-dashed border-color pt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted text-[9px] uppercase tracking-wide font-medium">Size</span>
          <span className="text-primary font-medium font-mono">{metrics.absSize.toFixed(4)}</span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-muted text-[9px] uppercase tracking-wide font-medium">Value</span>
          <span className="text-primary font-medium font-mono">${formatPrice(metrics.notional)}</span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-muted text-[9px] uppercase tracking-wide font-medium">Avg Open</span>
          <span className="text-primary font-medium font-mono">${formatPrice(metrics.entryPrice)}</span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-muted text-[9px] uppercase tracking-wide font-medium">Oracle</span>
          <OraclePriceCell oraclePrice={oraclePrice} formatPrice={formatPrice} />
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-muted text-[9px] uppercase tracking-wide font-medium">Margin</span>
          <div className="flex items-center gap-1 font-medium font-mono">
            <span className="text-primary">${formatPrice(metrics.margin)}</span>
            {isIsolated && (
              <button
                onClick={() => onAddMargin(position)}
                disabled={isClosing}
                className="p-1 hover:bg-blue-900/30 rounded text-muted hover:text-blue-400 transition-all disabled:opacity-50"
                title="Add Margin"
              >
                <PlusCircle size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-muted text-[9px] uppercase tracking-wide font-medium">Liq Price</span>
          <span className="text-orange-400 font-medium font-mono">
            ${metrics.liquidationPrice ? formatPrice(metrics.liquidationPrice) : '—'}
          </span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-muted text-[9px] uppercase tracking-wide font-medium flex items-center gap-1">
            Unrealized P&L
          </span>
          <PnlCell
            oraclePrice={oraclePrice}
            margin={metrics.margin}
            entryPrice={metrics.entryPrice}
            size={parseFloat(position.size)}
            mobile
          />
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-muted text-[9px] uppercase tracking-wide font-medium">Funding</span>
          <span className="text-primary font-medium font-mono">
            {parseFloat(position.netFunding || '0').toFixed(4)}
          </span>
        </div>
      </div>
    </div>
  );
});

interface PositionMetrics {
  absSize: number;
  entryPrice: number;
  oraclePrice: number;
  notional: number;
  imf: number;
  mmf: number;
  leverage: number;
  margin: number;
  marginType: string;
  liquidationPrice: number | null;
}

function computePositionMetrics(
  position: Position,
  marketCache: Record<string, any>,
  childSubaccounts: any[],
  positions: Position[],
  isolatedEquityBySubaccount: Map<number, number>,
  liveOraclePrice?: number,
): PositionMetrics {
  const rawSize = parseFloat(position.size);
  const absSize = Math.abs(rawSize);
  const entryPrice = parseFloat(position.entryPrice);
  const mktData = marketCache[position.market];
  const cachedOraclePrice = mktData ? parseFloat(mktData.oraclePrice) : entryPrice;
  const oraclePrice = liveOraclePrice != null && liveOraclePrice > 0 ? liveOraclePrice : cachedOraclePrice;
  const imf = mktData?.initialMarginFraction ? parseFloat(mktData.initialMarginFraction) : 0.05;
  const mmf = mktData?.maintenanceMarginFraction
    ? parseFloat(mktData.maintenanceMarginFraction)
    : 0.03;

  const notional = absSize * oraclePrice;
  const maxLeverage = imf > 0 ? Math.floor(1 / imf) : 20;

  const isIsolated = (position.subaccountNumber ?? 0) >= ISOLATED_SUBACCOUNT_START;
  const marginType = isIsolated ? 'Isolated' : 'Cross';

  let leverage: number;
  let margin: number;

  if (isIsolated) {
    margin = isolatedEquityBySubaccount.get(position.subaccountNumber ?? 0) ?? 0;
    leverage = margin > 0 ? Math.min(notional / margin, maxLeverage) : maxLeverage;
  } else {
    const apiLeverage = position.leverage ? parseFloat(position.leverage) : 0;
    const storedLeverage = (() => {
      const raw =
        localStorage.getItem(`dydx_leverage_${position.market}`) ??
        localStorage.getItem('dydx_leverage');
      const parsed = raw ? parseFloat(raw) : 5.0;
      return parsed > 0 ? parsed : 5.0;
    })();
    leverage = Math.min(
      apiLeverage > 0 ? apiLeverage : storedLeverage > 0 ? storedLeverage : maxLeverage,
      maxLeverage
    );
    margin = notional / leverage;
  }

  const side = position.side === 'LONG' ? 'BUY' : 'SELL';

  let liquidationPrice: number | null = null;
  if (isIsolated) {
    liquidationPrice = calculateIsolatedLiquidationPrice(absSize, oraclePrice, margin, mmf, side);
  } else {
    const subaccount = childSubaccounts.find(
      sub => sub.subaccountNumber === position.subaccountNumber
    );
    const crossEquity = parseFloat(subaccount?.equity || '0');

    const otherPositionsMMR = positions
      .filter(
        p => p.subaccountNumber === position.subaccountNumber && p.market !== position.market
      )
      .reduce((sum, p) => {
        const pMkt = marketCache[p.market];
        const pPrice = pMkt ? parseFloat(pMkt.oraclePrice) : parseFloat(p.entryPrice);
        const pMmf = pMkt?.maintenanceMarginFraction
          ? parseFloat(pMkt.maintenanceMarginFraction)
          : 0.03;
        return sum + Math.abs(parseFloat(p.size)) * pPrice * pMmf;
      }, 0);



    liquidationPrice = calculateCrossLiquidationPrice(
      absSize,
      oraclePrice,
      crossEquity,
      mmf,
      otherPositionsMMR,
      side
    );
  }

  return {
    absSize,
    entryPrice,
    oraclePrice,
    notional,
    imf,
    mmf,
    leverage,
    margin,
    marginType,
    liquidationPrice,
  };
}

const PositionsPanel: React.FC = () => {
  const {
    positions: rawPositions,
    loadingPositions,
    positionsError,
    refreshPositions,
    isConnected,
    isReceivingUpdates,
  } = useDydxData();

  const positions = rawPositions as Position[];
  const { closePosition, closeAllPositions, setTriggers, isSettingTriggers, orderError, clearOrderError } = useDydxTrading();
  const marketCache = useMarketStore(state => state.marketCache);
  const parentKey = useMemo(() => {
    const address = dydxWalletService.getAddress();
    const subNum = dydxWalletService.getSubaccountNumber();
    return address ? `parent_subaccount_${address}_${subNum}` : null;
  }, []);

  const updateTrigger = useWebSocketStore(s => s.updateTrigger);



  const parentData = useWebSocketStore(
    useCallback(
      s => (parentKey ? s.parentSubaccounts.get(parentKey) : undefined),
      [parentKey, updateTrigger]
    )
  );

  const childSubaccounts = parentData?.childSubaccounts ?? [];
  const isolatedEquityBySubaccount = useMemo((): Map<number, number> => {
    const map = new Map<number, number>();
    childSubaccounts.forEach(child => {
      if (child.subaccountNumber < ISOLATED_SUBACCOUNT_START) return;
      map.set(child.subaccountNumber, parseFloat(child.equity || '0'));
    });
    return map;
  }, [childSubaccounts, updateTrigger]);

  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [showPriceTriggers, setShowPriceTriggers] = useState(false);
  const [addMarginPosition, setAddMarginPosition] = useState<Position | null>(null);
  const [closingMarket, setClosingMarket] = useState<string | null>(null);
  const [isClosingAll, setIsClosingAll] = useState(false);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [newPositionsCount, setNewPositionsCount] = useState(0);

  const [positionToClose, setPositionToClose] = useState<Position | null>(null);
  const [isCloseAllConfirmOpen, setIsCloseAllConfirmOpen] = useState(false);

  const prevPositionsLengthRef = useRef(positions.length);
  const newPositionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const showNotification = useCallback((message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
  }, []);

  const activeMarkets = useMemo(
    () => [...new Set(positions.map(p => p.market))],
    [positions]
  );

  const oraclePrices = useOraclePrices(activeMarkets);

  useEffect(() => {
    const currentLength = positions.length;
    const prevLength = prevPositionsLengthRef.current;

    if (currentLength > prevLength && prevLength > 0) {
      const newCount = currentLength - prevLength;
      setNewPositionsCount(newCount);

      if (newPositionTimerRef.current) clearTimeout(newPositionTimerRef.current);

      newPositionTimerRef.current = setTimeout(() => setNewPositionsCount(0), 5000);
    }

    prevPositionsLengthRef.current = currentLength;

    return () => {
      if (newPositionTimerRef.current) clearTimeout(newPositionTimerRef.current);
    };
  }, [positions.length]);

  useEffect(() => {
    if (activeMarkets.length === 0) return;

    const fetchIcons = async () => {
      const results = await Promise.allSettled(
        activeMarkets.map(async market => {
          const metadata = await metadataService.getMetadata(market);
          return { market, icon: metadata?.image };
        })
      );

      const newIcons: Record<string, string> = {};
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.icon) {
          newIcons[result.value.market] = result.value.icon;
        }
      });

      setIcons(prev => ({ ...prev, ...newIcons }));
    };

    fetchIcons();
  }, [activeMarkets]);

  const handleEdit = useCallback(
    (position: Position) => {
      clearOrderError();
      setSelectedPosition(position);
      setShowPriceTriggers(true);
    },
    [clearOrderError]
  );

  const handleAddMargin = useCallback((position: Position) => {
    setAddMarginPosition(position);
  }, []);

  const handleAddMarginSuccess = useCallback(() => {
    showNotification(`Margin added to ${addMarginPosition?.market} position`, 'success');
    setTimeout(refreshPositions, 1500);
  }, [addMarginPosition, refreshPositions, showNotification]);

  const handleSaveTriggers = useCallback(
    async (config: TriggerConfig) => {
      if (!selectedPosition) return;

      try {
        const params: any = {};
        if (config.takeProfit?.enabled) params.takeProfit = config.takeProfit;
        if (config.stopLoss?.enabled) params.stopLoss = config.stopLoss;

        const result = await setTriggers(selectedPosition, params);

        const successCount = [result.takeProfit?.success, result.stopLoss?.success].filter(Boolean).length;

        if (successCount > 0) {
          const triggerText = successCount === 2 ? 'Take Profit & Stop Loss' : 'Trigger';
          showNotification(`${triggerText} set successfully!`, 'success');
          setShowPriceTriggers(false);
          setTimeout(refreshPositions, 1500);
        } else {
          showNotification(result.takeProfit?.error || result.stopLoss?.error || 'Failed to set triggers', 'error');
        }
      } catch (error: any) {
        showNotification(error.message || 'Failed to set triggers', 'error');
      }
    },
    [selectedPosition, setTriggers, refreshPositions, showNotification]
  );

  const handleClose = useCallback(
    (position: Position) => {
      setPositionToClose(position);
    },
    []
  );

  const executeClose = useCallback(async () => {
    const position = positionToClose;
    if (!position) return;

    setPositionToClose(null);
    setClosingMarket(position.market);

    try {
      const result = await closePosition(position);

      if (result.success) {
        showNotification(`Position ${position.market} closed successfully!`, 'success');
        setTimeout(refreshPositions, 1000);
      } else {
        showNotification(result.userMessage || 'Failed to close position', 'error');
      }
    } catch (error: any) {
      showNotification(error.message || 'Failed to close position', 'error');
    } finally {
      setClosingMarket(null);
    }
  }, [positionToClose, closePosition, refreshPositions, showNotification]);

  const handleCloseAll = useCallback(() => {
    if (positions.length === 0) return;
    setIsCloseAllConfirmOpen(true);
  }, [positions.length]);

  const executeCloseAll = useCallback(async () => {
    setIsCloseAllConfirmOpen(false);
    if (positions.length === 0) return;

    setIsClosingAll(true);

    try {
      const marketInfoMap = Object.fromEntries(
        positions
          .map(p => [p.market, marketCache[p.market]])
          .filter(([, v]) => v != null)
      );

      const result = await closeAllPositions(positions, marketInfoMap);

      if (result.success) {
        showNotification(`All ${result.closed} position${result.closed > 1 ? 's' : ''} closed successfully!`, 'success');
      } else if (result.partialSuccess) {
        showNotification(`${result.closed} closed, ${result.failed} failed — check individual positions`, 'error');
      } else {
        showNotification('Failed to close positions', 'error');
      }

      setTimeout(refreshPositions, 1000);
    } catch (error: any) {
      showNotification(error.message || 'Failed to close all positions', 'error');
    } finally {
      setIsClosingAll(false);
    }
  }, [positions, marketCache, closeAllPositions, refreshPositions, showNotification]);

  const formatPrice = useCallback((value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, []);

  const getMarketIcon = useCallback(
    (market: string) => {
      const icon = icons[market];
      if (icon) {
        return (
          <img
            src={icon}
            alt={market}
            className="w-full h-full object-cover"
            onError={e => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement!.innerHTML = `<span class="text-[8px]">${market.substring(0, 1)}</span>`;
            }}
          />
        );
      }
      return <span className="text-[8px]">{market.substring(0, 1)}</span>;
    },
    [icons]
  );

  const positionMetrics = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computePositionMetrics>>();
    positions.forEach(position => {
      if (Math.abs(parseFloat(position.size)) > 0) {
        const liveOracle = oraclePrices[position.market];
        map.set(
          position.market,
          computePositionMetrics(
            position,
            marketCache,
            childSubaccounts,
            positions,
            isolatedEquityBySubaccount,
            liveOracle,
          )
        );
      }
    });
    return map;
  }, [positions, marketCache, childSubaccounts, isolatedEquityBySubaccount, oraclePrices]);

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-full text-muted">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-primary mb-2">Connect Wallet</h3>
          <p className="text-sm">Connect your wallet to view positions</p>
        </div>
      </div>
    );
  }

  if (loadingPositions && positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted">
        <Loader2 className="w-6 h-6 animate-spin mb-2" />
        <p>Loading positions...</p>
      </div>
    );
  }

  if (positionsError) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-lg text-center max-w-md">
          <h3 className="text-lg font-semibold text-red-400 mb-2">Error Loading Positions</h3>
          <p className="text-sm text-muted mb-4">{positionsError}</p>
          <button
            onClick={refreshPositions}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-primary mb-2">No Open Positions</h3>
          <p className="text-sm">Your active positions will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-primary overflow-auto relative">
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={() => setNotification(null)}
          autoClose={true}
          autoCloseDuration={4000}
        />
      )}

      {newPositionsCount > 0 && (
        <div className="absolute top-2 right-2 z-20 bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg animate-pulse">
          +{newPositionsCount} New Position{newPositionsCount > 1 ? 's' : ''}
        </div>
      )}

      <div className="hidden md:block">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-secondary text-muted font-medium uppercase sticky top-0 z-10">
            <tr>
              <th className="p-3 border-b border-color">
                <div className="flex text-[10px] items-center gap-2">
                  Market
                  {!isReceivingUpdates && (
                    <div
                      className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"
                      title="Reconnecting..."
                    />
                  )}
                </div>
              </th>
              <th className="p-2 border-b border-color text-[10px]">Leverage</th>
              <th className="p-2 border-b border-color text-[10px]">Type</th>
              <th className="p-2 border-b border-color text-right text-[10px]">Size</th>
              <th className="p-2 border-b border-color text-right text-[10px]">Value</th>
              <th className="p-2 border-b border-color text-right text-[10px]">
                <div className="flex items-center justify-end gap-1">
                  P&L
                  <Tooltip content="Refresh oracle prices to update P&L" position="bottom">
                    <RefreshAllButton markets={activeMarkets} />
                  </Tooltip>
                </div>
              </th>
              <th className="p-2 border-b border-color text-right text-[10px]">Margin</th>
              <th className="p-2 border-b border-color text-right text-[10px]">Avg. Open</th>
              <th className="p-2 border-b border-color text-right text-[10px]">Oracle</th>
              <th className="p-2 border-b border-color text-right text-[10px]">Liquidation</th>
              <th className="p-2 border-b border-color text-right text-[10px]">Funding</th>
              <th className="p-2 border-b border-color text-center text-[10px]">
                <div className="flex items-center justify-center gap-2">
                  Actions
                  {positions.length > 1 && (
                    <button
                      onClick={handleCloseAll}
                      disabled={isClosingAll || !!closingMarket}
                      className="px-1.5 py-0.5 bg-red-900/40 hover:bg-red-700/50 text-red-400 hover:text-red-300 rounded text-[9px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                      title="Close all positions"
                    >
                      {isClosingAll ? (
                        <Loader2 size={8} className="animate-spin" />
                      ) : (
                        <X size={8} />
                      )}
                      Close All
                    </button>
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {positions.map(position => {
              const metrics = positionMetrics.get(position.market);
              if (!metrics) return null;

              return (
                <PositionRow
                  key={position.market}
                  position={position}
                  metrics={metrics}
                  oraclePrice={oraclePrices[position.market] ?? null}
                  isClosing={closingMarket === position.market || isClosingAll}
                  onEdit={handleEdit}
                  onClose={handleClose}
                  onAddMargin={handleAddMargin}
                  getMarketIcon={getMarketIcon}
                  formatPrice={formatPrice}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-1.5 p-2">
        <div className="flex gap-2">
          {positions.length > 1 && (
            <button
              onClick={handleCloseAll}
              disabled={isClosingAll || !!closingMarket}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-800/40 text-red-400 hover:text-red-300 rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isClosingAll ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <X size={12} />
              )}
              {isClosingAll ? 'Closing...' : `Close All (${positions.length})`}
            </button>
          )}
          <RefreshAllButton markets={activeMarkets} label />
        </div>

        {positions.map(position => {
          const metrics = positionMetrics.get(position.market);
          if (!metrics) return null;

          return (
            <PositionCard
              key={position.market}
              position={position}
              metrics={metrics}
              oraclePrice={oraclePrices[position.market] ?? null}
              isClosing={closingMarket === position.market || isClosingAll}
              onEdit={handleEdit}
              onClose={handleClose}
              onAddMargin={handleAddMargin}
              getMarketIcon={getMarketIcon}
              formatPrice={formatPrice}
            />
          );
        })}
      </div>

      {selectedPosition && (
        <PriceTriggers
          isOpen={showPriceTriggers}
          onClose={() => setShowPriceTriggers(false)}
          position={selectedPosition}
          isLoading={isSettingTriggers}
          error={orderError}
          onSave={handleSaveTriggers}
        />
      )}

      {addMarginPosition && (
        <AddMarginModal
          isOpen={!!addMarginPosition}
          onClose={() => setAddMarginPosition(null)}
          position={addMarginPosition}
          onSuccess={handleAddMarginSuccess}
          marketIcon={getMarketIcon(addMarginPosition.market)}
        />
      )}

      <ConfirmationModal
        isOpen={!!positionToClose}
        title="Close Position"
        message={
          positionToClose
            ? `Are you sure you want to close your ${positionToClose.market} position?`
            : ''
        }
        confirmText="Close Position"
        confirmButtonType="danger"
        onConfirm={executeClose}
        onCancel={() => setPositionToClose(null)}
      />

      <ConfirmationModal
        isOpen={isCloseAllConfirmOpen}
        title="Close All Positions"
        message={`Are you sure you want to close all ${positions.length} open position${positions.length > 1 ? 's' : ''}?`}
        confirmText="Close All"
        confirmButtonType="danger"
        onConfirm={executeCloseAll}
        onCancel={() => setIsCloseAllConfirmOpen(false)}
      />
    </div>
  );
};

export default PositionsPanel;