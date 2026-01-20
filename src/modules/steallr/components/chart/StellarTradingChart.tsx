import { ChevronDown, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
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

import { useStellarChart } from '../../hook/useStallerChart';
import { useAmmSwapStore } from '../../store/ammSwapStore';
import type { ChartAssetPair, ChartResolution } from '../../types/stellarChart.types';

type ChartType = 'candlestick' | 'line' | 'area';

const CHART_RESOLUTIONS = {
  '1m': 60000,
  '5m': 300000,
  '15m': 900000,
  '1h': 3600000,
  '1d': 86400000,
  '1w': 604800000,
} as const;

const TIME_RANGES = {
  '1H': 3600000,
  '4H': 14400000,
  '1D': 86400000,
  '1W': 604800000,
  '1M': 2592000000,
  '3M': 7776000000,
  '1Y': 31536000000,
  ALL: 31536000000,
};

interface StellarTradingChartProps {
  initialAssetPair?: ChartAssetPair;
  autoStream?: boolean;
  onAssetPairChange?: (pair: ChartAssetPair) => void;
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
  initialAssetPair,
  autoStream = true,
  onAssetPairChange,
}: StellarTradingChartProps) {
  console.log(onAssetPairChange);
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
    // error,
    isStreaming,
    lastUpdate,
    currentNetwork,
    currentAssetPair,
    startStreaming,
    stopStreaming,
    refreshData,
    setResolution: updateResolution,
    setTimeRange: updateTimeRange,
    setAssetPair: updateAssetPair,
  } = useStellarChart({
    assetPair: initialAssetPair,
    resolution,
    timeRange,
    autoStream,
  });

  const { selectedChartPair } = useAmmSwapStore();

  useEffect(() => {
    if (selectedChartPair) {
      updateAssetPair(selectedChartPair);
    }
  }, [selectedChartPair, updateAssetPair]);

  const getThemeColors = () => {
    if (isDark) {
      return {
        background: '#0a0e1a',
        textColor: '#f8f9fa',
        gridColor: '#2d3241',
        borderColor: '#3a3f4f',
        upColor: '#10b981',
        downColor: '#ef4444',
        volumeColor: 'rgba(128, 128, 128, 0.3)',
        crosshairColor: '#8b95a5',
      };
    }
    return {
      background: '#f5f7fb',
      textColor: '#1a1d29',
      gridColor: '#e2e8f0',
      borderColor: '#cbd5e0',
      upColor: '#10b981',
      downColor: '#ef4444',
      volumeColor: 'rgba(107, 114, 128, 0.3)',
      crosshairColor: '#718096',
    };
  };

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

    // Transform data
    const candleData = chartData
      .filter(point => {
        return (
          point.open != null &&
          point.high != null &&
          point.low != null &&
          point.close != null &&
          !isNaN(parseFloat(point.open)) &&
          !isNaN(parseFloat(point.high)) &&
          !isNaN(parseFloat(point.low)) &&
          !isNaN(parseFloat(point.close))
        );
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
      const lineSeries = chartRef.current.addSeries(LineSeries, {
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
      const areaSeries = chartRef.current.addSeries(AreaSeries, {
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

  useEffect(() => {
    if (!seriesRef.current || chartData.length === 0 || !isStreaming) return;

    const latestPoint = chartData[chartData.length - 1];
    if (latestPoint.close == null || isNaN(parseFloat(latestPoint.close))) {
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
      seriesRef.current.update(candlePoint);
    } else {
      seriesRef.current.update({ time, value: close });
    }

    if (showVolume && volumeSeriesRef.current) {
      const colors = getThemeColors();
      const volume = parseFloat(latestPoint.volume);
      volumeSeriesRef.current.update({
        time,
        value: volume,
        color:
          close >= parseFloat(latestPoint.open) ? colors.upColor + '40' : colors.downColor + '40',
      });
    }
  }, [chartData, showVolume, isStreaming, chartType]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

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

  const Dropdown = ({ label, value, options, onChange, isOpen, onToggle }: any) => {
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

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
              <div className="fixed inset-0 z-[9998]" onClick={onToggle} />
              <div
                className="absolute bg-secondary rounded-lg shadow-lg border border-color py-1 min-w-[140px] z-[9999]"
                style={{ position: 'absolute', top: menuPos.top, left: menuPos.left }}
              >
                {options.map((opt: any) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      onChange(opt.value);
                      onToggle();
                    }}
                    className={`w-full text-left px-4 py-2 text-xs hover:bg-hover transition-colors ${value === opt.label ? 'bg-hover text-brand' : 'text-primary'
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

  const SettingsDropdown = ({ showSettingsMenu, setShowSettingsMenu }: any) => {
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

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
                style={{ position: 'absolute', top: menuPos.top, right: menuPos.right }}
              >
                <button
                  onClick={() => setShowVolume(!showVolume)}
                  className="w-full text-left px-4 py-2 text-xs hover:bg-hover transition-colors flex items-center justify-between text-primary"
                >
                  Volume
                  <input
                    type="checkbox"
                    checked={showVolume}
                    readOnly
                    className="w-3 h-3 pointer-events-none"
                  />
                </button>
                <button
                  onClick={() => setShowGrid(!showGrid)}
                  className="w-full text-left px-4 py-2 text-xs hover:bg-hover transition-colors flex items-center justify-between text-primary"
                >
                  Grid
                  <input
                    type="checkbox"
                    checked={showGrid}
                    readOnly
                    className="w-3 h-3 pointer-events-none"
                  />
                </button>
                <button
                  onClick={() => setShowCrosshair(!showCrosshair)}
                  className="w-full text-left px-4 py-2 text-xs hover:bg-hover transition-colors flex items-center justify-between text-primary"
                >
                  Crosshair
                  <input
                    type="checkbox"
                    checked={showCrosshair}
                    readOnly
                    className="w-3 h-3 pointer-events-none"
                  />
                </button>
              </div>
            </>,
            document.body
          )}
      </div>
    );
  };

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : ''} bg-primary rounded-xl`}>
      <div className="h-full flex flex-col">
        <div className="bg-secondary px-2 py-2 rounded-t-xl overflow-x-auto">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="text-sm font-medium text-primary">
                {currentAssetPair?.base}/{currentAssetPair?.counter}
                {currentNetwork !== 'mainnet' && (
                  <span className="ml-2 text-xs text-warning">({currentNetwork})</span>
                )}
              </div>

              <Dropdown
                label="Range"
                value={timeRangeKey}
                options={Object.keys(TIME_RANGES).map(k => ({ value: k, label: k }))}
                onChange={handleTimeRangeChange}
                isOpen={showTimeRangeMenu}
                onToggle={() => setShowTimeRangeMenu(!showTimeRangeMenu)}
              />

              <Dropdown
                label="Resolution"
                value={
                  Object.entries(CHART_RESOLUTIONS).find(([, v]) => v === resolution)?.[0] || '15m'
                }
                options={Object.entries(CHART_RESOLUTIONS).map(([k, v]) => ({
                  value: v,
                  label: k,
                }))}
                onChange={handleResolutionChange}
                isOpen={showTimeframeMenu}
                onToggle={() => setShowTimeframeMenu(!showTimeframeMenu)}
              />

              <Dropdown
                label="Type"
                value={chartType.charAt(0).toUpperCase() + chartType.slice(1)}
                options={[
                  { value: 'candlestick', label: 'Candlestick' },
                  { value: 'line', label: 'Line' },
                  { value: 'area', label: 'Area' },
                ]}
                onChange={setChartType}
                isOpen={showChartTypeMenu}
                onToggle={() => setShowChartTypeMenu(!showChartTypeMenu)}
              />

              <SettingsDropdown
                showSettingsMenu={showSettingsMenu}
                setShowSettingsMenu={setShowSettingsMenu}
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
              >
                {isStreaming ? 'Live' : 'Start Live'}
              </button>
              <button onClick={() => setIsFullscreen(!isFullscreen)} className="btn-ghost p-2">
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-secondary p-1 rounded-b-xl">
          {/* {error && (
            <div className="mx-4 mt-4 p-3 bg-danger-light border border-danger rounded-lg">
              <p className="text-sm text-danger font-medium">{error}</p>
              {error.includes('Too much data') && (
                <p className="text-xs text-danger mt-1">
                  Tip: Select a shorter time range or use a larger resolution (1h, 1d, 1w)
                </p>
              )}
            </div>
          )} */}
          {isLoading && chartData.length === 0 ? (
            <div
              className={`flex items-center justify-center ${isFullscreen ? 'h-full' : 'h-[300px] md:h-[500px]'}`}
            >
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-secondary text-sm">Loading chart data...</p>
                {timeRangeKey === 'ALL' || timeRangeKey === '1Y' ? (
                  <p className="text-xs text-muted mt-1">Large time range may take longer...</p>
                ) : null}
              </div>
            </div>
          ) : (
            <div
              ref={chartContainerRef}
              className={`w-full ${isFullscreen ? 'h-full' : 'h-[300px] md:h-[500px]'}`}
            />
          )}
        </div>

        {isStreaming && lastUpdate && (
          <div className="absolute top-16 right-4 flex items-center gap-2 bg-secondary/90 backdrop-blur border border-color px-3 py-1.5 rounded-lg text-xs">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
            <span className="text-primary">Live</span>
            <span className="text-secondary">{new Date(lastUpdate).toLocaleTimeString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
