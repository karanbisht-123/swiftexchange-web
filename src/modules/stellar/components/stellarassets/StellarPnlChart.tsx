import React, { useEffect, useRef, useState } from 'react';

import { AreaSeries, ColorType, type ISeriesApi, type Time, createChart } from 'lightweight-charts';

export interface StellarChartPoint {
  date: string;
  realizedPnl: number;
  holdingsValue?: number;
}

export interface StellarChartData {
  from?: string;
  to?: string;
  granularity?: string;
  points?: StellarChartPoint[];
}

interface StellarPnlChartProps {
  chart?: StellarChartData | null;
  disposals?: any[];
  totalUnrealized?: number;
  totalRealized?: number;
}

const StellarPnlChart: React.FC<StellarPnlChartProps> = ({
  chart,
  disposals = [],
  totalUnrealized = 0,
  totalRealized,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  const [activeMetric, setActiveMetric] = useState<'pnl' | 'holdings'>('pnl');
  const [hasData, setHasData] = useState(true);
  const [metricValue, setMetricValue] = useState(0);

  const hasHoldingsPoints = Boolean(
    chart?.points && chart.points.some(p => (p.holdingsValue ?? 0) > 0)
  );

  useEffect(() => {
    let chartPoints: { time: Time; value: number }[] = [];

    if (chart?.points && chart.points.length > 0) {
      if (activeMetric === 'holdings') {
        chartPoints = chart.points.map(p => ({
          time: p.date as Time,
          value: p.holdingsValue ?? 0,
        }));
        const lastVal = chartPoints[chartPoints.length - 1]?.value ?? 0;
        setMetricValue(lastVal);
      } else {
        chartPoints = chart.points.map(p => ({
          time: p.date as Time,
          value: p.realizedPnl,
        }));
        const lastVal =
          totalRealized !== undefined
            ? totalRealized
            : (chartPoints[chartPoints.length - 1]?.value ?? 0);
        setMetricValue(lastVal + totalUnrealized);
      }
    } else if (disposals && disposals.length > 0) {
      const dailyPnl: Record<string, number> = {};
      disposals.forEach(d => {
        if (d.date && typeof d.pnl === 'number') {
          if (!dailyPnl[d.date]) dailyPnl[d.date] = 0;
          dailyPnl[d.date] += d.pnl;
        }
      });

      const sortedDates = Object.keys(dailyPnl).sort();
      let cumulative = 0;
      chartPoints = sortedDates.map(date => {
        cumulative += dailyPnl[date];
        return { time: date as Time, value: cumulative };
      });

      const today = new Date().toISOString().split('T')[0];
      const finalValue = cumulative + totalUnrealized;
      if (chartPoints.length === 0 || chartPoints[chartPoints.length - 1].time !== today) {
        chartPoints.push({ time: today as Time, value: finalValue });
      } else {
        chartPoints[chartPoints.length - 1].value = finalValue;
      }
      setMetricValue(finalValue);
    }

    if (chartPoints.length === 0) {
      setHasData(false);
      return;
    }
    setHasData(true);

    if (chartContainerRef.current) {
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch {
          // ignore
        }
      }

      const handleResize = () => {
        if (chartRef.current && chartContainerRef.current) {
          chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
        }
      };

      const chartInstance = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#9ca3af',
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
        },
        rightPriceScale: {
          borderVisible: false,
        },
        timeScale: {
          borderVisible: false,
          timeVisible: true,
        },
        crosshair: {
          mode: 0,
        },
        width: chartContainerRef.current.clientWidth,
        height: 280,
      });

      chartRef.current = chartInstance;

      const isPositive = metricValue >= 0;
      const lineColor =
        activeMetric === 'holdings' ? '#3b82f6' : isPositive ? '#10b981' : '#f43f5e';
      const topColor =
        activeMetric === 'holdings'
          ? 'rgba(59, 130, 246, 0.3)'
          : isPositive
            ? 'rgba(16, 185, 129, 0.3)'
            : 'rgba(244, 63, 94, 0.3)';
      const bottomColor = 'rgba(0, 0, 0, 0)';

      const areaSeries = chartInstance.addSeries(AreaSeries, {
        lineColor,
        topColor,
        bottomColor,
        lineWidth: 2,
        priceFormat: {
          type: 'price',
          precision: 4,
          minMove: 0.0001,
        },
      });

      areaSeries.setData(chartPoints);
      chartInstance.timeScale().fitContent();
      seriesRef.current = areaSeries;

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        chartInstance.remove();
      };
    }
  }, [chart, disposals, totalUnrealized, totalRealized, activeMetric, metricValue]);

  return (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col">
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[var(--color-text-primary)] tracking-tight">
              {activeMetric === 'holdings' ? 'Portfolio Value' : 'Cumulative Realized PnL'}
            </h3>
            {hasHoldingsPoints && (
              <div className="flex items-center bg-[var(--color-bg-tertiary)] rounded-lg p-0.5 border border-[var(--color-border)] ml-2">
                <button
                  onClick={() => setActiveMetric('pnl')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors ${
                    activeMetric === 'pnl'
                      ? 'bg-[var(--color-brand-primary)] text-white'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  PnL
                </button>
                <button
                  onClick={() => setActiveMetric('holdings')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors ${
                    activeMetric === 'holdings'
                      ? 'bg-[var(--color-brand-primary)] text-white'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  Value
                </button>
              </div>
            )}
          </div>
          <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5 font-medium">
            performance over time
          </p>
        </div>
        {hasData && (
          <div className="text-right">
            <span
              className={`text-xl font-black ${
                activeMetric === 'holdings'
                  ? 'text-[var(--color-text-primary)]'
                  : metricValue >= 0
                    ? 'text-emerald-500'
                    : 'text-rose-500'
              }`}
            >
              {activeMetric !== 'holdings' && metricValue >= 0 ? '+' : ''}
              {metricValue.toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 4,
              })}
            </span>
          </div>
        )}
      </div>

      {!hasData ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[250px] opacity-50">
          <svg
            className="w-12 h-12 text-[var(--color-text-secondary)] mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <span className="text-sm font-bold text-[var(--color-text-secondary)]">
            No historical data to chart
          </span>
        </div>
      ) : (
        <div ref={chartContainerRef} className="w-full relative" />
      )}
    </div>
  );
};

export default StellarPnlChart;
