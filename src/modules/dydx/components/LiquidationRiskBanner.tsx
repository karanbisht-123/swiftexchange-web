import { AlertTriangle } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';

import AddMarginModal from './shared/Addmarginmodal';
import { useDydxData } from '../hooks/useDydxData';
import { useOraclePrices } from '../hooks/useOraclePrices';
import { useDydxTrading } from '../hooks/useDydxTrading';
import { metadataService } from '../hooks/useMetadata';
import useMarketStore from '../store/marketStore';
import { useWebSocketStore } from '../store/websocketStore';
import { dydxWalletService } from '../service/dydxWalletService';
import { type Position } from '../types/trading.types';
import {
  calculateCrossLiquidationPrice,
  calculateIsolatedLiquidationPrice,
} from '../utils/marginCalculator';

const ISOLATED_SUBACCOUNT_START = 128;
const ALERT_THRESHOLD = 90; // Visibility threshold (retained for user testing)
const CRITICAL_THRESHOLD = 10; // Hardcoded critical threshold (10%)
const WARNING_THRESHOLD = 20; // Hardcoded warning threshold (20%)

interface RiskPosition {
  position: Position;
  liquidationPrice: number;
  oraclePrice: number;
  distancePct: number;
  isIsolated: boolean;
  margin: number;
}

function useLiquidationRisk(): RiskPosition[] {
  const { positions: rawPositions } = useDydxData();
  const positions = rawPositions as Position[];
  const marketCache = useMarketStore(s => s.marketCache);

  const activeAddress = dydxWalletService.getAddress();
  const parentKey = activeAddress ? `parent_subaccount_${activeAddress}_0` : null;
  const updateTrigger = useWebSocketStore(s => s.updateTrigger);
  const parentData = useWebSocketStore(
    useCallback(
      (s: any) => (parentKey ? s.parentSubaccounts.get(parentKey) : undefined),
      [parentKey, updateTrigger]
    )
  );
  const childSubaccounts = parentData?.childSubaccounts ?? [];

  const isolatedEquityBySubaccount = useMemo((): Map<number, number> => {
    const map = new Map<number, number>();
    childSubaccounts.forEach((child: any) => {
      if (child.subaccountNumber < ISOLATED_SUBACCOUNT_START) return;
      map.set(child.subaccountNumber, parseFloat(child.equity || '0'));
    });
    return map;
  }, [childSubaccounts, updateTrigger]);

  const activeMarkets = useMemo(() => [...new Set(positions.map(p => p.market))], [positions]);
  const oraclePrices = useOraclePrices(activeMarkets);

  return useMemo((): RiskPosition[] => {
    const risks: RiskPosition[] = [];

    positions.forEach(pos => {
      const absSize = Math.abs(parseFloat(pos.size || '0'));
      if (absSize === 0) return;

      const mktData = marketCache[pos.market];
      const mmf = mktData?.maintenanceMarginFraction ? parseFloat(mktData.maintenanceMarginFraction) : 0.03;
      const imf = mktData?.initialMarginFraction ? parseFloat(mktData.initialMarginFraction) : 0.05;
      const entryPrice = parseFloat(pos.entryPrice || '0');
      const liveOracle = oraclePrices[pos.market];
      const cachedOracle = mktData ? parseFloat(mktData.oraclePrice || '0') : entryPrice;
      const oracle = liveOracle && liveOracle > 0 ? liveOracle : cachedOracle;
      if (oracle <= 0) return;

      const isIsolated = (pos.subaccountNumber ?? 0) >= ISOLATED_SUBACCOUNT_START;
      const side = pos.side === 'LONG' ? 'BUY' : 'SELL';
      const notional = absSize * oracle;
      const maxLeverage = imf > 0 ? Math.floor(1 / imf) : 20;

      let margin: number;
      let liqPrice: number | null = null;

      if (isIsolated) {
        margin = isolatedEquityBySubaccount.get(pos.subaccountNumber ?? 0) ?? 0;
        liqPrice = calculateIsolatedLiquidationPrice(absSize, oracle, margin, mmf, side);
      } else {
        const apiLev = pos.leverage ? parseFloat(pos.leverage) : 0;
        const storedRaw = localStorage.getItem(`dydx_leverage_${pos.market}`) ?? localStorage.getItem('dydx_leverage');
        const storedLev = storedRaw ? parseFloat(storedRaw) : 5.0;
        const leverage = Math.min(
          apiLev > 0 ? apiLev : storedLev > 0 ? storedLev : maxLeverage,
          maxLeverage
        );
        margin = notional / leverage;

        const sub = childSubaccounts.find((c: any) => c.subaccountNumber === pos.subaccountNumber);
        const crossEquity = parseFloat(sub?.equity || '0');
        const otherMMR = positions
          .filter(p => p.subaccountNumber === pos.subaccountNumber && p.market !== pos.market)
          .reduce((sum, p) => {
            const pMkt = marketCache[p.market];
            const pPrice = pMkt ? parseFloat(pMkt.oraclePrice) : parseFloat(p.entryPrice);
            const pMmf = pMkt?.maintenanceMarginFraction ? parseFloat(pMkt.maintenanceMarginFraction) : 0.03;
            return sum + Math.abs(parseFloat(p.size)) * pPrice * pMmf;
          }, 0);
        liqPrice = calculateCrossLiquidationPrice(absSize, oracle, crossEquity, mmf, otherMMR, side);
      }

      if (!liqPrice || liqPrice <= 0) return;

      const distancePct = (Math.abs(oracle - liqPrice) / oracle) * 100;

      if (distancePct <= ALERT_THRESHOLD) {
        risks.push({ position: pos, liquidationPrice: liqPrice, oraclePrice: oracle, distancePct, isIsolated, margin });
      }
    });

    return risks.sort((a, b) => a.distancePct - b.distancePct);
  }, [positions, marketCache, oraclePrices, isolatedEquityBySubaccount, childSubaccounts]);
}

// ─── Price track bar ────────────────────────────────────────────────────────
function PriceTrack({
  oracle,
  liqPrice,
  side,
  distancePct,
  entryPrice,
  isCritical,
}: {
  oracle: number;
  liqPrice: number;
  side: string;
  distancePct: number;
  entryPrice: number;
  isCritical: boolean;
}) {
  const isShort = side === 'SHORT';

  // Fill proportions: safe | warn | danger
  const dangerFill = Math.max(5, Math.min(30, (CRITICAL_THRESHOLD / distancePct) * 20));
  const warnFill = Math.max(10, Math.min(35, 35 - distancePct * 0.3));
  const safeFill = 100 - dangerFill - warnFill;

  const fmt = (n: number) =>
    n >= 1000
      ? '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  return (
    <div className="py-0.5">
      {/* Callout labels */}
      <div className="relative h-4.5 mb-0.5 text-[9.5px]">
        <span
          className="absolute -translate-x-1/2 px-1.5 py-0.5 rounded bg-(--color-bg-tertiary) text-blue-400 border border-(--color-border) whitespace-nowrap font-medium font-mono"
          style={{ left: '40%' }}
        >
          Oracle {fmt(oracle)}
        </span>
        <span
          className={`absolute -translate-x-1/2 px-1.5 py-0.5 rounded border whitespace-nowrap font-medium font-mono ${isCritical
            ? 'bg-red-500/10 border-red-500/20 text-red-400'
            : 'bg-amber-500/10 border-amber-500/20 text-amber-500'
            }`}
          style={{ left: '80%' }}
        >
          Liq {fmt(liqPrice)}
        </span>
      </div>

      {/* Track */}
      <div className="relative h-2 rounded-full overflow-hidden flex bg-(--color-bg-tertiary) border border-(--color-border)">
        <div style={{ width: `${safeFill}%` }} className="bg-emerald-500" />
        <div style={{ width: `${warnFill}%` }} className="bg-amber-500" />
        <div style={{ width: `${dangerFill}%` }} className="bg-red-500" />
        {/* Oracle pin */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-blue-400" style={{ left: '40%' }} />
        {/* Liq pin */}
        <div className={`absolute top-0 bottom-0 w-0.5 ${isCritical ? 'bg-red-500' : 'bg-amber-500'}`} style={{ left: '80%' }} />
      </div>

      {/* Bottom labels */}
      <div className="flex justify-between items-center mt-0.5 text-xs  text-(--color-text-muted) font-medium">
        <span>{fmt(entryPrice)} entry zone</span>
        <span className="text-blue-400">← oracle now</span>
        <span className={isShort ? 'text-red-500' : 'text-green-500'}>
          {isShort ? 'liq →' : '← liq'}
        </span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3.5 flex-wrap mt-1.5 text-xs  text-(--color-text-secondary) font-medium border-t border-(--color-border)/30 pt-1">
        <span className="flex items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block mr-1" />
          Safe zone
        </span>
        <span className="flex items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block mr-1" />
          Caution zone
        </span>
        <span className="flex items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block mr-1" />
          Danger zone
        </span>
        <span className="flex items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block mr-1" />
          Oracle
        </span>
        <span className="flex items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-red-600 inline-block mr-1" />
          Liquidation
        </span>
      </div>
    </div>
  );
}

// ─── Single risk card ────────────────────────────────────────────────────────
function RiskCard({
  riskPos,
  onClose,
  onAddMargin,
  isClosing,
  marketIcon,
}: {
  riskPos: RiskPosition;
  onClose: () => void;
  onAddMargin: () => void;
  isClosing: boolean;
  marketIcon?: string;
}) {
  const { position, liquidationPrice, oraclePrice, distancePct, isIsolated, margin } = riskPos;

  const isCritical = distancePct < CRITICAL_THRESHOLD;
  const isWarning = distancePct <= WARNING_THRESHOLD;

  // Determine Danger Level Style: Red (Critical) vs Yellow (Warning) vs Green (Safe)
  let levelColor = 'text-green-500';
  let borderClass = 'border-(--color-border) border-l-4 border-l-emerald-500';
  let bgClass = 'bg-(--color-bg-secondary)';
  let msgBoxClass = 'bg-emerald-500/5 dark:bg-emerald-950/10 border-emerald-500/20 text-emerald-500';

  if (isCritical) {
    levelColor = 'text-red-500';
    borderClass = 'border-(--color-border) border-l-4 border-l-red-500 shadow-sm shadow-red-500/5';
    msgBoxClass = 'bg-red-500/5 dark:bg-red-950/10 border-red-500/20 text-red-500';
  } else if (isWarning) {
    levelColor = 'text-amber-500';
    borderClass = 'border-(--color-border) border-l-4 border-l-amber-500 shadow-sm shadow-amber-500/5';
    msgBoxClass = 'bg-amber-500/5 dark:bg-amber-950/10 border-amber-500/20 text-amber-500';
  }

  const fmt = (n: number) =>
    n >= 1000
      ? '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  const isShort = position.side === 'SHORT';
  const sizeNum = parseFloat(position.size || '0');
  const entryPriceNum = parseFloat(position.entryPrice || '0');

  // P&L calculation: size * (oracle - entry)
  const unrealizedPnl = sizeNum * (oraclePrice - entryPriceNum);
  const pnlSign = unrealizedPnl >= 0 ? '+' : '';

  const dollarGap = Math.abs(oraclePrice - liquidationPrice);
  const gapFmt = dollarGap >= 1000
    ? '$' + dollarGap.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : '$' + dollarGap.toFixed(2);

  const message = isShort
    ? `Price must rise ${gapFmt} to liquidate. You're short — add margin or close early if BTC rallies toward ${fmt(liquidationPrice)}.`
    : `Price must fall ${gapFmt} to liquidate. You're long — add margin or close early if BTC drops toward ${fmt(liquidationPrice)}.`;

  const assetName = position.market.replace('-USD', '');

  return (
    <div className={`border rounded-xl p-3.5 flex flex-col md:flex-row gap-4 shadow-sm hover:shadow-md transition-all duration-300 ${bgClass} ${borderClass}`}>

      {/* Left Column: Header Info & Metrics Panel */}
      <div className="flex flex-col gap-2.5 md:w-[250px] shrink-0 md:border-r md:border-(--color-border)/30 md:pr-4">
        {/* Header Info */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center justify-center overflow-hidden shrink-0">
            {marketIcon ? (
              <img src={marketIcon} alt={position.market} className="w-full h-full object-cover" />
            ) : (
              <span className="text-[10px] font-black">{position.market[0]}</span>
            )}
          </div>
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap leading-none">
              <span className="text-xs font-extrabold text-(--color-text-primary) tracking-tight">
                {position.market}
              </span>
              <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-bold ${isShort
                ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                : 'bg-green-500/15 text-green-400 border border-green-500/20'
                }`}>
                {position.side}
              </span>
              <span className="text-[8.5px] px-1.5 py-0.5 rounded font-bold bg-(--color-bg-tertiary) border border-(--color-border) text-(--color-text-secondary)">
                {isIsolated ? 'Isolated' : 'Cross'}
              </span>
            </div>
            <span className="text-[9.5px] text-(--color-text-muted) font-semibold leading-none mt-0.5">
              {position.leverage ? parseFloat(position.leverage).toFixed(0) : '—'}x leverage · {Math.abs(sizeNum).toFixed(4)} {assetName}
            </span>
          </div>
        </div>

        {/* Separated metrics panel - 2x2 grid on mobile, 1x4 list on desktop */}
        <div className="grid grid-cols-2 md:grid-cols-1 gap-0 border border-(--color-border) bg-(--color-bg-tertiary) rounded-xl overflow-hidden mt-1 shrink-0">
          {[
            { label: 'Oracle Price', value: fmt(oraclePrice), className: 'text-(--color-text-primary)' },
            { label: 'Avg Open', value: fmt(entryPriceNum), className: 'text-(--color-text-primary)' },
            {
              label: 'P&L',
              value: `${pnlSign}${fmt(unrealizedPnl)}`,
              className: unrealizedPnl >= 0 ? 'text-green-500' : 'text-red-500',
            },
            { label: 'Margin', value: fmt(margin), className: 'text-(--color-text-primary)' },
          ].map((m, i) => {
            // Precise cross-dividing borders for grid
            let borderStyle = 'py-1.5 px-3 flex flex-col gap-0.5 ';
            if (i < 2) borderStyle += 'border-b border-(--color-border) ';
            if (i % 2 === 0) borderStyle += 'border-r border-(--color-border) ';
            if (i < 3) borderStyle += 'md:border-b md:border-(--color-border) ';
            else borderStyle += 'md:border-b-0 ';
            borderStyle += 'md:border-r-0 ';

            return (
              <div key={i} className={borderStyle}>
                <span className="text-[8.5px] uppercase text-(--color-text-muted) font-bold tracking-wider">{m.label}</span>
                <span className={`text-[11px] font-bold font-mono tracking-tight ${m.className}`}>{m.value}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Column: Actions, Price Track, Warnings */}
      <div className="flex-1 flex flex-col gap-3 justify-between">

        {/* Top Header Row of Right Column */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* Embedded position warning info */}
          <div className="text-xs font-semibold text-(--color-text-secondary) leading-none">
            Liquidation risk — {isShort ? 'short' : 'long'} position · <span className={levelColor}>{distancePct.toFixed(1)}% away</span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              disabled={isClosing}
              className="flex items-center gap-1 px-3 py-2 rounded-md text-sm  text font-bold border border-red-500/25 text-red-500 bg-red-500/5 hover:bg-red-500/10 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              {isClosing ? 'Closing…' : 'Close'}
            </button>

            <button
              onClick={onAddMargin}
              disabled={isClosing}
              className={`flex items-center gap-1 px-3 py-2 rounded-md text font-bold text-sm  shadow-sm cursor-pointer transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed bg-teritray border`}
            >
              + Add margin
            </button>
          </div>
        </div>


        <PriceTrack
          oracle={oraclePrice}
          liqPrice={liquidationPrice}
          side={position.side}
          distancePct={distancePct}
          entryPrice={entryPriceNum}
          isCritical={isCritical}
        />

        {/* Bottom Section: Message Box */}
        <div className={`border rounded-md px-2.5 py-3 text-xs leading-normal font-semibold flex items-center gap-1.5 ${msgBoxClass}`}>
          <AlertTriangle size={11} className="shrink-0 animate-pulse" />
          <span>{message}</span>
        </div>

      </div>

    </div>
  );
}

// ─── Main banner ─────────────────────────────────────────────────────────────
const LiquidationRiskBanner: React.FC = () => {
  const [addMarginPos, setAddMarginPos] = useState<Position | null>(null);
  const [closingMarket, setClosingMarket] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const { closePosition } = useDydxTrading();
  const riskPositions = useLiquidationRisk();

  React.useEffect(() => {
    const markets = riskPositions.map(r => r.position.market);
    if (markets.length === 0) return;
    Promise.allSettled(
      markets.map(m => metadataService.getMetadata(m).then(meta => ({ m, icon: meta?.image })))
    ).then(results => {
      const map: Record<string, string> = {};
      results.forEach(r => { if (r.status === 'fulfilled' && r.value.icon) map[r.value.m] = r.value.icon; });
      setIcons(prev => ({ ...prev, ...map }));
    });
  }, [riskPositions.map(r => r.position.market).join(',')]);

  const handleClose = useCallback(async (position: Position) => {
    setClosingMarket(position.market);
    setCloseError(null);
    try {
      const res = await closePosition(position);
      if (!res.success) setCloseError(res.userMessage || 'Failed to close position');
    } catch (err: any) {
      setCloseError(err.message || 'Failed to close position');
    } finally {
      setClosingMarket(null);
    }
  }, [closePosition]);

  if (riskPositions.length === 0) return null;

  return (
    <div className="flex flex-col gap-3.5 mb-6">
      {closeError && (
        <div className="text-xs text-(--color-danger) bg-(--color-danger)/10 border border-(--color-danger)/20 px-3 py-2 rounded-xl flex items-center gap-2 font-medium">
          <AlertTriangle size={13} className="shrink-0" />
          <span>{closeError}</span>
        </div>
      )}
      {riskPositions.map(rp => (
        <RiskCard
          key={rp.position.market}
          riskPos={rp}
          onClose={() => handleClose(rp.position)}
          onAddMargin={() => setAddMarginPos(rp.position)}
          isClosing={closingMarket === rp.position.market}
          marketIcon={icons[rp.position.market]}
        />
      ))}
      {addMarginPos && (
        <AddMarginModal
          isOpen={!!addMarginPos}
          onClose={() => setAddMarginPos(null)}
          position={addMarginPos}
          onSuccess={() => setAddMarginPos(null)}
        />
      )}
    </div>
  );
};

export default LiquidationRiskBanner;