import { ChevronDown, Download, Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
} from 'lightweight-charts';

import { useCandles } from '../hooks/useCandles';
import useMarketStore from '../store/marketStore';

type ChartType = 'candlestick' | 'line' | 'area';
type TimeframeType = '1MIN' | '5MINS' | '15MINS' | '30MINS' | '1HOUR' | '4HOURS' | '1DAY';

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

export default function DyDxTradingChart() {
  const isDark = useTheme();
  const [timeframe, setTimeframe] = useState<TimeframeType>('1DAY');
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [showVolume, setShowVolume] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTimeframeMenu, setShowTimeframeMenu] = useState(false);
  const [showChartTypeMenu, setShowChartTypeMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);

  const { selectedMarket } = useMarketStore();
  const { candles, latestCandle, isLoading, error, isConnected } = useCandles(
    selectedMarket,
    timeframe,
    500
  );

  const getThemeColors = () => {
    if (isDark) {
      return {
        background:
          getComputedStyle(document.documentElement)
            .getPropertyValue('--color-bg-primary')
            .trim() || '#0a0e1a',
        textColor:
          getComputedStyle(document.documentElement)
            .getPropertyValue('--color-text-primary')
            .trim() || '#f8f9fa',
        gridColor:
          getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() ||
          '#2d3241',
        borderColor:
          getComputedStyle(document.documentElement)
            .getPropertyValue('--color-border-dark')
            .trim() || '#3a3f4f',
        upColor:
          getComputedStyle(document.documentElement).getPropertyValue('--color-success').trim() ||
          '#10b981',
        downColor:
          getComputedStyle(document.documentElement).getPropertyValue('--color-danger').trim() ||
          '#ef4444',
        volumeColor: 'rgba(128, 128, 128, 0.3)',
        crosshairColor:
          getComputedStyle(document.documentElement)
            .getPropertyValue('--color-text-muted')
            .trim() || '#8b95a5',
      };
    }
    return {
      background:
        getComputedStyle(document.documentElement).getPropertyValue('--color-bg-primary').trim() ||
        '#f5f7fb',
      textColor:
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-text-primary')
          .trim() || '#1a1d29',
      gridColor:
        getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() ||
        '#e2e8f0',
      borderColor:
        getComputedStyle(document.documentElement).getPropertyValue('--color-border-dark').trim() ||
        '#cbd5e0',
      upColor:
        getComputedStyle(document.documentElement).getPropertyValue('--color-success').trim() ||
        '#10b981',
      downColor:
        getComputedStyle(document.documentElement).getPropertyValue('--color-danger').trim() ||
        '#ef4444',
      volumeColor: 'rgba(107, 114, 128, 0.3)',
      crosshairColor:
        getComputedStyle(document.documentElement).getPropertyValue('--color-text-muted').trim() ||
        '#718096',
    };
  };

  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    const colors = getThemeColors();

    if (!chartRef.current) {
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: colors.background },
          textColor: colors.textColor,
          fontSize: 12,
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
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
            top: 0.05,
            bottom: showVolume ? 0.18 : 0.05,
          },
        },
        timeScale: {
          borderColor: colors.borderColor,
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 12,
          barSpacing: 8,
          minBarSpacing: 4,
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
    } else {
      chartRef.current.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: colors.background },
          textColor: colors.textColor,
        },
        grid: {
          vertLines: {
            color: showGrid ? colors.gridColor : 'transparent',
            visible: showGrid,
          },
          horzLines: {
            color: showGrid ? colors.gridColor : 'transparent',
            visible: showGrid,
          },
        },
        crosshair: {
          mode: showCrosshair ? CrosshairMode.Normal : CrosshairMode.Hidden,
        },
        rightPriceScale: {
          scaleMargins: {
            top: 0.05,
            bottom: showVolume ? 0.18 : 0.05,
          },
        },
      });
    }

    if (seriesRef.current) {
      chartRef.current.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }
    if (volumeSeriesRef.current) {
      chartRef.current.removeSeries(volumeSeriesRef.current);
      volumeSeriesRef.current = null;
    }

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
      const candlestickSeries = chartRef.current.addSeries(CandlestickSeries, {
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
      const brandColor =
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-brand-primary')
          .trim() || '#3b82f6';
      const lineSeries = chartRef.current.addSeries(LineSeries, {
        color: brandColor,
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
      const brandColor =
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-brand-primary')
          .trim() || '#3b82f6';
      const areaSeries = chartRef.current.addSeries(AreaSeries, {
        topColor: isDark ? `${brandColor}66` : `${brandColor}4D`,
        bottomColor: `${brandColor}00`,
        lineColor: brandColor,
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
      const volumeSeries = chartRef.current.addSeries(HistogramSeries, {
        color: colors.volumeColor,
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        scaleMargins: { top: 0.85, bottom: 0 },
      });
      const volumeData = candleData.map(c => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? colors.upColor + '50' : colors.downColor + '50',
      }));
      volumeSeries.setData(volumeData);
      volumeSeriesRef.current = volumeSeries;
    }

    chartRef.current.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [candles, chartType, showVolume, showGrid, showCrosshair, isDark]);

  useEffect(() => {
    if (!latestCandle || !seriesRef.current) return;

    const candlePoint = {
      time: Math.floor(new Date(latestCandle.startedAt).getTime() / 1000) as any,
      open: parseFloat(latestCandle.open),
      high: parseFloat(latestCandle.high),
      low: parseFloat(latestCandle.low),
      close: parseFloat(latestCandle.close),
    };

    seriesRef.current.update(candlePoint);

    if (showVolume && volumeSeriesRef.current) {
      const colors = getThemeColors();
      volumeSeriesRef.current.update({
        time: candlePoint.time,
        value: parseFloat(latestCandle.usdVolume),
        color:
          candlePoint.close >= candlePoint.open ? colors.upColor + '40' : colors.downColor + '40',
      });
    }
  }, [latestCandle, showVolume]);

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  const downloadChart = () => {
    if (!chartContainerRef.current) return;

    const canvas = chartContainerRef.current.querySelector('canvas');
    if (canvas) {
      const link = document.createElement('a');
      link.download = `${selectedMarket}-${timeframe}-${Date.now()}.png`;
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const timeframes: { value: TimeframeType; label: string }[] = [
    { value: '1MIN', label: '1m' },
    { value: '5MINS', label: '5m' },
    { value: '15MINS', label: '15m' },
    { value: '30MINS', label: '30m' },
    { value: '1HOUR', label: '1h' },
    { value: '4HOURS', label: '4h' },
    { value: '1DAY', label: '1d' },
  ];

  const chartTypes: { value: ChartType; label: string }[] = [
    { value: 'candlestick', label: 'Candlestick' },
    { value: 'line', label: 'Line' },
    { value: 'area', label: 'Area' },
  ];

  const Dropdown = ({ label, value, options, onChange, isOpen, onToggle }: any) => (
    <div className="relative">
      <button onClick={onToggle} className="btn-secondary btn-sm flex items-center gap-2">
        {label}: <span className="font-medium">{value}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={onToggle} />
          <div className="absolute top-full left-0 mt-1 bg-secondary rounded-lg shadow-lg border border-color py-1 min-w-[140px] z-20">
            {options.map((opt: any) => (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  onToggle();
                }}
                className={`w-full text-left px-4 py-2 text-xs hover:bg-hover transition-colors ${
                  value === opt.label || value === opt.value
                    ? 'bg-hover text-brand'
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
        className="btn-secondary btn-sm flex items-center gap-2"
      >
        Settings
        <ChevronDown
          className={`w-3 h-3 transition-transform ${showSettingsMenu ? 'rotate-180' : ''}`}
        />
      </button>
      {showSettingsMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowSettingsMenu(false)} />
          <div className="absolute top-full right-0 mt-1 bg-secondary rounded-lg shadow-lg border border-color py-1 min-w-[140px] z-20">
            <button
              onClick={() => {
                setShowVolume(!showVolume);
              }}
              className="w-full text-left px-4 py-2 text-xs hover:bg-hover transition-colors flex items-center justify-between text-primary"
            >
              Volume
              <input type="checkbox" checked={showVolume} onChange={() => {}} className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                setShowGrid(!showGrid);
              }}
              className="w-full text-left px-4 py-2 text-xs hover:bg-hover transition-colors flex items-center justify-between text-primary"
            >
              Grid
              <input type="checkbox" checked={showGrid} onChange={() => {}} className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                setShowCrosshair(!showCrosshair);
              }}
              className="w-full text-left px-4 py-2 text-xs hover:bg-hover transition-colors flex items-center justify-between text-primary"
            >
              Crosshair
              <input
                type="checkbox"
                checked={showCrosshair}
                onChange={() => {}}
                className="w-3 h-3"
              />
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : ''} bg-primary"`}>
      <div className={`h-full flex flex-col ${!isFullscreen ? '' : ''}`}>
        {/* Header Controls */}
        <div className="bg-secondary border-b border-color px-2 py-2 rounded-t-lg">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Dropdown
                label="Time"
                value={timeframes.find(t => t.value === timeframe)?.label}
                options={timeframes}
                onChange={setTimeframe}
                isOpen={showTimeframeMenu}
                onToggle={() => setShowTimeframeMenu(!showTimeframeMenu)}
              />

              <Dropdown
                label="Type"
                value={chartTypes.find(t => t.value === chartType)?.label}
                options={chartTypes}
                onChange={setChartType}
                isOpen={showChartTypeMenu}
                onToggle={() => setShowChartTypeMenu(!showChartTypeMenu)}
              />

              <SettingsDropdown />
            </div>

            <div className="flex items-center gap-2">
              <button onClick={downloadChart} className="btn-ghost p-2" title="Download Chart">
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={toggleFullscreen}
                className="btn-ghost p-2"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1 bg-secondary p-1 ">
          {error && (
            <div className="mx-4 mt-4 card bg-danger-bg border-2 border-red-300">
              <p className="text-sm text-red-700">Error: {error}</p>
            </div>
          )}
          {isLoading ? (
            <div
              className={`flex items-center justify-center ${
                isFullscreen ? 'h-full' : 'h-[500px]'
              }`}
            >
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-secondary text-sm">Loading chart data...</p>
              </div>
            </div>
          ) : (
            <div
              ref={chartContainerRef}
              className={`w-full ${isFullscreen ? 'h-full' : 'h-[500px]'}`}
            />
          )}
        </div>

        {/* Connection Status */}
        {isConnected && (
          <div className="absolute top-16 right-4 flex items-center gap-2 bg-secondary/90 backdrop-blur border border-color px-3 py-1.5 rounded-lg text-xs">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
            <span className="text-primary">Live</span>
          </div>
        )}
      </div>
    </div>
  );
}
