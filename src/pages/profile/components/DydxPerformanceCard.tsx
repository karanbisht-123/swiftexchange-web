import {
  Activity,
  Calendar,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  X as XIcon,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { AreaSeries, ColorType, type IChartApi, LineType, createChart } from 'lightweight-charts';

import { portfolioUtils } from '../../../modules/walletconnect/utils/portfolioUtils';

interface DydxPerformanceCardProps {
  dydxTotal: number;
  openOrderCount: number;

  // Timeframe and date range
  timeframe: '1d' | '7d' | '30d' | '90d';
  setTimeframe: (tf: '1d' | '7d' | '30d' | '90d') => void;
  fromDate: string | null;
  toDate: string | null;
  setFromDate: (date: string | null) => void;
  setToDate: (date: string | null) => void;
  clearRange: () => void;
  isDateRangeActive: boolean;
  minFromDate: string;
  maxFromDate: string;
  minToDate: string;
  maxToDate: string;

  // Chart data
  visiblePnlPoints: any[];
  tradePnlPoints: any[];
  loadingPnl: boolean;
  loadingDateRange: boolean;
  displayedFillCount: number;
  displayedOrderCount: number;

  // Performance and financial stats
  periodStats: {
    totalDeposits: number;
    totalWithdrawals: number;
    netCapitalChange: number;
    netTradingGain: number;
    startEquity: number;
    gainPercentage: number;
    totalClosedPnl: number;
    closedTradesCount: number;
    profitableTradesCount: number;
    winRate: number;
  };
  pnlStats: {
    change: number;
    percentChange: number;
    currentEquity: number;
  };
  marginMetrics: any;
  dydxLeverage: number;
  onExportReport: () => void;

  // Funding stats
  loadingFunding: boolean;
  fundingStats: { received: number; paid: number; net: number };
}

export const DydxPerformanceCard: React.FC<DydxPerformanceCardProps> = ({
  dydxTotal,
  openOrderCount,
  timeframe,
  setTimeframe,
  fromDate,
  toDate,
  setFromDate,
  setToDate,
  clearRange,
  isDateRangeActive,
  minFromDate,
  maxFromDate,
  minToDate,
  maxToDate,
  visiblePnlPoints,
  tradePnlPoints,
  loadingPnl,
  loadingDateRange,
  displayedFillCount,
  displayedOrderCount,
  periodStats,
  pnlStats,
  marginMetrics,
  dydxLeverage,
  onExportReport,
  loadingFunding,
  fundingStats,
}) => {
  const [isDydxCollapsed, setIsDydxCollapsed] = useState<boolean>(dydxTotal === 0);
  const [chartType, setChartType] = useState<'equity' | 'trades'>('equity');
  const [crosshairData, setCrosshairData] = useState<{ time: number; value: number } | null>(null);

  useEffect(() => {
    setIsDydxCollapsed(dydxTotal === 0);
  }, [dydxTotal]);

  const displayStats = useMemo(() => {
    if (chartType === 'equity') {
      if (crosshairData && visiblePnlPoints.length > 0) {
        const firstEquity = parseFloat(visiblePnlPoints[0].equity || '0');
        const change = crosshairData.value - firstEquity;
        const percentChange = firstEquity > 0 ? (change / firstEquity) * 100 : 0;
        return {
          currentEquity: crosshairData.value,
          change,
          percentChange,
          timeLabel: new Date(crosshairData.time * 1000).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          }),
        };
      }
      return {
        currentEquity: pnlStats.currentEquity,
        change: pnlStats.change,
        percentChange: pnlStats.percentChange,
        timeLabel: 'Trading Account Value',
      };
    } else {
      if (crosshairData && tradePnlPoints.length > 0) {
        return {
          currentEquity: crosshairData.value,
          change: crosshairData.value,
          percentChange: 0,
          timeLabel: new Date(crosshairData.time * 1000).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          }),
        };
      }
      return {
        currentEquity: periodStats.totalClosedPnl,
        change: periodStats.totalClosedPnl,
        percentChange: 0,
        timeLabel: 'Cumulative Closed PnL',
      };
    }
  }, [
    crosshairData,
    pnlStats,
    visiblePnlPoints,
    chartType,
    tradePnlPoints,
    periodStats.totalClosedPnl,
  ]);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
    }

    const container = chartContainerRef.current;
    const isDark = document.documentElement.classList.contains('dark');
    const isGreen = chartType === 'equity' ? pnlStats.change >= 0 : periodStats.totalClosedPnl >= 0;

    const initialWidth = container.clientWidth || 300;
    const initialHeight = container.clientHeight || 180;

    const chart = createChart(container, {
      width: initialWidth,
      height: initialHeight,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDark ? '#e8edf8' : '#0f1729',
      },
      grid: {
        vertLines: { color: isDark ? '#1e28405d' : '#dce3ed' },
        horzLines: { color: isDark ? '#1e28405d' : '#dce3ed' },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
      },
      rightPriceScale: {
        borderVisible: false,
      },
      crosshair: {
        horzLine: {
          labelBackgroundColor: isDark ? '#1e2840' : '#e4e8f0',
        },
        vertLine: {
          labelBackgroundColor: isDark ? '#1e2840' : '#e4e8f0',
        },
      },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: isGreen ? '#10b981' : '#ef4444',
      topColor: isGreen ? '#10b98125' : '#ef444425',
      bottomColor: 'transparent',
      lineWidth: 2,
      lineType: chartType === 'trades' ? LineType.WithSteps : LineType.Simple,
    });

    seriesRef.current = series;

    const hasData =
      chartType === 'equity' ? visiblePnlPoints.length >= 2 : tradePnlPoints.length >= 1;

    if (hasData) {
      const data =
        chartType === 'equity'
          ? visiblePnlPoints.map(p => ({
              time: Math.floor(new Date(p.createdAt).getTime() / 1000) as any,
              value: parseFloat(p.equity || '0'),
            }))
          : tradePnlPoints;

      const sortedData = [...data].sort((a, b) => a.time - b.time);
      const uniqueData: typeof data = [];
      const seenTimes = new Set<number>();
      for (const d of sortedData) {
        if (!seenTimes.has(d.time)) {
          seenTimes.add(d.time);
          uniqueData.push(d);
        } else {
          uniqueData[uniqueData.length - 1].value = d.value;
        }
      }

      series.setData(uniqueData);
      chart.timeScale().fitContent();
    }

    chart.subscribeCrosshairMove(param => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > container.clientWidth ||
        param.point.y < 0 ||
        param.point.y > container.clientHeight
      ) {
        setCrosshairData(null);
        return;
      }
      const val = param.seriesData.get(series) as any;
      if (val !== undefined) {
        setCrosshairData({
          time: param.time as number,
          value: val.value !== undefined ? val.value : val,
        });
      }
    });

    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && chartRef.current) {
          chartRef.current.applyOptions({
            width,
            height: height || 180,
          });
          chartRef.current.timeScale().fitContent();
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [visiblePnlPoints, tradePnlPoints, chartType, loadingPnl]);

  useEffect(() => {
    if (!seriesRef.current) return;
    const isGreen = chartType === 'equity' ? pnlStats.change >= 0 : periodStats.totalClosedPnl >= 0;
    seriesRef.current.applyOptions({
      lineColor: isGreen ? '#10b981' : '#ef4444',
      topColor: isGreen ? '#10b98125' : '#ef444425',
    });
  }, [pnlStats.change, periodStats.totalClosedPnl, chartType]);

  return (
    <div className="bg-(--color-bg-secondary) border border-(--color-border) rounded-2xl p-4 shadow-md flex flex-col space-y-3">
      <div
        onClick={() => setIsDydxCollapsed(!isDydxCollapsed)}
        className="flex items-center justify-between cursor-pointer py-1 select-none"
      >
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-emerald-400" />
          <h4 className="font-bold text-sm text-(--color-text-primary)">dYdX Performance</h4>
          {dydxTotal === 0 && (
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold">
              Empty
            </span>
          )}
        </div>
        <ChevronRight
          size={16}
          className={`text-(--color-text-secondary) transition-transform duration-300 ${!isDydxCollapsed ? 'rotate-90' : ''}`}
        />
      </div>

      {!isDydxCollapsed && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <span className="text-xs font-semibold text-(--color-text-secondary)">
                {chartType === 'equity' ? 'Trading Account Value' : 'Cumulative Closed PnL'}
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-black text-(--color-text-primary)">
                  {portfolioUtils.formatUSD(displayStats.currentEquity)}
                </span>
                {chartType === 'equity' ? (
                  displayStats.change !== 0 && (
                    <span
                      className={`text-xs font-bold flex items-center ${displayStats.change >= 0 ? 'text-green-400' : 'text-red-400'}`}
                    >
                      {displayStats.change >= 0 ? '▲' : '▼'}{' '}
                      {portfolioUtils.formatUSD(Math.abs(displayStats.change))} (
                      {displayStats.percentChange.toFixed(2)}%)
                    </span>
                  )
                ) : (
                  <span
                    className={`text-xs font-bold flex items-center ${periodStats.totalClosedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {periodStats.closedTradesCount > 0
                      ? `${periodStats.winRate.toFixed(0)}% Profitable (${periodStats.profitableTradesCount}/${periodStats.closedTradesCount})`
                      : 'No closed trades'}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                <div className="flex items-center bg-(--color-bg-tertiary) border border-(--color-border) rounded-xl px-3 py-1.5 shadow-sm gap-2">
                  <Calendar size={13} className="text-(--color-text-secondary) shrink-0" />
                  <input
                    type="date"
                    value={fromDate || ''}
                    min={minFromDate}
                    max={maxFromDate}
                    onKeyDown={e => e.preventDefault()}
                    onChange={e => setFromDate(e.target.value || null)}
                    className="bg-transparent text-[11.5px] font-semibold text-(--color-text-primary) outline-none w-[105px] cursor-pointer"
                    placeholder="From"
                  />
                  <span className="text-(--color-text-secondary) text-[10px] font-bold px-0.5 select-none">
                    TO
                  </span>
                  <input
                    type="date"
                    value={toDate || ''}
                    min={minToDate}
                    max={maxToDate}
                    onKeyDown={e => e.preventDefault()}
                    onChange={e => setToDate(e.target.value || null)}
                    className="bg-transparent text-[11.5px] font-semibold text-(--color-text-primary) outline-none w-[105px] cursor-pointer"
                    placeholder="To"
                  />
                </div>
                {isDateRangeActive && (
                  <button
                    onClick={clearRange}
                    className="p-1.5 rounded-lg bg-(--color-bg-tertiary) border border-(--color-border) text-(--color-text-secondary) hover:text-red-400 transition"
                  >
                    <XIcon size={12} />
                  </button>
                )}
                <button
                  onClick={onExportReport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 cursor-pointer"
                >
                  <Download size={13} className="shrink-0" />
                  dYdX Report
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto sm:justify-end">
                <div className="flex gap-1 bg-(--color-bg-tertiary) p-1 rounded-xl border border-(--color-border)">
                  <button
                    onClick={() => setChartType('equity')}
                    className={`px-3 py-1 rounded-lg text-[10.5px] font-bold transition-all ${
                      chartType === 'equity'
                        ? 'bg-brand text-white shadow-sm'
                        : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'
                    }`}
                  >
                    Equity
                  </button>
                  <button
                    onClick={() => setChartType('trades')}
                    className={`px-3 py-1 rounded-lg text-[10.5px] font-bold transition-all ${
                      chartType === 'trades'
                        ? 'bg-brand text-white shadow-sm'
                        : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'
                    }`}
                  >
                    Trade PnL
                  </button>
                </div>
                {!isDateRangeActive ? (
                  <div className="flex gap-1 bg-(--color-bg-tertiary) p-1 rounded-xl border border-(--color-border)">
                    {(['1d', '7d', '30d', '90d'] as const).map(tf => (
                      <button
                        key={tf}
                        onClick={() => setTimeframe(tf)}
                        className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold transition-all ${
                          timeframe === tf
                            ? 'bg-brand text-white shadow-sm'
                            : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'
                        }`}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[10.5px] text-brand-primary font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
                    Custom range
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="h-[180px] w-full relative flex items-center justify-center bg-(--color-bg-secondary) rounded-xl overflow-hidden border border-(--color-border)/50 p-2">
            {loadingPnl ? (
              <div className="flex flex-col items-center justify-center h-full w-full gap-2 text-xs text-(--color-text-secondary)">
                <RefreshCw size={18} className="animate-spin text-brand-primary" />
                <span>Loading metrics…</span>
              </div>
            ) : (
                chartType === 'equity' ? visiblePnlPoints.length < 2 : tradePnlPoints.length < 1
              ) ? (
              <div className="flex flex-col items-center justify-center h-full w-full gap-2 text-xs text-(--color-text-secondary) italic text-center px-4">
                <span>
                  {chartType === 'equity'
                    ? 'Syncing transaction indices…'
                    : 'No closed trades for this period.'}
                </span>
              </div>
            ) : (
              <div ref={chartContainerRef} className="w-full h-full" />
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-2 text-xs">
            <div className="p-2.5 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl">
              <span className="text-(--color-text-secondary) block text-[10px] uppercase font-semibold tracking-wider">
                Margin Usage
              </span>
              <span className="font-black text-sm text-(--color-text-primary) mt-0.5 block">
                {marginMetrics ? `${marginMetrics.marginUsagePercent.toFixed(2)}%` : '0.00%'}
              </span>
            </div>
            <div className="p-2.5 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl">
              <span className="text-(--color-text-secondary) block text-[10px] uppercase font-semibold tracking-wider">
                Leverage
              </span>
              <span className="font-black text-sm text-(--color-text-primary) mt-0.5 block">
                {`${dydxLeverage.toFixed(2)}×`}
              </span>
            </div>
            <div className="p-2.5 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl">
              <span className="text-(--color-text-secondary) block text-[10px] uppercase font-semibold tracking-wider">
                Open Orders
              </span>
              <span className="font-black text-sm text-(--color-text-primary) mt-0.5 block">
                {openOrderCount || 0}
              </span>
            </div>
            <div className="p-2.5 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl">
              <span className="text-(--color-text-secondary) block text-[10px] uppercase font-semibold tracking-wider">
                {isDateRangeActive ? 'Fills' : 'Filled Trades'}
              </span>
              <span className="font-black text-sm text-(--color-text-primary) mt-0.5 block">
                {loadingDateRange ? '…' : displayedFillCount}
              </span>
            </div>
            <div className="p-2.5 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl">
              <span className="text-(--color-text-secondary) block text-[10px] uppercase font-semibold tracking-wider">
                {isDateRangeActive ? 'Orders' : 'Order History'}
              </span>
              <span className="font-black text-sm text-(--color-text-primary) mt-0.5 block">
                {loadingDateRange ? '…' : displayedOrderCount}
              </span>
            </div>
          </div>

          {/* Funding Payments stats overview */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-brand-primary/5 p-3 rounded-xl border border-brand-primary/10">
            <div>
              <span className="text-(--color-text-secondary) block text-[9.5px] uppercase font-bold tracking-wider">
                Total Funding Received
              </span>
              <span className="font-extrabold text-sm text-emerald-400 mt-1 block">
                {loadingFunding ? (
                  <Loader2 size={12} className="animate-spin text-emerald-400 inline" />
                ) : (
                  portfolioUtils.formatUSD(fundingStats.received)
                )}
              </span>
            </div>
            <div>
              <span className="text-(--color-text-secondary) block text-[9.5px] uppercase font-bold tracking-wider">
                Total Funding Paid
              </span>
              <span className="font-extrabold text-sm text-rose-400 mt-1 block">
                {loadingFunding ? (
                  <Loader2 size={12} className="animate-spin text-rose-400 inline" />
                ) : (
                  portfolioUtils.formatUSD(fundingStats.paid)
                )}
              </span>
            </div>
            <div>
              <span className="text-(--color-text-secondary) block text-[9.5px] uppercase font-bold tracking-wider">
                Net Funding PnL
              </span>
              <span
                className={`font-black text-sm mt-1 block ${fundingStats.net >= 0 ? 'text-green-400' : 'text-red-400'}`}
              >
                {loadingFunding ? (
                  <Loader2 size={12} className="animate-spin text-muted inline" />
                ) : (
                  `${fundingStats.net >= 0 ? '+' : ''}${portfolioUtils.formatUSD(fundingStats.net)}`
                )}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs bg-(--color-bg-tertiary)/20 p-3 rounded-xl border border-(--color-border)/40">
            <div>
              <span className="text-(--color-text-secondary) block text-[9.5px] uppercase font-semibold tracking-wider">
                Total Deposited
              </span>
              <span className="font-bold text-xs text-(--color-text-primary) mt-1 block">
                {portfolioUtils.formatUSD(periodStats.totalDeposits)}
              </span>
            </div>
            <div>
              <span className="text-(--color-text-secondary) block text-[9.5px] uppercase font-semibold tracking-wider">
                Total Withdrawn
              </span>
              <span className="font-bold text-xs text-(--color-text-primary) mt-1 block">
                {portfolioUtils.formatUSD(periodStats.totalWithdrawals)}
              </span>
            </div>
            <div>
              <span className="text-(--color-text-secondary) block text-[9.5px] uppercase font-semibold tracking-wider">
                Net Capital
              </span>
              <span className="font-bold text-xs text-(--color-text-primary) mt-1 block">
                {portfolioUtils.formatUSD(periodStats.netCapitalChange)}
              </span>
            </div>
            <div>
              <span className="text-(--color-text-secondary) block text-[9.5px] uppercase font-semibold tracking-wider">
                Net Period PnL
              </span>
              <span
                className={`font-black text-xs mt-1 block ${periodStats.netTradingGain >= 0 ? 'text-green-400' : 'text-red-400'}`}
              >
                {periodStats.netTradingGain >= 0 ? '+' : ''}
                {portfolioUtils.formatUSD(periodStats.netTradingGain)}
                {periodStats.startEquity + periodStats.totalDeposits > 0 && (
                  <span className="text-[10px] ml-1 font-semibold opacity-90">
                    ({periodStats.gainPercentage >= 0 ? '+' : ''}
                    {periodStats.gainPercentage.toFixed(2)}%)
                  </span>
                )}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
