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
  const [hasInitialData, setHasInitialData] = useState(false);
  const [chartKey, setChartKey] = useState(0);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const { selectedMarket } = useMarketStore();

  const { candles, latestCandle, isLoading, error } = useRealtimeChart(
    selectedMarket,
    timeframe,
    300
  );

  useEffect(() => {
    if (candles.length > 0 && !hasInitialData) {
      setHasInitialData(true);
    }
  }, [candles, hasInitialData]);

  const getThemeColors = useCallback(() => {
    if (isDark) {
      return {
        background: '#0a0e1a',
        textColor: '#f8f9fa',
        gridColor: '#1a1f2e',
        borderColor: '#2d3241',
        upColor: '#00ff9d',
        downColor: '#ff3b69',
        volumeColor: 'rgba(128, 128, 128, 0.2)',
        crosshairColor: '#6b7280',
      };
    }
    return {
      background: '#ffffff',
      textColor: '#1a1d29',
      gridColor: '#f0f0f0',
      borderColor: '#e5e7eb',
      upColor: '#10b981',
      downColor: '#ef4444',
      volumeColor: 'rgba(107, 114, 128, 0.2)',
      crosshairColor: '#9ca3af',
    };
  }, [isDark]);

  const createChartInstance = useCallback(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

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
          bottom: showVolume ? 0.18 : 0.08,
        },
        minimumWidth: isMobile ? 50 : 65,
      },
      timeScale: {
        borderColor: colors.borderColor,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: isMobile ? 5 : 10,
        barSpacing: isMobile ? 12 : 18,
        minBarSpacing: isMobile ? 6 : 8,
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

    chartRef.current = chart;

    const candleData = candles
      .map(c => ({
        time: Math.floor(new Date(c.startedAt).getTime() / 1000) as any,
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
        volume: parseFloat(c.usdVolume),
      }))
      .sort((a, b) => a.time - b.time);

    if (chartType === 'candlestick') {
      const candlestickSeries = chart.addSeries(CandlestickSeries, {
        upColor: colors.upColor,
        downColor: colors.downColor,
        borderUpColor: colors.upColor,
        borderDownColor: colors.downColor,
        wickUpColor: colors.upColor,
        wickDownColor: colors.downColor,
      });
      candlestickSeries.setData(candleData);
      seriesRef.current = candlestickSeries;
    } else if (chartType === 'line') {
      const lineSeries = chart.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
      });
      const lineData = candleData.map(c => ({
        time: c.time,
        value: c.close,
      }));
      lineSeries.setData(lineData);
      seriesRef.current = lineSeries;
    } else if (chartType === 'area') {
      const areaSeries = chart.addSeries(AreaSeries, {
        topColor: isDark ? '#3b82f666' : '#3b82f64D',
        bottomColor: '#3b82f600',
        lineColor: '#3b82f6',
        lineWidth: 2,
      });
      const areaData = candleData.map(c => ({
        time: c.time,
        value: c.close,
      }));
      areaSeries.setData(areaData);
      seriesRef.current = areaSeries;
    }

    if (showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: colors.volumeColor,
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      const volumeData = candleData.map(c => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? colors.upColor + '40' : colors.downColor + '40',
      }));
      volumeSeries.setData(volumeData);
      volumeSeriesRef.current = volumeSeries;
    }

    chart.timeScale().fitContent();
  }, [candles, chartType, showVolume, showGrid, showCrosshair, isDark, isMobile, getThemeColors]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;

    resizeObserverRef.current = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry || !chartRef.current) return;

      const { width, height } = entry.contentRect;

      if (width > 0 && height > 0) {
        requestAnimationFrame(() => {
          chartRef.current?.applyOptions({
            width: Math.floor(width),
            height: Math.floor(height),
          });
        });
      }
    });

    resizeObserverRef.current.observe(container);

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, [chartKey]);

  useEffect(() => {
    createChartInstance();

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [createChartInstance, chartKey]);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
    }

    const timeoutId = setTimeout(() => {
      setChartKey(prev => prev + 1);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [isFullscreen]);

  useEffect(() => {
    if (!latestCandle || !seriesRef.current || !chartRef.current) return;

    const candleTime = Math.floor(new Date(latestCandle.startedAt).getTime() / 1000);

    const candlePoint = {
      time: candleTime as any,
      open: parseFloat(latestCandle.open),
      high: parseFloat(latestCandle.high),
      low: parseFloat(latestCandle.low),
      close: parseFloat(latestCandle.close),
    };

    try {
      if (chartType === 'candlestick') {
        seriesRef.current.update(candlePoint);
      } else {
        seriesRef.current.update({
          time: candlePoint.time,
          value: candlePoint.close,
        });
      }

      if (showVolume && volumeSeriesRef.current) {
        const colors = getThemeColors();
        volumeSeriesRef.current.update({
          time: candlePoint.time,
          value: parseFloat(latestCandle.usdVolume),
          color:
            candlePoint.close >= candlePoint.open ? colors.upColor + '40' : colors.downColor + '40',
        });
      }
    } catch (error) {
      console.error('[Chart] Update error:', error);
    }
  }, [latestCandle, chartType, showVolume, getThemeColors]);

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
    <div className="absolute top-2 left-2 z-10 flex items-center gap-0.5 bg-secondary/90 backdrop-blur-sm rounded-lg p-1 border border-color shadow-lg">
      {timeframes.map(tf => (
        <button
          key={tf.value}
          onClick={() => setTimeframe(tf.value)}
          className={`px-2 py-1 text-[10px] sm:text-xs font-medium rounded transition-all min-w-[28px] sm:min-w-[32px] ${
            timeframe === tf.value
              ? 'bg-brand text-white'
              : 'text-gray-400 hover:text-white hover:bg-white/10'
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
                className={`w-full text-left px-3 py-2.5 text-xs hover:bg-hover transition-colors flex items-center gap-2 ${
                  chartType === ct.value ? 'bg-hover text-brand font-medium' : 'text-primary'
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

  // Loading overlay component - shown when changing timeframe
  const LoadingOverlay = () => {
    if (!isLoading || !hasInitialData) return null;

    return (
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] z-20 flex items-center justify-center transition-opacity">
        <div className="flex items-center gap-3 bg-secondary/90 px-4 py-2 rounded-lg border border-color">
          <div className="w-5 h-5 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
          <span className="text-sm text-gray-300">Loading...</span>
        </div>
      </div>
    );
  };

  const InitialLoadingSpinner = () => {
    if (!isLoading || hasInitialData) return null;

    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand/30 border-t-brand rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm font-medium">Loading chart...</p>
        </div>
      </div>
    );
  };

  const MobileFullscreenModal = () => {
    if (!isFullscreen || !isMobile) return null;

    return (
      <div className="fixed inset-0 z-50 bg-primary flex flex-col animate-fade-in">
        <div className="bg-secondary border-b border-color flex-shrink-0 safe-area-top">
          <div className="flex items-center justify-between px-2 py-1">
            <div className="flex items-center gap-0.5">
              <ChartTypeDropdown />
              <SettingsDropdown />
            </div>

            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-hover rounded-md transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-secondary relative overflow-hidden">
          <TimeframeSelector />

          <LoadingOverlay />

          {error && (
            <div className="absolute top-14 left-2 right-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg z-10">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {!hasInitialData && isLoading ? (
            <InitialLoadingSpinner />
          ) : (
            <div
              key={chartKey}
              ref={chartContainerRef}
              className="absolute inset-0 w-full h-full"
            />
          )}
        </div>
      </div>
    );
  };

  const renderDesktopChart = () => (
    <div
      className={`${isFullscreen && !isMobile ? 'fixed inset-0 z-50' : 'h-full'} bg-primary flex flex-col`}
    >
      <div className="bg-secondary border-b border-color flex-shrink-0">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center">
            <ChartTypeDropdown />
            <SettingsDropdown />
          </div>

          <div className="flex items-center gap-1 px-1">
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
        <TimeframeSelector />

        <LoadingOverlay />

        {error && (
          <div className="absolute top-14 left-2 right-2 sm:mx-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg z-10 backdrop-blur-sm">
            <p className="text-xs sm:text-sm text-red-400 font-medium">{error}</p>
          </div>
        )}

        {!hasInitialData && isLoading ? (
          <InitialLoadingSpinner />
        ) : (
          <div key={chartKey} ref={chartContainerRef} className="absolute inset-0 w-full h-full" />
        )}
      </div>
    </div>
  );

  const renderMobileChart = () => (
    <div className="h-full bg-primary flex flex-col">
      <div className="bg-secondary border-b border-color flex-shrink-0">
        <div className="flex items-center justify-end px-2 py-1">
          <div className="flex items-center gap-0.5">
            <ChartTypeDropdown />
            <SettingsDropdown />
            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-hover rounded-md transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Expand Chart"
            >
              <Maximize2 className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-secondary relative overflow-hidden min-h-[200px]">
        <TimeframeSelector />

        <LoadingOverlay />

        {error && (
          <div className="absolute top-14 left-2 right-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg z-10">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {!hasInitialData && isLoading ? (
          <InitialLoadingSpinner />
        ) : (
          <div key={chartKey} ref={chartContainerRef} className="absolute inset-0 w-full h-full" />
        )}
      </div>
    </div>
  );

  if (isMobile && isFullscreen) {
    return <MobileFullscreenModal />;
  }

  return isMobile ? renderMobileChart() : renderDesktopChart();
}
