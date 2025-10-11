import { ChevronDown, Download, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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

import { CHART_RESOLUTIONS, TIME_RANGES } from '../../constants/steallrChartConstant';
import { useStellarChart } from '../../hook/useStallerChart';
import type {
  // ChartAssetPair,
  ChartResolution,
} from '../../types/stellarChart.types';

type ChartType = 'candlestick' | 'line' | 'area';

interface StellarTradingChartProps {
  // assetPair: ChartAssetPair;
  networkKey?: string;
  autoStream?: boolean;
}

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

export default function StellarTradingChart({
  // assetPair,
  networkKey = 'mainnet',
  autoStream = true,
}: StellarTradingChartProps) {
  const isDark = useTheme();
  const [resolution, setResolution] = useState<ChartResolution>(CHART_RESOLUTIONS['15m']);
  const [timeRangeKey, setTimeRangeKey] = useState<keyof typeof TIME_RANGES>('1D');
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [showVolume, setShowVolume] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTimeframeMenu, setShowTimeframeMenu] = useState(false);
  const [showChartTypeMenu, setShowChartTypeMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showTimeRangeMenu, setShowTimeRangeMenu] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);

  // Calculate time range
  const timeRange = {
    startTime:
      timeRangeKey === 'ALL'
        ? Date.now() - TIME_RANGES['1Y']
        : Date.now() - TIME_RANGES[timeRangeKey],
    endTime: Date.now(),
  };

  const {
    data: chartData,
    isLoading,
    error,
    isStreaming,
    lastUpdate,
    startStreaming,
    stopStreaming,
    refreshData,
    setResolution: updateResolution,
    setTimeRange: updateTimeRange,
  } = useStellarChart({
    networkKey,
    // assetPair,
    resolution,
    timeRange,
    autoStream,
  });

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

  // Initialize and update chart
  useEffect(() => {
    if (!chartContainerRef.current || chartData.length === 0) return;

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

    // Remove existing series
    if (seriesRef.current) {
      chartRef.current.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }
    if (volumeSeriesRef.current) {
      chartRef.current.removeSeries(volumeSeriesRef.current);
      volumeSeriesRef.current = null;
    }

    // Transform Stellar chart data
    const candleData = chartData
      .filter(point => {
        const isValid =
          point.open != null &&
          point.high != null &&
          point.low != null &&
          point.close != null &&
          point.volume != null &&
          !isNaN(parseFloat(point.open)) &&
          !isNaN(parseFloat(point.high)) &&
          !isNaN(parseFloat(point.low)) &&
          !isNaN(parseFloat(point.close)) &&
          !isNaN(parseFloat(point.volume));
        if (!isValid) {
          console.warn('Invalid chart data point:', point);
        }
        return isValid;
      })
      .map(point => ({
        time: Math.floor(point.timestamp / 1000) as any,
        open: parseFloat(point.open),
        high: parseFloat(point.high),
        low: parseFloat(point.low),
        close: parseFloat(point.close),
        volume: parseFloat(point.volume),
      }))
      .sort((a, b) => a.time - b.time);

    // Create series based on chart type
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
  }, [chartData, chartType, showVolume, showGrid, showCrosshair, isDark]);

  // Update chart with latest data point from streaming
  useEffect(() => {
    if (!seriesRef.current || chartData.length === 0 || !isStreaming) return;

    const latestPoint = chartData[chartData.length - 1];
    if (latestPoint.close == null || isNaN(parseFloat(latestPoint.close))) {
      console.warn('Skipping invalid streaming data point:', latestPoint);
      return;
    }

    const time = Math.floor(latestPoint.timestamp / 1000) as any;
    const close = parseFloat(latestPoint.close);

    if (chartType === 'candlestick') {
      const candlePoint = {
        time,
        open: parseFloat(latestPoint.open),
        high: parseFloat(latestPoint.high),
        low: parseFloat(latestPoint.low),
        close,
      };
      if (isNaN(candlePoint.open) || isNaN(candlePoint.high) || isNaN(candlePoint.low)) {
        console.warn('Invalid candlestick data point:', candlePoint);
        return;
      }
      seriesRef.current.update(candlePoint);
    } else {
      const linePoint = { time, value: close };
      seriesRef.current.update(linePoint);
    }

    if (showVolume && volumeSeriesRef.current) {
      const colors = getThemeColors();
      const volume = parseFloat(latestPoint.volume);
      if (isNaN(volume)) {
        console.warn('Invalid volume data:', latestPoint.volume);
        return;
      }
      volumeSeriesRef.current.update({
        time,
        value: volume,
        color:
          close >= parseFloat(latestPoint.open) ? colors.upColor + '40' : colors.downColor + '40',
      });
    }
  }, [chartData, showVolume, isStreaming, chartType]);

  // Cleanup on unmount
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

    // const canvas = chartContainerRef.current.querySelector("canvas");
    // if (canvas) {
    //   const link = document.createElement("a");
    //   link.download = `${assetPair.base}-${
    //     assetPair.counter
    //   }-${timeRangeKey}-${Date.now()}.png`;
    //   link.href = canvas.toDataURL();
    //   link.click();
    // }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const handleResolutionChange = (newResolution: ChartResolution) => {
    setResolution(newResolution);
    updateResolution(newResolution);
  };

  const handleTimeRangeChange = (newTimeRangeKey: keyof typeof TIME_RANGES) => {
    setTimeRangeKey(newTimeRangeKey);
    const newTimeRange = {
      startTime:
        newTimeRangeKey === 'ALL'
          ? Date.now() - TIME_RANGES['1Y']
          : Date.now() - TIME_RANGES[newTimeRangeKey],
      endTime: Date.now(),
    };
    updateTimeRange(newTimeRange);
  };

  const resolutionOptions = [
    { value: CHART_RESOLUTIONS['1m'], label: '1m' },
    { value: CHART_RESOLUTIONS['5m'], label: '5m' },
    { value: CHART_RESOLUTIONS['15m'], label: '15m' },
    { value: CHART_RESOLUTIONS['1h'], label: '1h' },
    { value: CHART_RESOLUTIONS['1d'], label: '1d' },
    { value: CHART_RESOLUTIONS['1w'], label: '1w' },
  ];

  const timeRangeOptions = [
    { value: '1H', label: '1H' },
    { value: '4H', label: '4H' },
    { value: '1D', label: '1D' },
    { value: '1W', label: '1W' },
    { value: '1M', label: '1M' },
    { value: '3M', label: '3M' },
    { value: '1Y', label: '1Y' },
    { value: 'ALL', label: 'ALL' },
  ];

  const chartTypes: { value: ChartType; label: string }[] = [
    { value: 'candlestick', label: 'Candlestick' },
    { value: 'line', label: 'Line' },
    { value: 'area', label: 'Area' },
  ];

  const Dropdown = ({ label, value, options, onChange, isOpen, onToggle }: any) => {
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({
      top: 0,
      left: 0,
    });

    useLayoutEffect(() => {
      if (isOpen && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setMenuPos({ top: rect.bottom + window.scrollY, left: rect.left });
      }
    }, [isOpen]);

    return (
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={onToggle}
          className="btn-secondary btn-sm flex items-center gap-2"
        >
          {label}: <span className="font-medium">{value}</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen &&
          createPortal(
            <>
              {/* Backdrop */}
              <div className="fixed inset-0 z-[9998]" onClick={onToggle} />
              {/* Dropdown Menu */}
              <div
                className="absolute bg-secondary rounded-lg shadow-lg border border-color py-1 min-w-[140px] z-[9999]"
                style={{
                  position: 'absolute',
                  top: menuPos.top,
                  left: menuPos.left,
                }}
              >
                {options.map((opt: any) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      onChange(opt.value);
                      onToggle();
                    }}
                    className={`w-full text-left px-4 py-2 text-xs hover:bg-hover transition-colors ${
                      value === opt.label ? 'bg-hover text-brand' : 'text-primary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>,
            document.body
          )}
      </div>
    );
  };

  // --------------------
  // Settings Dropdown
  // --------------------
  const SettingsDropdown = ({
    showSettingsMenu,
    setShowSettingsMenu,
    showVolume,
    setShowVolume,
    showGrid,
    setShowGrid,
    showCrosshair,
    setShowCrosshair,
  }: any) => {
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({
      top: 0,
      right: 0,
    });

    useLayoutEffect(() => {
      if (showSettingsMenu && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setMenuPos({
          top: rect.bottom + window.scrollY,
          right: window.innerWidth - rect.right,
        });
      }
    }, [showSettingsMenu]);

    return (
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={() => setShowSettingsMenu(!showSettingsMenu)}
          className="btn-secondary btn-sm flex items-center gap-2"
        >
          Settings
          <ChevronDown
            className={`w-3 h-3 transition-transform ${showSettingsMenu ? 'rotate-180' : ''}`}
          />
        </button>

        {showSettingsMenu &&
          createPortal(
            <>
              <div className="fixed inset-0 z-[9998]" onClick={() => setShowSettingsMenu(false)} />
              <div
                className="absolute bg-secondary rounded-lg shadow-lg border border-color py-1 min-w-[160px] z-[9999]"
                style={{
                  position: 'absolute',
                  top: menuPos.top,
                  right: menuPos.right,
                }}
              >
                <DropdownItem
                  label="Volume"
                  checked={showVolume}
                  onToggle={() => setShowVolume(!showVolume)}
                />
                <DropdownItem
                  label="Grid"
                  checked={showGrid}
                  onToggle={() => setShowGrid(!showGrid)}
                />
                <DropdownItem
                  label="Crosshair"
                  checked={showCrosshair}
                  onToggle={() => setShowCrosshair(!showCrosshair)}
                />
              </div>
            </>,
            document.body
          )}
      </div>
    );
  };

  const DropdownItem = ({ label, checked, onToggle }: any) => (
    <button
      onClick={onToggle}
      className="w-full text-left px-4 py-2 text-xs hover:bg-hover transition-colors flex items-center justify-between text-primary"
    >
      {label}
      <input type="checkbox" checked={checked} readOnly className="w-3 h-3 pointer-events-none" />
    </button>
  );

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : ''} bg-primary  rounded-xl`}>
      <div className={`h-full flex flex-col ${!isFullscreen ? '' : ''}`}>
        {/* Header Controls */}
        <div className="bg-secondary border-b border-color px-2 py-2 rounded-t-xl overflow-x-auto ">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 ">
              <Dropdown
                label="Range"
                value={timeRangeKey}
                options={timeRangeOptions}
                onChange={handleTimeRangeChange}
                isOpen={showTimeRangeMenu}
                onToggle={() => setShowTimeRangeMenu(!showTimeRangeMenu)}
              />

              <Dropdown
                label="Resolution"
                value={resolutionOptions.find(r => r.value === resolution)?.label}
                options={resolutionOptions}
                onChange={handleResolutionChange}
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

              <SettingsDropdown
                showSettingsMenu={showSettingsMenu}
                setShowSettingsMenu={setShowSettingsMenu}
                showVolume={showVolume}
                setShowVolume={setShowVolume}
                showGrid={showGrid}
                setShowGrid={setShowGrid}
                showCrosshair={showCrosshair}
                setShowCrosshair={setShowCrosshair}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={refreshData}
                className="btn-ghost p-2"
                title="Refresh Data"
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={isStreaming ? stopStreaming : startStreaming}
                className={`btn-sm ${isStreaming ? 'btn-success' : 'btn-secondary'}`}
                title={isStreaming ? 'Stop Streaming' : 'Start Streaming'}
              >
                {isStreaming ? 'Live' : 'Start Live'}
              </button>
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
        <div className="flex-1 bg-secondary p-1  rounded-b-xl">
          {error && (
            <div className="mx-4 mt-4 card bg-danger-bg border-2 border-red-300">
              <p className="text-sm text-red-700">Error: {error}</p>
            </div>
          )}
          {isLoading && chartData.length === 0 ? (
            <div
              className={`flex items-center justify-center ${
                isFullscreen ? 'h-full' : 'h-[500px]'
              }`}
            >
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-secondary text-sm">Loading Stellar chart data...</p>
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
        {isStreaming && (
          <div className="absolute top-16 right-4 flex items-center gap-2 bg-secondary/90 backdrop-blur border border-color px-3 py-1.5 rounded-lg text-xs">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
            <span className="text-primary">Stellar Live</span>
            {lastUpdate && (
              <span className="text-secondary text-xs">
                {new Date(lastUpdate).toLocaleTimeString()}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
