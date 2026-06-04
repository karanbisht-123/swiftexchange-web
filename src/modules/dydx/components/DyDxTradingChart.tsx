import {
  BarChart3,
  CandlestickChart,
  ChevronDown,
  Download,
  Maximize2,
  Minimize2,
  Settings,
  TrendingUp,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  LineSeries,
  LineStyle,
  createChart,
} from 'lightweight-charts';

import { type CandleResolution, useRealtimeChart } from '../hooks/useCandles';
import useMarketStore from '../store/marketStore';

type ChartType = 'candlestick' | 'line' | 'area';

const useTheme = () => {
  const [isDark, setIsDark] = useState(
    typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
};

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
};

const chartTypeIcons: Record<ChartType, React.ReactNode> = {
  candlestick: <CandlestickChart className="w-4 h-4" />,
  line: <TrendingUp className="w-4 h-4" />,
  area: <BarChart3 className="w-4 h-4" />,
};

function isValidCandle(c: { open: number; high: number; low: number; close: number }): boolean {
  return (
    c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0 &&
    isFinite(c.open) && isFinite(c.high) && isFinite(c.low) && isFinite(c.close)
  );
}

export default function DyDxTradingChart() {
  const isDark = useTheme();
  const isMobile = useIsMobile();
  const [timeframe, setTimeframe] = useState<CandleResolution>('15MINS');
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [showVolume, setShowVolume] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showChartTypeMenu, setShowChartTypeMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const { selectedMarket } = useMarketStore();

  const { candles, latestCandle, isLoading, isFetchingMore, error, fetchMore } = useRealtimeChart(
    selectedMarket,
    timeframe,
    1000
  );

  const lastDatasetIdRef = useRef('');
  const lastBarTimeRef = useRef<number>(0);
  const prevMarketRef = useRef<string>('');
  const prevTimeframeRef = useRef<CandleResolution | null>(null);

  const setVisibleRange = useCallback((chart: IChartApi, dataLength: number) => {
    if (dataLength === 0) return;
    const visibleBars = isMobile ? 45 : 80;
    if (dataLength > visibleBars) {
      chart.timeScale().setVisibleLogicalRange({
        from: dataLength - visibleBars,
        to: dataLength + 3,
      });
    } else {
      chart.timeScale().fitContent();
    }
  }, [isMobile]);

  const getThemeColors = useCallback(() => {
    if (isDark) {
      return {
        background: '#0f1528',
        textColor: '#e8edf8',
        gridColor: '#1e28405d',
        borderColor: '#1e2840',
        upColor: '#0ecb81',
        downColor: '#ff4d4d',
        volumeColor: 'rgba(128, 128, 128, 0.2)',
        crosshairColor: '#4a5680',
      };
    }
    return {
      background: '#f7f8fc',
      textColor: '#0f1729',
      gridColor: '#dce3ed',
      borderColor: '#e4e8f0',
      upColor: '#00b074',
      downColor: '#ff3b30',
      volumeColor: 'rgba(107, 114, 128, 0.2)',
      crosshairColor: '#8896b3',
    };
  }, [isDark]);

  const isFetchingMoreRef = useRef(false);
  useEffect(() => {
    isFetchingMoreRef.current = isFetchingMore;
  }, [isFetchingMore]);

  const candlesRef = useRef(candles);
  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);



  useEffect(() => {
    const firstCandleTime = candles[0]?.startedAt || 'none';
    const lastCandleTime = candles[candles.length - 1]?.startedAt || 'none';
    const currentDatasetId = `${selectedMarket}-${timeframe}-${candles.length}-${firstCandleTime}-${lastCandleTime}`;

    const currentCandleTicker = candles[0]?.ticker || '';

    const isMatchingMarket = !currentCandleTicker || currentCandleTicker === selectedMarket || selectedMarket.startsWith(currentCandleTicker);

    if (lastDatasetIdRef.current !== currentDatasetId && isMatchingMarket) {
      const colors = getThemeColors();
      const candleData = candles
        .map(c => ({
          time: Math.floor(new Date(c.startedAt).getTime() / 1000) as any,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
          volume: parseFloat(c.usdVolume),
        }))
        .filter(isValidCandle)
        .sort((a, b) => a.time - b.time);

      if (!seriesRef.current) return;

      try {
        if (candleData.length === 0) {
          seriesRef.current.setData([]);
          if (volumeSeriesRef.current) volumeSeriesRef.current.setData([]);
          return;
        }

        if (chartType === 'candlestick') {
          seriesRef.current.setData(candleData);
        } else {
          seriesRef.current.setData(candleData.map(c => ({ time: c.time, value: c.close })));
        }

        // Track the latest bar time
        if (candleData.length > 0) {
          lastBarTimeRef.current = candleData[candleData.length - 1].time;
        }

        if (showVolume && volumeSeriesRef.current) {
          volumeSeriesRef.current.setData(
            candleData.map(c => ({
              time: c.time,
              value: c.volume,
              color: c.close >= c.open ? colors.upColor + '40' : colors.downColor + '40',
            }))
          );
        }

        const prevMarket = prevMarketRef.current;
        const prevTimeframe = prevTimeframeRef.current;
        const marketOrTimeframeChanged = prevMarket !== selectedMarket || prevTimeframe !== timeframe;

        if (marketOrTimeframeChanged && chartRef.current) {
          setVisibleRange(chartRef.current, candleData.length);
          prevMarketRef.current = selectedMarket;
          prevTimeframeRef.current = timeframe;
        }

        lastDatasetIdRef.current = currentDatasetId;
      } catch (err) {
        console.error('[Chart] Error setting data:', err);
      }
    }
  }, [candles, selectedMarket, timeframe, chartType, showVolume, getThemeColors]);

  const createChartInstance = useCallback(() => {
    if (!chartContainerRef.current) return;

    const colors = getThemeColors();
    const container = chartContainerRef.current;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
    }

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.textColor,
        fontSize: isMobile ? 10 : 12,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
      grid: {
        vertLines: {
          color: showGrid ? colors.gridColor : 'transparent',
          style: LineStyle.Solid,
          visible: showGrid,
        },
        horzLines: {
          color: showGrid ? colors.gridColor : 'transparent',
          style: LineStyle.Solid,
          visible: showGrid,
        },
      },
      crosshair: {
        mode: showCrosshair ? CrosshairMode.Normal : CrosshairMode.Hidden,
        vertLine: {
          color: colors.crosshairColor,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: colors.borderColor,
        },
        horzLine: {
          color: colors.crosshairColor,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: colors.borderColor,
        },
      },
      rightPriceScale: {
        borderColor: colors.borderColor,
        scaleMargins: {
          top: 0.08,
          bottom: showVolume ? 0.22 : 0.08,
        },
        minimumWidth: isMobile ? 50 : 65,
      },
      timeScale: {
        borderColor: colors.borderColor,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: isMobile ? 12 : 20,
        barSpacing: isMobile ? 8 : 12,
        minBarSpacing: isMobile ? 3 : 5,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });
    chart.timeScale().subscribeVisibleTimeRangeChange(range => {
      if (!range || isFetchingMoreRef.current) return;

      const logicalRange = chart.timeScale().getVisibleLogicalRange();
      if (logicalRange && logicalRange.from < 10) {
        fetchMore();
      }
    });

    chartRef.current = chart;

    if (chartType === 'candlestick') {
      const candlestickSeries = chart.addSeries(CandlestickSeries, {
        upColor: colors.upColor,
        downColor: colors.downColor,
        borderUpColor: colors.upColor,
        borderDownColor: colors.downColor,
        wickUpColor: colors.upColor,
        wickDownColor: colors.downColor,
      });
      seriesRef.current = candlestickSeries;
    } else if (chartType === 'line') {
      const lineSeries = chart.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
      });
      seriesRef.current = lineSeries;
    } else if (chartType === 'area') {
      const areaSeries = chart.addSeries(AreaSeries, {
        topColor: isDark ? '#3b82f666' : '#3b82f64D',
        bottomColor: '#3b82f600',
        lineColor: '#3b82f6',
        lineWidth: 2,
      });
      seriesRef.current = areaSeries;
    }

    if (showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: colors.volumeColor,
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      volumeSeriesRef.current = volumeSeries;

      chart.priceScale('volume').applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });
    }
    const currentCandles = candlesRef.current;
    if (currentCandles.length > 0) {
      const candleData = currentCandles
        .map(c => ({
          time: Math.floor(new Date(c.startedAt).getTime() / 1000) as any,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
          volume: parseFloat(c.usdVolume),
        }))
        .filter(c => c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0)
        .sort((a, b) => a.time - b.time);

      if (candleData.length > 0) {
        if (chartType === 'candlestick') {
          seriesRef.current?.setData(candleData);
        } else {
          seriesRef.current?.setData(candleData.map(c => ({ time: c.time, value: c.close })));
        }
        if (candleData.length > 0) {
          lastBarTimeRef.current = candleData[candleData.length - 1].time;
        }

        if (showVolume && volumeSeriesRef.current) {
          volumeSeriesRef.current.setData(
            candleData.map(c => ({
              time: c.time,
              value: c.volume,
              color: c.close >= c.open ? colors.upColor + '40' : colors.downColor + '40',
            }))
          );
        }
        setVisibleRange(chart, candleData.length);
      }
    }
  }, [chartType, showVolume, showGrid, showCrosshair, isDark, isMobile, getThemeColors]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;

    resizeObserverRef.current = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry || !chartRef.current) return;

      const { width, height } = entry.contentRect;

      if (width > 0 && height > 0) {
        requestAnimationFrame(() => {
          try {
            chartRef.current?.applyOptions({
              width: Math.floor(width),
              height: Math.floor(height),
            });
          } catch (e) {
            // Safe ignore: Object is disposed during rapid unmount resize events
          }
        });
      }
    });

    resizeObserverRef.current.observe(container);

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, []);

  useEffect(() => {
    createChartInstance();

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [createChartInstance]);


  useEffect(() => {
    if (!latestCandle || !seriesRef.current || !chartRef.current) return;
    if (latestCandle.ticker && latestCandle.ticker !== selectedMarket) return;

    const open = parseFloat(latestCandle.open);
    const high = parseFloat(latestCandle.high);
    const low = parseFloat(latestCandle.low);
    const close = parseFloat(latestCandle.close);
    if (!open || !high || !low || !close) return;
    if (!isFinite(open) || !isFinite(high) || !isFinite(low) || !isFinite(close)) return;

    const candleTime = Math.floor(new Date(latestCandle.startedAt).getTime() / 1000);

    if (candleTime < lastBarTimeRef.current) return;

    const candlePoint = { time: candleTime as any, open, high, low, close };

    try {
      if (chartType === 'candlestick') {
        seriesRef.current.update(candlePoint);
      } else {
        seriesRef.current.update({ time: candlePoint.time, value: close });
      }

      lastBarTimeRef.current = candleTime;

      if (showVolume && volumeSeriesRef.current) {
        const colors = getThemeColors();
        volumeSeriesRef.current.update({
          time: candlePoint.time,
          value: parseFloat(latestCandle.usdVolume),
          color: close >= open ? colors.upColor + '40' : colors.downColor + '40',
        });
      }
    } catch (err) {
      console.error('[Chart] Update error:', err);
    }
  }, [latestCandle, selectedMarket, chartType, showVolume, getThemeColors]);

  const downloadChart = useCallback(() => {
    if (!chartContainerRef.current) return;

    const canvas = chartContainerRef.current.querySelector('canvas');
    if (canvas) {
      const link = document.createElement('a');
      link.download = `${selectedMarket}-${timeframe}-${Date.now()}.png`;
      link.href = canvas.toDataURL();
      link.click();
    }
  }, [selectedMarket, timeframe]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  const timeframes: { value: CandleResolution; label: string }[] = [
    { value: '1MIN', label: '1m' },
    { value: '5MINS', label: '5m' },
    { value: '15MINS', label: '15m' },
    { value: '30MINS', label: '30m' },
    { value: '1HOUR', label: '1H' },
    { value: '4HOURS', label: '4H' },
    { value: '1DAY', label: '1D' },
  ];

  const chartTypes: { value: ChartType; label: string; icon: React.ReactNode }[] = [
    { value: 'candlestick', label: 'Candles', icon: <CandlestickChart className="w-4 h-4" /> },
    { value: 'line', label: 'Line', icon: <TrendingUp className="w-4 h-4" /> },
    { value: 'area', label: 'Area', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  const TimeframeSelector = () => (
    <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar px-1 flex-1">
      {timeframes.map(tf => (
        <button
          key={tf.value}
          onClick={() => setTimeframe(tf.value)}
          className={`px-2 py-1 text-[11px] font-medium rounded transition-all whitespace-nowrap ${timeframe === tf.value
            ? 'bg-brand text-white'
            : 'text-muted hover:text-primary hover:bg-hover'
            }`}
        >
          {tf.label}
        </button>
      ))}
    </div>
  );

  const ChartTypeDropdown = () => (
    <div className="relative">
      <button
        onClick={() => setShowChartTypeMenu(!showChartTypeMenu)}
        className="flex items-center gap-1.5 px-2 py-2 hover:bg-hover rounded-md transition-colors min-w-[44px] min-h-[44px] justify-center"
        title={`Chart Type: ${chartType}`}
      >
        {chartTypeIcons[chartType]}
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-200 ${showChartTypeMenu ? 'rotate-180' : ''}`}
        />
      </button>
      {showChartTypeMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowChartTypeMenu(false)} />
          <div className="absolute top-full left-0 mt-1 bg-secondary rounded-lg shadow-xl border border-color py-1 min-w-[140px] z-20">
            {chartTypes.map(ct => (
              <button
                key={ct.value}
                onClick={() => {
                  setChartType(ct.value);
                  setShowChartTypeMenu(false);
                }}
                className={`w-full text-left px-3 py-2.5 text-xs hover:bg-hover transition-colors flex items-center gap-2 ${chartType === ct.value ? 'bg-hover text-brand font-medium' : 'text-primary'
                  }`}
              >
                {ct.icon}
                <span>{ct.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  // Settings dropdown
  const SettingsDropdown = () => (
    <div className="relative">
      <button
        onClick={() => setShowSettingsMenu(!showSettingsMenu)}
        className="flex items-center justify-center p-2 hover:bg-hover rounded-md transition-colors min-w-[44px] min-h-[44px]"
        title="Chart Settings"
      >
        <Settings className="w-4 h-4 text-gray-400" />
      </button>
      {showSettingsMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowSettingsMenu(false)} />
          <div className="absolute top-full right-0 mt-1 bg-secondary rounded-lg shadow-xl border border-color py-1 min-w-[160px] z-20">
            <button
              onClick={() => setShowVolume(!showVolume)}
              className="w-full text-left px-4 py-3 text-xs hover:bg-hover transition-colors flex items-center justify-between text-primary"
            >
              <span>Volume</span>
              <div
                className={`w-10 h-5 rounded-full transition-colors ${showVolume ? 'bg-brand' : 'bg-gray-600'} relative`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${showVolume ? 'translate-x-5' : 'translate-x-0.5'}`}
                />
              </div>
            </button>
            <button
              onClick={() => setShowGrid(!showGrid)}
              className="w-full text-left px-4 py-3 text-xs hover:bg-hover transition-colors flex items-center justify-between text-primary"
            >
              <span>Grid</span>
              <div
                className={`w-10 h-5 rounded-full transition-colors ${showGrid ? 'bg-brand' : 'bg-gray-600'} relative`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${showGrid ? 'translate-x-5' : 'translate-x-0.5'}`}
                />
              </div>
            </button>
            <button
              onClick={() => setShowCrosshair(!showCrosshair)}
              className="w-full text-left px-4 py-3 text-xs hover:bg-hover transition-colors flex items-center justify-between text-primary"
            >
              <span>Crosshair</span>
              <div
                className={`w-10 h-5 rounded-full transition-colors ${showCrosshair ? 'bg-brand' : 'bg-gray-600'} relative`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${showCrosshair ? 'translate-x-5' : 'translate-x-0.5'}`}
                />
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );

  const HistoryLoadingOverlay = () => {
    if (!isFetchingMore) return null;

    return (
      <div className={`absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-secondary/90 px-4 py-2 rounded-full border border-color shadow-lg transition-all ${isFetchingMore ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
        <div className="w-4 h-4 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
        <span className="text-xs text-gray-300 font-medium whitespace-nowrap">Loading history...</span>
      </div>
    );
  };

  const MarketTransitionOverlay = () => {
    if (!isLoading) return null;

    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center bg-secondary/80 backdrop-blur-md transition-all duration-300">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-brand/10 rounded-full" />
            <div className="absolute inset-0 border-4 border-t-brand rounded-full animate-spin" />
            <div className="absolute inset-2 border-2 border-brand/5 rounded-full" />
            <div className="absolute inset-2 border-2 border-b-brand/40 rounded-full animate-spin-reverse" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white tracking-tight">Loading Chart</h3>
            <p className="text-gray-400 text-xs font-medium uppercase tracking-widest">{selectedMarket}</p>
          </div>
        </div>
      </div>
    );
  };

  const renderDesktopChart = () => (
    <div
      className={`${isFullscreen && !isMobile ? 'fixed inset-0 z-50' : 'h-full'} bg-primary flex flex-col`}
    >
      <div className="bg-secondary border-b border-color flex-shrink-0">
        <div className="flex items-center justify-between px-1 py-1">
          <TimeframeSelector />

          <div className="flex items-center gap-1 px-1 shrink-0">
            <div className="w-px h-4 bg-color mx-2 hidden sm:block" />
            <ChartTypeDropdown />
            <SettingsDropdown />
            <button
              onClick={downloadChart}
              className="p-2 hover:bg-hover rounded-md transition-colors hidden sm:flex items-center justify-center min-w-[40px] min-h-[40px]"
              title="Download Chart"
            >
              <Download className="w-4 h-4 text-gray-400" />
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-hover rounded-md transition-colors flex items-center justify-center min-w-[40px] min-h-[40px]"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4 text-gray-400" />
              ) : (
                <Maximize2 className="w-4 h-4 text-gray-400" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-secondary relative overflow-hidden">
        <HistoryLoadingOverlay />

        {error && (
          <div className="absolute top-14 left-2 right-2 sm:mx-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg z-10 backdrop-blur-sm">
            <p className="text-xs sm:text-sm text-red-400 font-medium">{error}</p>
          </div>
        )}

        <MarketTransitionOverlay />

        <div
          ref={chartContainerRef}
          className="absolute inset-0 w-full h-full opacity-100 transition-opacity duration-300"
        />
      </div>
    </div>
  );

  const renderMobileChart = () => (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 animate-fade-in' : 'h-full'} bg-primary flex flex-col`}>
      <div className={`bg-secondary border-b border-color flex-shrink-0 ${isFullscreen ? 'safe-area-top' : ''}`}>
        <div className="flex items-center justify-between px-1 py-1">
          <TimeframeSelector />
          
          <div className="flex items-center gap-0.5 shrink-0">
            <ChartTypeDropdown />
            <SettingsDropdown />
            <button
              onClick={toggleFullscreen}
              className="p-1.5 hover:bg-hover rounded-md transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
              title={isFullscreen ? 'Exit Fullscreen' : 'Expand Chart'}
            >
              {isFullscreen ? (
                <X className="w-4 h-4 text-gray-400" />
              ) : (
                <Maximize2 className="w-4 h-4 text-gray-400" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-secondary relative overflow-hidden min-h-[200px]">
        <HistoryLoadingOverlay />

        {error && (
          <div className="absolute top-14 left-2 right-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg z-10">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        <MarketTransitionOverlay />

        <div
          ref={chartContainerRef}
          className="absolute inset-0 w-full h-full opacity-100 transition-opacity duration-300"
        />
      </div>
    </div>
  );

  return isMobile ? renderMobileChart() : renderDesktopChart();
}
