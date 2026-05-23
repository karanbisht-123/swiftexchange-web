import { AlertTriangle, Settings, Shield, X } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';

import AddMarginModal from './shared/Addmarginmodal';
import { useDydxData } from '../hooks/useDydxData';
import { useOraclePrices } from '../hooks/useOraclePrices';
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
const STORAGE_KEY = 'liq_banner_distance_threshold';
const DEFAULT_THRESHOLD = 20; // show positions within 20% of liquidation by default

interface RiskPosition {
  position: Position;
  liquidationPrice: number;
  oraclePrice: number;
  distancePct: number;
  isIsolated: boolean;
  margin: number;
}

function useLiquidationRisk(distanceThreshold: number): RiskPosition[] {
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
        const storedLev = storedRaw ? parseFloat(storedRaw) : 0;
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

      // Show position if it's within the user-controlled distance threshold from liquidation
      if (distancePct <= distanceThreshold) {
        risks.push({ position: pos, liquidationPrice: liqPrice, oraclePrice: oracle, distancePct, isIsolated, margin });
      }
    });

    return risks.sort((a, b) => a.distancePct - b.distancePct);
  }, [positions, marketCache, oraclePrices, isolatedEquityBySubaccount, childSubaccounts, distanceThreshold]);
}

// ─── Helper: persist threshold ────────────────────────────────────────────────
function readStoredThreshold(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed >= 5 && parsed <= 95) return parsed;
    }
  } catch { /* ignore */ }
  return DEFAULT_THRESHOLD;
}

// ─── Health bar color based on distance ──────────────────────────────────────
function getHealthColor(distancePct: number, criticalThreshold: number) {
  if (distancePct < criticalThreshold * 0.5) return { bar: 'bg-red-500', text: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' };
  if (distancePct < criticalThreshold) return { bar: 'bg-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/5 border-amber-500/15' };
  return { bar: 'bg-green-500', text: 'text-green-400', bg: 'bg-green-500/5 border-green-500/15' };
}

// ─── Main Component ───────────────────────────────────────────────────────────
const LiquidationRiskBanner: React.FC = () => {
  const [distanceThreshold, setDistanceThresholdState] = useState<number>(readStoredThreshold);
  const [dismissed, setDismissed] = useState(false);
  const [addMarginPos, setAddMarginPos] = useState<Position | null>(null);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [showSettings, setShowSettings] = useState(false);

  const riskPositions = useLiquidationRisk(distanceThreshold);

  // Critical = within half the threshold distance
  const criticalThreshold = distanceThreshold * 0.5;

  const setDistanceThreshold = useCallback((val: number) => {
    setDistanceThresholdState(val);
    try { localStorage.setItem(STORAGE_KEY, String(val)); } catch { /* ignore */ }
  }, []);

  React.useEffect(() => {
    if (riskPositions.length > 0) setDismissed(false);
  }, [riskPositions.length]);

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

  const hasCritical = riskPositions.some(r => r.distancePct < criticalThreshold);
  const isTestMode = distanceThreshold !== DEFAULT_THRESHOLD;

  // Always render the settings toggle when there are positions (even if dismissed)
  // but only if the user has no positions at all do we truly hide
  const { positions: rawPositions } = useDydxData();
  const hasAnyPositions = (rawPositions as Position[]).some(p => Math.abs(parseFloat(p.size || '0')) > 0);

  // Show the settings button even when no risk positions (so user can adjust threshold)
  const showSettingsOnly = hasAnyPositions && (riskPositions.length === 0 || dismissed);

  if (!hasAnyPositions && !showSettings) return null;

  if (showSettingsOnly) {
    return (
      <>
        {/* Compact bar when no positions at risk — just shows threshold control */}
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-(--color-border) bg-(--color-bg-tertiary)/40 text-xs">
          <Shield size={13} className="text-(--color-text-secondary) flex-shrink-0" />
          <span className="text-(--color-text-secondary) flex-1">
            No positions within <span className="font-bold text-(--color-text-primary)">{distanceThreshold}%</span> of liquidation
          </span>
          <button
            onClick={() => setShowSettings(s => !s)}
            className={`p-1 rounded-lg transition flex-shrink-0 ${showSettings ? 'bg-brand-primary/20 text-brand-primary' : 'hover:bg-(--color-bg-tertiary) text-(--color-text-secondary) hover:text-(--color-text-primary)'}`}
            title="Adjust liquidation alert threshold"
          >
            <Settings size={13} className={showSettings ? 'animate-spin-once' : ''} />
          </button>
          {showSettings && (
            <div className="flex items-center gap-3 border-l border-(--color-border) pl-3 ml-1">
              <span className="text-(--color-text-secondary) whitespace-nowrap">Alert within:</span>
              <input
                type="range"
                min={5}
                max={95}
                step={5}
                value={distanceThreshold}
                onChange={e => setDistanceThreshold(Number(e.target.value))}
                className="w-28 accent-brand-primary cursor-pointer"
              />
              <span className="font-bold text-(--color-text-primary) w-8 text-right">{distanceThreshold}%</span>
              {isTestMode && (
                <button
                  onClick={() => setDistanceThreshold(DEFAULT_THRESHOLD)}
                  className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25 transition whitespace-nowrap"
                >
                  Reset ({DEFAULT_THRESHOLD}%)
                </button>
              )}
            </div>
          )}
        </div>

        {addMarginPos && (
          <AddMarginModal
            isOpen={!!addMarginPos}
            onClose={() => setAddMarginPos(null)}
            position={addMarginPos}
            onSuccess={() => setAddMarginPos(null)}
          />
        )}
      </>
    );
  }

  if (riskPositions.length === 0 || dismissed) return null;

  return (
    <>
      <div
        className={`rounded-2xl border p-4 shadow-lg transition-all ${
          hasCritical
            ? 'bg-red-500/10 border-red-500/40'
            : 'bg-amber-500/10 border-amber-500/40'
        }`}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertTriangle
              size={18}
              className={`flex-shrink-0 ${hasCritical ? 'text-red-400' : 'text-amber-400'} ${hasCritical ? 'animate-pulse' : ''}`}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-bold ${hasCritical ? 'text-red-400' : 'text-amber-400'}`}>
                  {riskPositions.length === 1
                    ? '1 Position Near Liquidation'
                    : `${riskPositions.length} Positions Near Liquidation`}
                </span>
                {isTestMode && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25 font-semibold flex-shrink-0">
                    Test Mode: {distanceThreshold}%
                  </span>
                )}
              </div>
              <p className="text-xs text-(--color-text-secondary) mt-0.5">
                Add margin to reduce liquidation risk
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Settings toggle */}
            <button
              onClick={() => setShowSettings(s => !s)}
              className={`p-1.5 rounded-lg transition ${
                showSettings
                  ? 'bg-brand-primary/20 text-brand-primary'
                  : 'hover:bg-(--color-bg-tertiary) text-(--color-text-secondary) hover:text-(--color-text-primary)'
              }`}
              title="Adjust liquidation alert threshold"
            >
              <Settings size={13} />
            </button>
            {/* Dismiss */}
            <button
              onClick={() => setDismissed(true)}
              className="p-1.5 hover:bg-(--color-bg-tertiary) rounded-lg transition text-(--color-text-secondary) hover:text-(--color-text-primary)"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ── Settings panel ── */}
        {showSettings && (
          <div className="mb-3 px-3 py-2.5 rounded-xl border border-(--color-border) bg-(--color-bg-secondary)/60 flex flex-wrap items-center gap-3 text-xs">
            <Settings size={12} className="text-(--color-text-secondary) flex-shrink-0" />
            <span className="text-(--color-text-secondary)">Alert when within</span>
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <input
                type="range"
                min={5}
                max={95}
                step={5}
                value={distanceThreshold}
                onChange={e => setDistanceThreshold(Number(e.target.value))}
                className="flex-1 accent-brand-primary cursor-pointer"
              />
              <span className="font-bold text-(--color-text-primary) w-10 text-right tabular-nums">
                {distanceThreshold}%
              </span>
            </div>
            <span className="text-(--color-text-secondary)">of liquidation price</span>
            {isTestMode && (
              <button
                onClick={() => setDistanceThreshold(DEFAULT_THRESHOLD)}
                className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25 transition whitespace-nowrap"
              >
                Reset to default ({DEFAULT_THRESHOLD}%)
              </button>
            )}
          </div>
        )}

        {/* ── Position rows ── */}
        <div className="space-y-2">
          {riskPositions.map(({ position, liquidationPrice, oraclePrice, distancePct, isIsolated }) => {
            const colors = getHealthColor(distancePct, criticalThreshold);
            const icon = icons[position.market];
            // Health bar fill: 100% = at liquidation, 0% = at threshold distance
            const barFillPct = Math.max(0, Math.min(100, ((distanceThreshold - distancePct) / distanceThreshold) * 100));
            const badge = distancePct < criticalThreshold ? '🔴' : '🟡';

            return (
              <div
                key={position.market}
                className={`flex flex-col gap-2 px-3 py-2.5 rounded-xl border ${colors.bg}`}
              >
                {/* Row: icon + market info + button */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-(--color-bg-tertiary) border border-(--color-border) flex items-center justify-center overflow-hidden flex-shrink-0">
                      {icon
                        ? <img src={icon} alt={position.market} className="w-full h-full object-cover" />
                        : <span className="text-[9px] font-bold">{position.market[0]}</span>
                      }
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-(--color-text-primary)">{position.market}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          position.side === 'LONG' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                        }`}>
                          {position.side}
                        </span>
                        {!isIsolated && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-(--color-bg-tertiary) border border-(--color-border) text-(--color-text-secondary)">
                            Cross
                          </span>
                        )}
                        <span className="text-[11px]" title={distancePct < criticalThreshold ? 'Critical' : 'Warning'}>
                          {badge}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-(--color-text-secondary) mt-0.5 flex-wrap">
                        <span>Oracle: <span className="font-mono text-(--color-text-primary)">${oraclePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></span>
                        <span>Liq: <span className="font-mono text-orange-400">${liquidationPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></span>
                        <span className={`font-semibold ${colors.text}`}>
                          {distancePct.toFixed(1)}% away
                        </span>
                      </div>
                    </div>
                  </div>

                  {isIsolated ? (
                    <button
                      onClick={() => setAddMarginPos(position)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
                        distancePct < criticalThreshold
                          ? 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30'
                          : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      <Shield size={12} />
                      Add Margin
                    </button>
                  ) : (
                    <span className="text-[10px] text-(--color-text-secondary) text-right flex-shrink-0 max-w-[80px]">
                      Close or reduce to manage risk
                    </span>
                  )}
                </div>

                {/* Health bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-(--color-bg-tertiary) border border-(--color-border)/40 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
                      style={{ width: `${barFillPct}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-bold tabular-nums ${colors.text} flex-shrink-0`}>
                    {distancePct.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Footer ── */}
        <div className={`mt-3 pt-3 border-t ${hasCritical ? 'border-red-500/20' : 'border-amber-500/20'} text-[10px] text-(--color-text-secondary) flex items-center justify-between gap-1.5`}>
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={10} className={hasCritical ? 'text-red-400' : 'text-amber-400'} />
            Showing positions within <span className="font-bold text-(--color-text-primary) mx-0.5">{distanceThreshold}%</span> of liquidation
          </div>
          {isTestMode && (
            <span className="text-blue-400 font-semibold">● Test mode active</span>
          )}
        </div>
      </div>

      {addMarginPos && (
        <AddMarginModal
          isOpen={!!addMarginPos}
          onClose={() => setAddMarginPos(null)}
          position={addMarginPos}
          onSuccess={() => setAddMarginPos(null)}
        />
      )}
    </>
  );
};

export default LiquidationRiskBanner;
