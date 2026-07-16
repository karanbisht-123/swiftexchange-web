import { Edit2, Loader2, PlusCircle, RefreshCw, TrendingDown, TrendingUp, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ConfirmationModal } from '../../../../components/common/ConfirmationModal';
import { Notification } from '../../../../components/common/Notification';
import { Tooltip } from '../../../../components/common/Tooltip';
import { getIndexerClient } from '../../client/clients';
import { useDydxData } from '../../hooks/useDydxData';
import { useDydxTrading } from '../../hooks/useDydxTrading';
import { metadataService } from '../../hooks/useMetadata';
import { useOraclePrices } from '../../hooks/useOraclePrices';
import { dydxWalletService } from '../../service/dydxWalletService';
import useMarketStore from '../../store/marketStore';
import { useWebSocketStore } from '../../store/websocketStore';
import { type Position } from '../../types/trading.types';
import { formatMarketPrice, formatNumericWithCommas } from '../../utils/BigNumberUtils';
import { currencyService } from '../../utils/currencyService';
import {
  calculateCrossLiquidationPrice,
  calculateIsolatedLiquidationPrice,
} from '../../utils/marginCalculator';
import PriceTriggers, { type TriggerConfig } from '../PriceTriggers';
import AddMarginModal from '../shared/Addmarginmodal';

const ISOLATED_SUBACCOUNT_START = 128;

interface OraclePriceCellProps {
  oraclePrice: number | null;
}

const OraclePriceCell = React.memo(function OraclePriceCell({ oraclePrice }: OraclePriceCellProps) {
  return (
    <span className="text-blue-400 font-mono">
      {oraclePrice !== null ? formatMarketPrice(oraclePrice, '$') : '—'}
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

const PnlCell = React.memo(function PnlCell({
  oraclePrice,
  margin,
  entryPrice,
  size,
  mobile = false,
}: PnlCellProps) {
  const unrealizedPnl =
    oraclePrice !== null && entryPrice > 0 ? size * (oraclePrice - entryPrice) : 0;

  const pnlPercentage = margin > 0 ? (unrealizedPnl / margin) * 100 : 0;
  const isPositive = unrealizedPnl > 0;
  const isNegative = unrealizedPnl < 0;
  const absPnl = Math.abs(unrealizedPnl);
  const formatted = formatNumericWithCommas(absPnl, 2, isPositive ? '+$' : isNegative ? '-$' : '$');
  const pnlClass = isPositive ? 'text-green-400' : isNegative ? 'text-red-400' : 'text-muted';
  const percentSign = isPositive ? '+' : '';
  const percentStr = `(${percentSign}${pnlPercentage.toFixed(2)}%)`;

  if (mobile) {
    return (
      <div className={`font-medium font-mono ${pnlClass}`}>
        <div>{formatted}</div>
        <div className="text-[9px] opacity-80">{percentStr}</div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col font-mono ${pnlClass}`}>
      <span>{formatted}</span>
      <span className="text-[9px] opacity-80">{percentStr}</span>
    </div>
  );
});

interface RefreshAllButtonProps {
  markets: string[];
  label?: boolean;
}

const RefreshAllButton = React.memo(function RefreshAllButton({
  markets,
  label = false,
}: RefreshAllButtonProps) {
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
            .catch(() => {})
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
  decimals: number;
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
  decimals,
}: PositionRowProps) {
  const isIsolated = (position.subaccountNumber ?? 0) >= ISOLATED_SUBACCOUNT_START;

  return (
    <tr className="border-b border-color hover:bg-hover transition-colors text-[11px]">
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
            {getMarketIcon(position.market)}
          </div>
          <span className="font-bold text-primary">{position.market}</span>
        </div>
      </td>

      <td className="px-2 py-1.5">
        <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-tertiary text-primary border border-color">
          {metrics.leverage.toFixed(1)}×
        </span>
      </td>

      <td className="px-2 py-1.5">
        <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-tertiary text-primary border border-color uppercase tracking-wider">
          {metrics.marginType}
        </span>
      </td>

      <td className="px-2 py-1.5 text-right text-primary font-mono">
        {formatNumericWithCommas(metrics.absSize, decimals)}
      </td>

      <td className="px-2 py-1.5 text-right text-primary font-mono">
        {formatNumericWithCommas(metrics.notional, 2, '$')}
      </td>

      <td className="px-2 py-1.5 text-right font-mono">
        <PnlCell
          oraclePrice={oraclePrice}
          margin={metrics.margin}
          entryPrice={metrics.entryPrice}
          size={parseFloat(position.size)}
        />
      </td>

      <td className="px-2 py-1.5 text-right font-mono">
        <div className="flex items-center justify-end gap-1.5 text-primary">
          <span>{formatNumericWithCommas(metrics.margin, 2, '$')}</span>
          {isIsolated && (
            <button
              onClick={() => onAddMargin(position)}
              disabled={isClosing}
              className="p-0.5 hover:bg-blue-900/30 rounded text-muted hover:text-blue-400 transition-all disabled:opacity-50"
              title="Add Margin"
            >
              <PlusCircle size={10} />
            </button>
          )}
        </div>
      </td>

      <td className="px-2 py-1.5 text-right text-muted font-mono">
        {formatMarketPrice(metrics.entryPrice, '$')}
      </td>

      <td className="px-2 py-1.5 text-right font-mono">
        <OraclePriceCell oraclePrice={oraclePrice} />
      </td>

      <td className="px-2 py-1.5 text-right text-orange-400 font-mono">
        {metrics.liquidationPrice ? formatMarketPrice(metrics.liquidationPrice, '$') : '—'}
      </td>

      <td className="px-2 py-1.5 text-right text-muted font-mono">
        {formatNumericWithCommas(parseFloat(position.netFunding || '0'), 4)}
      </td>

      <td className="px-2 py-1.5 text-center">
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
            {isClosing ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
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
  decimals: number;
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
  decimals,
}: PositionCardProps) {
  const isShort = position.side === 'SHORT';
  const isIsolated = (position.subaccountNumber ?? 0) >= ISOLATED_SUBACCOUNT_START;

  return (
    <div className="bg-secondary border border-color rounded-xl p-3 shadow-sm mb-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-7 h-7 rounded-full bg-[var(--color-bg-primary)] flex items-center justify-center overflow-hidden">
              {getMarketIcon(position.market)}
            </div>
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-[1.5px] border-secondary flex items-center justify-center ${isShort ? 'bg-red-500' : 'bg-green-500'}`}
            >
              {isShort ? (
                <TrendingDown size={6} className="text-white" />
              ) : (
                <TrendingUp size={6} className="text-white" />
              )}
            </div>
          </div>
          <div>
            <div className="font-bold text-primary flex items-center gap-1.5 text-sm">
              {position.market}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide ${isShort ? 'text-red-400 bg-red-400/10' : 'text-green-400 bg-green-400/10'}`}
              >
                {isShort ? 'SHORT' : 'LONG'} {metrics.leverage.toFixed(1)}×
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-secondary text-muted uppercase">
                {metrics.marginType}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onEdit(position)}
            disabled={isClosing}
            className="p-1.5 bg-secondary hover:bg-hover rounded-lg text-muted hover:text-primary transition-all disabled:opacity-50"
            title="Set TP/SL"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={() => onClose(position)}
            disabled={isClosing}
            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 transition-all disabled:opacity-50"
            title="Close Position"
          >
            {isClosing ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
          </button>
        </div>
      </div>

      <div className="flex justify-between items-end mb-3 px-1">
        <div className="flex flex-col">
          <span className="text-[10px] text-muted font-medium mb-1 uppercase tracking-wider">
            Unrealized P&L
          </span>
          <div className="text-sm">
            <PnlCell
              oraclePrice={oraclePrice}
              margin={metrics.margin}
              entryPrice={metrics.entryPrice}
              size={parseFloat(position.size)}
              mobile
            />
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-muted font-medium mb-1 uppercase tracking-wider">
            Size
          </span>
          <span className="text-primary font-mono text-sm font-medium">
            {formatNumericWithCommas(metrics.absSize, decimals)}
          </span>
          <span className="text-[10px] text-muted mt-0.5">
            {formatNumericWithCommas(metrics.notional, 2, '$')}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-2.5 bg-secondary/30 rounded-lg">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted">Entry Price</span>
          <span className="text-[10px] text-primary font-mono">
            {formatMarketPrice(metrics.entryPrice, '$')}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted">Oracle Price</span>
          <span className="text-[10px] text-primary font-mono">
            <OraclePriceCell oraclePrice={oraclePrice} />
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted">Liq. Price</span>
          <span className="text-[10px] text-orange-400 font-mono">
            {metrics.liquidationPrice ? formatMarketPrice(metrics.liquidationPrice, '$') : '—'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted">Margin</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-primary font-mono">
              {formatNumericWithCommas(metrics.margin, 2, '$')}
            </span>
            {isIsolated && (
              <button
                onClick={() => onAddMargin(position)}
                disabled={isClosing}
                className="text-blue-400 hover:text-blue-300 disabled:opacity-50"
              >
                <PlusCircle size={10} />
              </button>
            )}
          </div>
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
  storedLeverage = 5.0
): PositionMetrics {
  const rawSize = parseFloat(position.size);
  const absSize = Math.abs(rawSize);
  const entryPrice = parseFloat(position.entryPrice);
  const mktData = marketCache[position.market];
  const cachedOraclePrice = mktData ? parseFloat(mktData.oraclePrice) : entryPrice;
  const oraclePrice =
    liveOraclePrice != null && liveOraclePrice > 0 ? liveOraclePrice : cachedOraclePrice;
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
    // storedLeverage is passed in — caller reads localStorage once outside the hot path
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
      .filter(p => p.subaccountNumber === position.subaccountNumber && p.market !== position.market)
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
  } = useDydxData();

  const positions = rawPositions as Position[];
  const {
    closePosition,
    closeAllPositions,
    setTriggers,
    isSettingTriggers,
    orderError,
    clearOrderError,
  } = useDydxTrading();
  const marketCache = useMarketStore(state => state.marketCache);
  const parentKey = useMemo(() => {
    const address = dydxWalletService.getAddress();
    const subNum = dydxWalletService.getSubaccountNumber();
    return address ? `parent_subaccount_${address}_${subNum}` : null;
  }, []);

  const parentData = useWebSocketStore(
    useCallback(
      s => (parentKey ? s.parentSubaccounts.get(parentKey) : undefined),
      [parentKey] // parentSubaccounts is a new Map on each WS update — no need for updateTrigger
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
  }, [childSubaccounts]);

  // Read localStorage once here (not inside the per-tick useMemo) so the hot path stays I/O-free.
  const storedLeverageRef = useRef<Record<string, number>>({});
  positions.forEach(p => {
    if (storedLeverageRef.current[p.market] === undefined) {
      const raw =
        localStorage.getItem(`dydx_leverage_${p.market}`) ?? localStorage.getItem('dydx_leverage');
      storedLeverageRef.current[p.market] = raw ? parseFloat(raw) || 5.0 : 5.0;
    }
  });

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

  const activeMarkets = useMemo(() => [...new Set(positions.map(p => p.market))], [positions]);

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

        const successCount = [
          result.results.takeProfit?.success,
          result.results.stopLoss?.success,
        ].filter(Boolean).length;

        if (successCount > 0) {
          const triggerText = successCount === 2 ? 'Take Profit & Stop Loss' : 'Trigger';
          showNotification(`${triggerText} set successfully!`, 'success');
          setShowPriceTriggers(false);
          setTimeout(refreshPositions, 1500);
        } else {
          showNotification(
            result.results.takeProfit?.error ||
              result.results.stopLoss?.error ||
              'Failed to set triggers',
            'error'
          );
        }
      } catch (error: any) {
        showNotification(error.message || 'Failed to set triggers', 'error');
      }
    },
    [selectedPosition, setTriggers, refreshPositions, showNotification]
  );

  const handleClose = useCallback((position: Position) => {
    setPositionToClose(position);
  }, []);

  const executeClose = useCallback(async () => {
    const position = positionToClose;
    if (!position) return;

    setPositionToClose(null);
    setClosingMarket(position.market);

    try {
      const result = await closePosition(position);

      if (result.success) {
        showNotification(`Close order submitted for ${position.market}`, 'success');
        setTimeout(refreshPositions, 1000);
        // Clear the loading state after 10 seconds as a fallback
        // The position will normally be removed from the UI via WebSocket before this
        setTimeout(() => setClosingMarket(prev => (prev === position.market ? null : prev)), 10000);
      } else {
        showNotification(result.userMessage || 'Failed to close position', 'error');
        setClosingMarket(null);
      }
    } catch (error: any) {
      showNotification(error.message || 'Failed to close position', 'error');
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
        positions.map(p => [p.market, marketCache[p.market]]).filter(([, v]) => v != null)
      );

      const result = await closeAllPositions(positions, marketInfoMap);

      if (result.success) {
        showNotification(
          `Close orders submitted for ${result.closed} position${result.closed > 1 ? 's' : ''}`,
          'success'
        );
        setTimeout(() => setIsClosingAll(false), 10000);
      } else if (result.partialSuccess) {
        showNotification(
          `${result.closed} closed, ${result.failed} failed — check individual positions`,
          'error'
        );
        setIsClosingAll(false);
      } else {
        showNotification('Failed to close positions', 'error');
        setIsClosingAll(false);
      }

      setTimeout(refreshPositions, 1000);
    } catch (error: any) {
      showNotification(error.message || 'Failed to close all positions', 'error');
      setIsClosingAll(false);
    }
  }, [positions, marketCache, closeAllPositions, refreshPositions, showNotification]);
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
            storedLeverageRef.current[position.market] ?? 5.0
          )
        );
      }
    });
    return map;
  }, [positions, marketCache, childSubaccounts, isolatedEquityBySubaccount, oraclePrices]);

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-full min-h-[150px] py-8 text-muted">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-primary mb-2">Connect Wallet</h3>
          <p className="text-sm">Connect your wallet to view positions</p>
        </div>
      </div>
    );
  }

  if (loadingPositions && positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[150px] py-8 text-muted">
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
      <div className="flex items-center justify-center h-full min-h-[150px] py-8 text-muted">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-primary mb-2">No Open Positions</h3>
          <p className="text-sm">Your active positions will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-secondary overflow-y-visible md:overflow-auto relative flex flex-col">
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

      <div className="hidden md:block flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-secondary text-muted text-[10px] uppercase tracking-wider font-semibold sticky top-0 z-10 border-b border-color">
            <tr>
              <th className="px-3 py-2 font-semibold">Market</th>
              <th className="px-2 py-2 font-semibold">Leverage</th>
              <th className="px-2 py-2 font-semibold">Type</th>
              <th className="px-2 py-2 text-right font-semibold">Size</th>
              <th className="px-2 py-2 text-right font-semibold">Value</th>
              <th className="px-2 py-2 text-right font-semibold">
                <div className="flex items-center justify-end gap-1">
                  P&L
                  <Tooltip content="Refresh oracle prices to update P&L" position="bottom">
                    <RefreshAllButton markets={activeMarkets} />
                  </Tooltip>
                </div>
              </th>
              <th className="px-2 py-2 text-right font-semibold">Margin</th>
              <th className="px-2 py-2 text-right font-semibold">Avg. Open</th>
              <th className="px-2 py-2 text-right font-semibold">Oracle</th>
              <th className="px-2 py-2 text-right font-semibold">Liquidation</th>
              <th className="px-2 py-2 text-right font-semibold">Funding</th>
              <th className="px-2 py-2 text-center font-semibold">
                <div className="flex items-center justify-center gap-2">
                  Actions
                  {positions.length > 1 && (
                    <button
                      onClick={handleCloseAll}
                      disabled={isClosingAll || !!closingMarket}
                      className="px-1.5 py-0.5 bg-red-900/40 hover:bg-red-700/50 text-red-400 hover:text-red-300 rounded text-[9px] font-bold transition-all disabled:opacity-40 flex items-center gap-1 uppercase"
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

              const mkt = marketCache[position.market];
              const stepSize = mkt?.stepSize || '0.0001';
              const decimals = currencyService.getStepSizeDecimals(stepSize);

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
                  decimals={decimals}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden w-full flex flex-col space-y-2 p-2 pb-4">
        <div className="flex gap-2">
          {positions.length > 1 && (
            <button
              onClick={handleCloseAll}
              disabled={isClosingAll || !!closingMarket}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-800/40 text-red-400 hover:text-red-300 rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isClosingAll ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
              {isClosingAll ? 'Closing...' : `Close All (${positions.length})`}
            </button>
          )}
          <RefreshAllButton markets={activeMarkets} label />
        </div>

        {positions.map(position => {
          const metrics = positionMetrics.get(position.market);
          if (!metrics) return null;

          const mkt = marketCache[position.market];
          const stepSize = mkt?.stepSize || '0.0001';
          const decimals = currencyService.getStepSizeDecimals(stepSize);

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
              decimals={decimals}
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
          marketIcon={getMarketIcon(selectedPosition.market)}
          oraclePrice={oraclePrices[selectedPosition.market] ?? undefined}
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
