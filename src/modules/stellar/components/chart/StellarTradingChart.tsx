import { ChevronDown, Maximize2, Minimize2, Settings as SettingsIcon } from 'lucide-react';
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

import { useThemeStore } from '../../../../store/themeStore';
import { useStellarChart } from '../../hook/useStellarChart';
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

interface DropdownProps {
  label: string;
  value: string;
  options: { value: any; label: string }[];
  onChange: (value: any) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const Dropdown = ({ label, value, options, onChange, isOpen, onToggle }: DropdownProps) => {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuHeight = options.length * 32 + 8;
      const top = window.innerHeight - rect.bottom < 160 ? rect.top - menuHeight : rect.bottom;
      setMenuPos({ top, left: rect.left });
    }
  }, [isOpen, options.length]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={onToggle}
        className="btn-secondary btn-sm flex items-center gap-2"
      >
        <span className="hidden md:inline">{label}:</span>{' '}
        <span className="font-medium">{value}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={onToggle} />
            <div
              className="fixed bg-secondary rounded-lg shadow-lg border border-color py-1 min-w-[140px] z-[9999]"
              style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
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

interface SettingsDropdownProps {
  showSettingsMenu: boolean;
  setShowSettingsMenu: (show: boolean) => void;
  showVolume: boolean;
  setShowVolume: (show: boolean) => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  showCrosshair: boolean;
  setShowCrosshair: (show: boolean) => void;
}

const SettingsDropdown = ({
  showSettingsMenu,
  setShowSettingsMenu,
  showVolume,
  setShowVolume,
  showGrid,
  setShowGrid,
  showCrosshair,
  setShowCrosshair,
}: SettingsDropdownProps) => {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  useLayoutEffect(() => {
    if (showSettingsMenu && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuHeight = 3 * 36 + 8;
      const top = window.innerHeight - rect.bottom < 160 ? rect.top - menuHeight : rect.bottom;
      setMenuPos({
        top,
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
        <span className="hidden md:inline">Settings</span>
        <SettingsIcon className="w-4 h-4 md:hidden" />
        <ChevronDown
          className={`w-3 h-3 transition-transform ${showSettingsMenu ? 'rotate-180' : ''}`}
        />
      </button>

      {showSettingsMenu &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setShowSettingsMenu(false)} />
            <div
              className="fixed bg-secondary rounded-lg shadow-lg border border-color py-1 min-w-[160px] z-[9999]"
              style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
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

export default function StellarTradingChart({
  initialAssetPair,
  autoStream = true,
}: StellarTradingChartProps) {
  const isDark = useThemeStore(s => s.theme) === 'dark';
  const [resolution, setResolution] = useState<ChartResolution>(CHART_RESOLUTIONS['15m']);
  const [timeRangeKey, setTimeRangeKey] = useState<keyof typeof TIME_RANGES>('1D');
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [showVolume, setShowVolume] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
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
  const prevChartTypeRef = useRef<ChartType | null>(null);
  const hasInitialDataRef = useRef(false);

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
    currentNetwork,
    currentAssetPair,
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
      hasInitialDataRef.current = false;
      updateAssetPair(selectedChartPair);
    }
  }, [selectedChartPair, updateAssetPair]);

  const getThemeColors = () => {
    if (isDark) {
      return {
        background: '#0f1528',
        textColor: '#e8edf8',
        gridColor: '#020e46',
        borderColor: '#1e2840',
        upColor: '#10b981',
        downColor: '#ef4444',
        volumeColor: 'rgba(128, 128, 128, 0.2)',
        crosshairColor: '#4a5680',
      };
    }
    return {
      background: '#fff',
      textColor: '#0f1729',
      gridColor: '#dce3ed',
      borderColor: '#e4e8f0',
      upColor: '#10b981',
      downColor: '#ef4444',
      volumeColor: 'rgba(107, 114, 128, 0.2)',
      crosshairColor: '#424a59ff',
    };
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const colors = getThemeColors();
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
          top: 0.1,
          bottom: showVolume ? 0.2 : 0.1,
        },
      },
      timeScale: {
        borderColor: colors.borderColor,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 10,
        minBarSpacing: 5,
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

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    resizeObserver.observe(chartContainerRef.current);
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
        volumeSeriesRef.current = null;
        prevChartTypeRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isLoading && chartRef.current && chartContainerRef.current) {
      const forceResize = () => {
        if (chartRef.current && chartContainerRef.current) {
          const width = chartContainerRef.current.clientWidth;
          const height = chartContainerRef.current.clientHeight;
          if (width > 0 && height > 0) {
            chartRef.current.applyOptions({ width, height });
          }
        }
      };
      forceResize();
      const timer = setTimeout(forceResize, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  useEffect(() => {
    if (!chartRef.current) return;
    const colors = getThemeColors();

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
          top: 0.1,
          bottom: showVolume ? 0.2 : 0.1,
        },
      },
    });
  }, [showGrid, showCrosshair, showVolume, isDark]);

  // 3. Data & Series Management Effect
  useEffect(() => {
    if (!chartRef.current || chartData.length === 0) return;

    const colors = getThemeColors();

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

    // Determine overall direction: compare first open to last close
    // Green = price is up vs open of the visible range, Red = down
    const firstOpen = candleData.length > 0 ? candleData[0].open : 0;
    const lastClose = candleData.length > 0 ? candleData[candleData.length - 1].close : 0;
    const isUp = lastClose >= firstOpen;
    const lineColor = isUp ? colors.upColor : colors.downColor;

    // If chartType has changed, clean up the old series
    if (seriesRef.current && prevChartTypeRef.current !== chartType) {
      chartRef.current.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }
    prevChartTypeRef.current = chartType;

    // Create the series if it doesn't exist
    if (!seriesRef.current) {
      if (chartType === 'candlestick') {
        seriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
          upColor: colors.upColor,
          downColor: colors.downColor,
          borderUpColor: colors.upColor,
          borderDownColor: colors.downColor,
          wickUpColor: colors.upColor,
          wickDownColor: colors.downColor,
        });
      } else if (chartType === 'line') {
        seriesRef.current = chartRef.current.addSeries(LineSeries, {
          color: lineColor,
          lineWidth: 2,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
        });
      } else if (chartType === 'area') {
        seriesRef.current = chartRef.current.addSeries(AreaSeries, {
          topColor: lineColor + '55',
          bottomColor: lineColor + '00',
          lineColor: lineColor,
          lineWidth: 2,
        });
      }
    } else if (chartType === 'line') {
      // Series already exists — update color live as price direction changes
      seriesRef.current.applyOptions({ color: lineColor });
    } else if (chartType === 'area') {
      seriesRef.current.applyOptions({
        topColor: lineColor + '55',
        bottomColor: lineColor + '00',
        lineColor: lineColor,
      });
    }

    // Set the data on the active series
    if (chartType === 'candlestick') {
      seriesRef.current.setData(candleData);
    } else {
      const valueData = candleData.map(c => ({
        time: c.time,
        value: c.close,
      }));
      seriesRef.current.setData(valueData);
    }

    // Volume series management
    if (showVolume) {
      if (!volumeSeriesRef.current) {
        volumeSeriesRef.current = chartRef.current.addSeries(HistogramSeries, {
          color: colors.volumeColor,
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
          scaleMargins: { top: 0.85, bottom: 0 },
        });
      }
      const volumeData = candleData.map(c => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? colors.upColor + '50' : colors.downColor + '50',
      }));
      volumeSeriesRef.current.setData(volumeData);
    } else {
      if (volumeSeriesRef.current) {
        chartRef.current.removeSeries(volumeSeriesRef.current);
        volumeSeriesRef.current = null;
      }
    }

    // Fit content only if this is the first load of data
    if (chartData.length > 0 && !hasInitialDataRef.current) {
      chartRef.current.timeScale().fitContent();
      hasInitialDataRef.current = true;
    }
  }, [chartData, chartType, showVolume, isDark]);

  const handleResolutionChange = (newResolution: ChartResolution) => {
    hasInitialDataRef.current = false;
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

  return (
    <div
      className={`${isFullscreen ? 'fixed inset-0 z-50' : 'h-full'} bg-primary lg:rounded-xl flex flex-col overflow-hidden`}
    >
      <div className="h-full flex flex-col">
        <div className="bg-secondary px-2 py-2 border-b border-white/5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide">
              <div className="text-sm font-medium text-primary whitespace-nowrap">
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
                  Object.entries(CHART_RESOLUTIONS).find(([, v]) => v === resolution)?.[0] || '1d'
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
                showVolume={showVolume}
                setShowVolume={setShowVolume}
                showGrid={showGrid}
                setShowGrid={setShowGrid}
                showCrosshair={showCrosshair}
                setShowCrosshair={setShowCrosshair}
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
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

        <div className="flex-1 bg-secondary relative min-h-0">
          <div ref={chartContainerRef} className="absolute inset-0 w-full h-full" />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-secondary/80 backdrop-blur-sm z-20">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-secondary text-sm">Loading chart data...</p>
                {timeRangeKey === 'ALL' || timeRangeKey === '1Y' ? (
                  <p className="text-xs text-muted mt-1">Large time range may take longer...</p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
