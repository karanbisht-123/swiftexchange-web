import React, { useEffect, useRef, useState } from 'react';

import { AreaSeries, ColorType, type ISeriesApi, type Time, createChart } from 'lightweight-charts';

interface StellarPnlChartProps {
  disposals: any[];
  totalUnrealized?: number;
}

const StellarPnlChart: React.FC<StellarPnlChartProps> = ({ disposals, totalUnrealized = 0 }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  const [hasData, setHasData] = useState(true);
  const [totalCumulativePnl, setTotalCumulativePnl] = useState(0);

  useEffect(() => {
    if ((!disposals || disposals.length === 0) && totalUnrealized === 0) {
      setHasData(false);
      return;
    }
    setHasData(true);

    // 1. Aggregate Realized PnL by date
    const dailyPnl: Record<string, number> = {};
    disposals?.forEach(d => {
      if (d.date && typeof d.pnl === 'number') {
        if (!dailyPnl[d.date]) dailyPnl[d.date] = 0;
        dailyPnl[d.date] += d.pnl;
      }
    });

    // 2. Sort dates and calculate cumulative PnL
    const sortedDates = Object.keys(dailyPnl).sort();
    let cumulative = 0;
    const chartData = sortedDates.map(date => {
      cumulative += dailyPnl[date];
      return { time: date as Time, value: cumulative };
    });

    // 3. Append Current Total PnL (Realized + Unrealized)
    const today = new Date().toISOString().split('T')[0];
    const finalValue = cumulative + totalUnrealized;

    // Only append if it's a new day or if we have no chart data yet
    if (chartData.length === 0 || chartData[chartData.length - 1].time !== today) {
      chartData.push({ time: today as Time, value: finalValue });
    } else {
      chartData[chartData.length - 1].value = finalValue;
    }

    setTotalCumulativePnl(finalValue);

    // Ensure we have at least one data point
    if (chartData.length === 0) {
      setHasData(false);
      return;
    }

    // 3. Initialize chart
    if (chartContainerRef.current) {
      const handleResize = () => {
        if (chartRef.current && chartContainerRef.current) {
          chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
        }
      };

      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#9ca3af', // text-[var(--color-text-secondary)]
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

      chartRef.current = chart;

      const isPositive = cumulative >= 0;
      const lineColor = isPositive ? '#10b981' : '#f43f5e'; // emerald-500 or rose-500
      const topColor = isPositive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)';
      const bottomColor = isPositive ? 'rgba(16, 185, 129, 0.0)' : 'rgba(244, 63, 94, 0.0)';

      const areaSeries = chart.addSeries(AreaSeries, {
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

      areaSeries.setData(chartData);
      chart.timeScale().fitContent();
      seriesRef.current = areaSeries;

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        chart.remove();
      };
    }
  }, [disposals]);

  return (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] tracking-tight">
            Cumulative Realized PnL
          </h3>
          <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5 font-medium">
            Historical performance over time
          </p>
        </div>
        {hasData && (
          <div className="text-right">
            <span
              className={`text-xl font-black ${totalCumulativePnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}
            >
              {totalCumulativePnl >= 0 ? '+' : ''}
              {totalCumulativePnl.toLocaleString('en-US', {
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
            No historical disposals to chart
          </span>
        </div>
      ) : (
        <div ref={chartContainerRef} className="w-full relative" />
      )}
    </div>
  );
};

export default StellarPnlChart;
