import { ChevronDown, Download, Maximize2, Minimize2 } from 'lucide-react';
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
// import { useTrades } from '../hooks/useTrades';
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

export default function DyDxTradingChart() {
  const isDark = useTheme();
  const isMobile = useIsMobile();
  const [timeframe, setTimeframe] = useState<CandleResolution>('15MINS');
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [showVolume, setShowVolume] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTimeframeMenu, setShowTimeframeMenu] = useState(false);
  const [showChartTypeMenu, setShowChartTypeMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const { selectedMarket } = useMarketStore();

  // const { livePrice, livePriceSide, isConnected: tradesConnected } = useTrades(selectedMarket, 50);
  const { candles, latestCandle, isLoading, error } = useRealtimeChart(
    selectedMarket,
    timeframe,
    300
  );

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
        fontSize: isMobile ? 11 : 12,
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
          top: 0.1,
          bottom: showVolume ? 0.2 : 0.1,
        },
        minimumWidth: isMobile ? 55 : 70,
      },
      timeScale: {
        borderColor: colors.borderColor,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: isMobile ? 8 : 15,
        barSpacing: isMobile ? 8 : 12,
        minBarSpacing: isMobile ? 4 : 6,
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
    { value: '1HOUR', label: '1h' },
    { value: '4HOURS', label: '4h' },
    { value: '1DAY', label: '1d' },
  ];

  const chartTypes: { value: ChartType; label: string }[] = [
    { value: 'candlestick', label: 'Candles' },
    { value: 'line', label: 'Line' },
    { value: 'area', label: 'Area' },
  ];

  interface DropdownProps {
    label: string;
    value: string;
    options: Array<{ value: string; label: string }>;
    onChange: (value: any) => void;
    isOpen: boolean;
    onToggle: () => void;
  }

  const Dropdown = ({ label, value, options, onChange, isOpen, onToggle }: DropdownProps) => (
    <div className="relative">
      <button
        onClick={onToggle}
        className="border-e border-color flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm hover:bg-hover transition-colors active:bg-hover/80"
      >
        <span className="hidden sm:inline text-gray-400">{label}</span>
        <span className="font-medium text-white">{value}</span>
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={onToggle} />
          <div className="absolute top-full left-0 mt-1 bg-secondary rounded-lg shadow-xl border border-color py-1 min-w-[100px] sm:min-w-[140px] z-20 max-h-[300px] overflow-y-auto">
            {options.map(opt => (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  onToggle();
                }}
                className={`w-full text-left px-3 sm:px-4 py-2.5 text-xs hover:bg-hover transition-colors ${
                  value === opt.label || value === opt.value
                    ? 'bg-hover text-brand font-medium'
                    : 'text-primary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const SettingsDropdown = () => (
    <div className="relative">
      <button
        onClick={() => setShowSettingsMenu(!showSettingsMenu)}
        className="border-e border-color flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm hover:bg-hover transition-colors active:bg-hover/80"
      >
        <span className="hidden sm:inline text-white">Settings</span>
        <span className="sm:hidden text-lg">⚙️</span>
        <ChevronDown
          className={`hidden sm:block w-3 h-3 transition-transform duration-200 ${showSettingsMenu ? 'rotate-180' : ''}`}
        />
      </button>
      {showSettingsMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowSettingsMenu(false)} />
          <div className="absolute top-full right-0 mt-1 bg-secondary rounded-lg shadow-xl border border-color py-1 min-w-[140px] sm:min-w-[160px] z-20">
            <button
              onClick={() => setShowVolume(!showVolume)}
              className="w-full text-left px-3 sm:px-4 py-2.5 text-xs hover:bg-hover transition-colors flex items-center justify-between text-primary"
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
              className="w-full text-left px-3 sm:px-4 py-2.5 text-xs hover:bg-hover transition-colors flex items-center justify-between text-primary"
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
              className="w-full text-left px-3 sm:px-4 py-2.5 text-xs hover:bg-hover transition-colors flex items-center justify-between text-primary"
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

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : 'h-full'} bg-primary flex flex-col`}>
      <div className="bg-secondary border-b border-color flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Dropdown
              label="Time"
              value={timeframes.find(t => t.value === timeframe)?.label || '15m'}
              options={timeframes}
              onChange={setTimeframe}
              isOpen={showTimeframeMenu}
              onToggle={() => setShowTimeframeMenu(!showTimeframeMenu)}
            />

            <Dropdown
              label="Type"
              value={chartTypes.find(t => t.value === chartType)?.label || 'Candles'}
              options={chartTypes}
              onChange={setChartType}
              isOpen={showChartTypeMenu}
              onToggle={() => setShowChartTypeMenu(!showChartTypeMenu)}
            />

            <SettingsDropdown />
          </div>

          <div className="flex items-center gap-1 sm:gap-2 px-2">
            {/* {livePrice && (
              <div className="flex items-center gap-1 sm:gap-2 px-1 text-xs sm:text-sm">
                <span className="text-gray-400 hidden sm:inline font-medium">Live</span>
                <span
                  className={`font-bold tabular-nums ${
                    livePriceSide === 'BUY'
                      ? 'text-success'
                      : livePriceSide === 'SELL'
                        ? 'text-danger'
                        : 'text-brand'
                  }`}
                >
                  $
                  {livePrice.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                {(isConnected || tradesConnected) && (
                  <div className="relative">
                    <div className="w-2 h-2 bg-success rounded-full" />
                    <div className="absolute inset-0 w-2 h-2 bg-success rounded-full animate-ping" />
                  </div>
                )}
              </div>
            )} */}
            <button
              onClick={downloadChart}
              className="p-2 hover:bg-hover rounded-md transition-colors hidden sm:block"
              title="Download Chart"
            >
              <Download className="w-4 h-4 text-gray-400" />
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-hover rounded-md transition-colors"
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
        {error && (
          <div className="absolute top-2 left-2 right-2 sm:mx-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg z-10 backdrop-blur-sm">
            <p className="text-xs sm:text-sm text-red-400 font-medium">{error}</p>
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-brand/30 border-t-brand rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-400 text-sm font-medium">Loading chart...</p>
            </div>
          </div>
        ) : (
          <div ref={chartContainerRef} className="absolute inset-0 w-full h-full" />
        )}
      </div>
    </div>
  );
}
