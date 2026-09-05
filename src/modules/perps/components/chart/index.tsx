import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AreaSeries,
  CandlestickSeries,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  PriceScaleMode,
} from 'lightweight-charts';

import { useThemeStore } from '../../../../store/themeStore';
import { useMarketStore } from '../../core/stores/marketStore';
import { useCandles } from '../../hooks/useCandles';
import { ChartHeader } from './components/ChartHeader';
import { DrawingStyleBar, DrawingToolbar, ScaleModeToggle } from './components/DrawingToolbar';
import { IndicatorSettingsModal } from './components/IndicatorSettingsModal';
import { Legend } from './components/Legend';
import {
  HistoryLoadingOverlay,
  MarketTransitionOverlay,
  Watermark,
} from './components/LoadingOverlay';
import { hydrateDrawing } from './constants/drawingClassMap';
import { useChartData } from './hooks/useChartData';
import { useChartDrawings } from './hooks/useChartDrawings';
import { useChartIndicators } from './hooks/useChartIndicators';
import { useChartInstance } from './hooks/useChartInstance';
import { useChartSettings } from './hooks/useChartSettings';
import { useIsMobile } from './hooks/useIsMobile';
import type { LegendData } from './types';
import { normalizeCandles } from './utils/candles';
import { readLocalStorage } from './utils/storage';

export interface TradingChartProps {
  activeChartTab?: 'price' | 'depth' | 'details';
  onChartTabChange?: (tab: 'price' | 'depth' | 'details') => void;
}

export default function TradingChart({ activeChartTab, onChartTabChange }: TradingChartProps) {
  const isDark = useThemeStore((s: any) => s.theme) !== 'light';
  const isMobile = useIsMobile();
  const selectedMarket = useMarketStore(state => state.selectedSymbol);

  const {
    timeframe,
    setTimeframe,
    chartType,
    setChartType,
    showVolume,
    setShowVolume,
    showGrid,
    setShowGrid,
    showCrosshair,
    setShowCrosshair,
    isLogScale,
    setIsLogScale,
    activeIndicators,
    setActiveIndicators,
    addIndicator,
    removeIndicator,
    toggleIndicatorVisibility,
  } = useChartSettings();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showChartTypeMenu, setShowChartTypeMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [activeDrawTool, setActiveDrawTool] = useState<string | null>(null);
  const [legend, setLegend] = useState<LegendData | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showDrawingToolbar, setShowDrawingToolbar] = useState(true);
  const [showIndicatorPills, setShowIndicatorPills] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
  const [activeDrawingColor, setActiveDrawingColor] = useState('#3b82f6');
  const [activeDrawingWidth, setActiveDrawingWidth] = useState(2);
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);

  // Hooks
  const {
    chartContainerRef,
    chartRef,
    seriesRef,
    volumeSeriesRef,
    markersPluginRef,
    themeColors,
    createChartInstance,
  } = useChartInstance(isDark);

  const { lastCandleDataRef, lastBarTimeRef, resetPriceLine, applyDataset, applyTick } =
    useChartData();

  const {
    activeSeriesRefs,
    lastIndicatorResults,
    indicatorResultsVersion,
    syncIndicatorSeries,
    applyIndicators,
    scheduleIndicatorRecalc,
    setRecalcContext,
  } = useChartIndicators();

  const {
    drawingManagerRef,
    isSwitchingMarketRef,
    hasSelectedDrawing,
    attachDrawingManager,
    detachDrawingManager,
    clearDrawings,
    deleteSelectedDrawing,
    setActiveTool,
    attachPointerHandlers,
  } = useChartDrawings();

  const { candles, latestCandle, isLoading, isFetchingMore, error, fetchMore } = useCandles(
    selectedMarket,
    timeframe
  );

  useEffect(() => {
    if (!isLoading && !hasInitiallyLoaded) {
      setHasInitiallyLoaded(true);
    }
  }, [isLoading, hasInitiallyLoaded]);

  //Stable mutable refs (written during render — safe, no re-render triggered)
  const selectedMarketRef = useRef(selectedMarket);
  selectedMarketRef.current = selectedMarket;

  const activeIndicatorsRef = useRef(activeIndicators);
  activeIndicatorsRef.current = activeIndicators;

  const isFetchingMoreRef = useRef(isFetchingMore);
  isFetchingMoreRef.current = isFetchingMore;

  const candlesRef = useRef(candles);
  candlesRef.current = candles;

  // Indicator context side-effect (still needs a real effect — setRecalcContext is external)
  useEffect(() => {
    setRecalcContext({ activeIndicators });
  }, [activeIndicators, setRecalcContext]);

  // Share lastCandleDataRef with the indicator hook for incremental tick recalc
  useEffect(() => {
    (activeSeriesRefs as any).__candleDataRef = lastCandleDataRef;
  }, [activeSeriesRefs, lastCandleDataRef]);

  // ----- buildLegend (stable — reads only from refs, never stale) -----
  const buildLegend = useCallback(
    (time?: number): LegendData | null => {
      const candleData = lastCandleDataRef.current;
      if (!candleData.length) return null;

      let idx = candleData.length - 1;
      if (time !== undefined) {
        let lo = 0,
          hi = candleData.length - 1,
          found = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (candleData[mid].time === time) {
            found = mid;
            break;
          }
          if (candleData[mid].time < time) lo = mid + 1;
          else hi = mid - 1;
        }
        if (found >= 0) idx = found;
      }

      const bar = candleData[idx];
      const prev = candleData[idx - 1];
      const change = prev ? bar.close - prev.close : 0;
      const changePct = prev && prev.close ? (change / prev.close) * 100 : 0;

      const data: LegendData = {
        time: bar.time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        change,
        changePct,
      };

      activeIndicatorsRef.current.forEach(active => {
        const result = lastIndicatorResults.current.get(active.instanceId);
        if (result && typeof result.legend === 'function') {
          data[active.instanceId] = result.legend(bar.time);
        }
      });

      return data;
    },
    [lastCandleDataRef, lastIndicatorResults]
  );

  const onCrosshairMoveRef = useRef<(time: number | null) => void>(() => {});
  const onVisibleRangeChangeRef = useRef<() => void>(() => {});
  const legendRafRef = useRef<number | null>(null);

  // Keep refs pointed at latest closures without triggering createInstance re-run
  onCrosshairMoveRef.current = useCallback(
    (time: number | null) => {
      setLegend(time == null ? buildLegend() : buildLegend(time));
    },
    [buildLegend]
  );
  onVisibleRangeChangeRef.current = useCallback(() => {
    if (isFetchingMoreRef.current) return;
    const chart = chartRef.current;
    if (!chart) return;
    const logicalRange = chart.timeScale().getVisibleLogicalRange();
    if (logicalRange && logicalRange.from < 10) fetchMore();
  }, [chartRef, fetchMore]);

  const createInstance = useCallback(() => {
    createChartInstance(
      {
        showGrid,
        showCrosshair,
        showVolume,
        isLogScale,
        isMobile,
        isDark,
      },
      // Indirected through refs so their identity never affects createInstance
      time => onCrosshairMoveRef.current(time),
      () => onVisibleRangeChangeRef.current()
    );

    const chart = chartRef.current;
    const container = chartContainerRef.current;
    if (!chart || !container) return;

    resetPriceLine();

    // ---- Main candle / line / area series ----
    if (chartType === 'candlestick') {
      seriesRef.current = chart.addSeries(CandlestickSeries, {
        upColor: themeColors.upColor,
        downColor: themeColors.downColor,
        borderUpColor: themeColors.upColor,
        borderDownColor: themeColors.downColor,
        wickUpColor: themeColors.upColor,
        wickDownColor: themeColors.downColor,
      });
    } else if (chartType === 'line') {
      seriesRef.current = chart.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
      });
    } else {
      seriesRef.current = chart.addSeries(AreaSeries, {
        topColor: isDark ? '#3b82f666' : '#3b82f64D',
        bottomColor: '#3b82f600',
        lineColor: '#3b82f6',
        lineWidth: 2,
      });
    }

    // Volume overlay
    if (showVolume) {
      volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
        color: themeColors.volumeColor,
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    }
    activeSeriesRefs.current.clear();
    markersPluginRef.current = null;

    // DrawingManager
    if (seriesRef.current) {
      attachDrawingManager(
        chart,
        seriesRef.current,
        container,
        selectedMarketRef.current,
        (color, width) => {
          setActiveDrawingColor(color);
          setActiveDrawingWidth(width);
        }
      );
    }

    //  Load cached candles into the fresh series
    const currentCandles = candlesRef.current;
    if (currentCandles.length > 0) {
      const candleData = normalizeCandles(currentCandles);
      if (candleData.length > 0) {
        if (chartType === 'candlestick') {
          seriesRef.current?.setData(candleData);
        } else {
          seriesRef.current?.setData(candleData.map(c => ({ time: c.time, value: c.close })));
        }

        lastBarTimeRef.current = candleData[candleData.length - 1].time;

        if (showVolume && volumeSeriesRef.current) {
          volumeSeriesRef.current.setData(
            candleData.map(c => ({
              time: c.time,
              value: c.volume,
              color: c.close >= c.open ? themeColors.upColor + '40' : themeColors.downColor + '40',
            }))
          );
        }

        lastCandleDataRef.current = candleData;
        syncIndicatorSeries(chart, activeIndicatorsRef.current, themeColors, isMobile);
        applyIndicators(candleData, activeIndicatorsRef.current, seriesRef, markersPluginRef);
        setLegend(buildLegend());
      }
    }
  }, [
    createChartInstance,
    chartType,
    showVolume,
    showGrid,
    showCrosshair,
    isLogScale,
    isMobile,
    isDark,
    themeColors,
    resetPriceLine,
    attachDrawingManager,
    syncIndicatorSeries,
    applyIndicators,
    buildLegend,

    chartRef,
    chartContainerRef,
    seriesRef,
    volumeSeriesRef,
    activeSeriesRefs,
    markersPluginRef,
    lastBarTimeRef,
    lastCandleDataRef,
  ]);

  useEffect(() => {
    createInstance();
    return () => {
      detachDrawingManager();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [createInstance, detachDrawingManager, chartRef]);

  // ----- Lightweight display-option effects (applyOptions — no recreate) -----

  // Grid + Crosshair: safe to update in place with applyOptions
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      grid: {
        vertLines: { color: showGrid ? themeColors.gridColor : 'transparent', visible: showGrid },
        horzLines: { color: showGrid ? themeColors.gridColor : 'transparent', visible: showGrid },
      },
      crosshair: {
        mode: showCrosshair ? CrosshairMode.Normal : CrosshairMode.Hidden,
      },
    });
  }, [showGrid, showCrosshair, themeColors, chartRef]);

  // Scale mode
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.priceScale('right').applyOptions({
        mode: isLogScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      });
    }
  }, [isLogScale, chartRef]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    syncIndicatorSeries(chart, activeIndicators, themeColors, isMobile);
    if (lastCandleDataRef.current.length > 0) {
      applyIndicators(lastCandleDataRef.current, activeIndicators, seriesRef, markersPluginRef);
    }
  }, [
    activeIndicators,
    syncIndicatorSeries,
    applyIndicators,
    themeColors,
    isMobile,
    chartRef,
    lastCandleDataRef,
    seriesRef,
    markersPluginRef,
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    const applied = applyDataset(chart, series, volumeSeriesRef.current, candles, {
      market: selectedMarket,
      timeframe,
      chartType,
      showVolume,
      colors: themeColors,
      isMobile,
    });

    if (applied) {
      syncIndicatorSeries(chart, activeIndicatorsRef.current, themeColors, isMobile);
      applyIndicators(
        lastCandleDataRef.current,
        activeIndicatorsRef.current,
        seriesRef,
        markersPluginRef
      );
      setLegend(buildLegend());
    }
  }, [
    candles,
    selectedMarket,
    timeframe,
    chartType,
    showVolume,
    themeColors,
    isMobile,
    applyDataset,
    syncIndicatorSeries,
    applyIndicators,
    buildLegend,
    chartRef,
    seriesRef,
    volumeSeriesRef,
    lastCandleDataRef,
    markersPluginRef,
  ]);

  useEffect(() => {
    const series = seriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!latestCandle || !series || !chartRef.current) return;

    const updatedBar = applyTick(series, volumeSeries, latestCandle, {
      market: selectedMarket,
      chartType,
      showVolume,
      colors: themeColors,
    });

    if (updatedBar) {
      scheduleIndicatorRecalc(updatedBar);
      if (legendRafRef.current != null) cancelAnimationFrame(legendRafRef.current);
      legendRafRef.current = requestAnimationFrame(() => {
        legendRafRef.current = null;
        setLegend(buildLegend());
      });
    }
  }, [
    latestCandle,
    selectedMarket,
    chartType,
    showVolume,
    themeColors,
    applyTick,
    scheduleIndicatorRecalc,
    buildLegend,
    chartRef,
    seriesRef,
    volumeSeriesRef,
  ]);

  // Load drawings on market change
  useEffect(() => {
    const manager = drawingManagerRef.current;
    if (!manager) return;

    isSwitchingMarketRef.current = true;
    try {
      manager.clearAll?.();
    } catch {
      /* ignore */
    }

    try {
      const saved = readLocalStorage<any[]>(
        `dydx_drawings_${selectedMarket}`,
        s => JSON.parse(s),
        []
      );
      if (saved && saved.length > 0) {
        manager.importDrawings(saved, (type: string, data: any) => hydrateDrawing(type, data));
      }
    } catch {
      /* ignore */
    } finally {
      setTimeout(() => {
        isSwitchingMarketRef.current = false;
      }, 50);
    }
  }, [selectedMarket, drawingManagerRef, isSwitchingMarketRef]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;
    container.style.cursor = activeDrawTool && activeDrawTool !== '' ? 'crosshair' : 'default';
  }, [activeDrawTool, chartContainerRef]);

  useEffect(() => {
    const container = chartContainerRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!container || !chart || !series || !activeDrawTool || activeDrawTool === '') return;

    return attachPointerHandlers(
      container,
      chart,
      series,
      activeDrawTool,
      activeDrawingColor,
      activeDrawingWidth,
      () => setActiveDrawTool(null)
    );
  }, [
    activeDrawTool,
    activeDrawingColor,
    activeDrawingWidth,
    attachPointerHandlers,
    chartContainerRef,
    chartRef,
    seriesRef,
  ]);

  // =========================================================================
  // Stable callbacks — critical for ChartHeader's memo to bail out on
  // indicator-tick re-renders (every second). Each inline lambda would break it.
  // =========================================================================

  const handleSelectDrawTool = useCallback(
    (toolId: string | null) => {
      setActiveDrawTool(prev => {
        const next = prev === toolId ? null : toolId;
        setActiveTool(next);
        return next;
      });
    },
    [setActiveTool]
  );

  const toggleIndicator = useCallback(
    (registryId: string, instanceId: string | null) => {
      if (instanceId) removeIndicator(instanceId);
      else addIndicator(registryId);
    },
    [addIndicator, removeIndicator]
  );

  const handleFieldChange = useCallback(
    (fieldId: string, val: any) => {
      if (!editingInstanceId) return;
      setActiveIndicators(prev =>
        prev.map(ind =>
          ind.instanceId === editingInstanceId
            ? { ...ind, inputs: { ...ind.inputs, [fieldId]: val } }
            : ind
        )
      );
    },
    [editingInstanceId, setActiveIndicators]
  );

  const handleColorChange = useCallback(
    (color: string) => {
      if (!editingInstanceId) return;
      setActiveIndicators(prev =>
        prev.map(ind => (ind.instanceId === editingInstanceId ? { ...ind, color } : ind))
      );
    },
    [editingInstanceId, setActiveIndicators]
  );

  const handleDrawingColorChange = useCallback(
    (color: string) => {
      setActiveDrawingColor(color);
      const manager = drawingManagerRef.current;
      if (manager) {
        try {
          const selected = manager.getSelectedDrawing();
          if (selected) {
            selected.updateStyle({ lineColor: color });
            selected.requestUpdate();
            manager.emit('drawing:updated', {
              type: 'drawing:updated',
              drawingId: selected.id,
              drawing: selected,
            });
          }
        } catch {
          /* ignore */
        }
      }
    },
    [drawingManagerRef]
  );

  const handleDrawingWidthChange = useCallback(
    (width: number) => {
      setActiveDrawingWidth(width);
      const manager = drawingManagerRef.current;
      if (manager) {
        try {
          const selected = manager.getSelectedDrawing();
          if (selected) {
            selected.updateStyle({ lineWidth: width });
            selected.requestUpdate();
            manager.emit('drawing:updated', {
              type: 'drawing:updated',
              drawingId: selected.id,
              drawing: selected,
            });
          }
        } catch {
          /* ignore */
        }
      }
    },
    [drawingManagerRef]
  );

  const handleToggleChartTypeMenu = useCallback(() => setShowChartTypeMenu(v => !v), []);
  const handleSelectChartType = useCallback(
    (v: Parameters<typeof setChartType>[0]) => {
      setChartType(v);
      setShowChartTypeMenu(false);
    },
    [setChartType]
  );
  const handleToggleIndicatorMenu = useCallback(() => setShowIndicatorMenu(v => !v), []);
  const handleToggleSettingsMenu = useCallback(() => setShowSettingsMenu(v => !v), []);
  const handleToggleVolume = useCallback(() => setShowVolume(v => !v), [setShowVolume]);
  const handleToggleGrid = useCallback(() => setShowGrid(v => !v), [setShowGrid]);
  const handleToggleCrosshair = useCallback(() => setShowCrosshair(v => !v), [setShowCrosshair]);
  const handleToggleFullscreen = useCallback(() => setIsFullscreen(prev => !prev), []);
  const handleToggleIndicatorPills = useCallback(() => setShowIndicatorPills(v => !v), []);
  const handleToggleLogScale = useCallback(() => setIsLogScale(v => !v), [setIsLogScale]);

  const handleRemoveIndicator = useCallback(
    (instanceId: string) => {
      removeIndicator(instanceId);
      if (editingInstanceId === instanceId) setEditingInstanceId(null);
    },
    [removeIndicator, editingInstanceId]
  );

  const downloadChart = useCallback(() => {
    const canvas = chartContainerRef.current?.querySelector('canvas');
    if (canvas) {
      const link = document.createElement('a');
      link.download = `${selectedMarket}-${timeframe}-${Date.now()}.png`;
      link.href = canvas.toDataURL();
      link.click();
    }
  }, [chartContainerRef, selectedMarket, timeframe]);

  void indicatorResultsVersion;

  const editingIndicator = editingInstanceId
    ? activeIndicators.find(ind => ind.instanceId === editingInstanceId)
    : undefined;

  return (
    <div
      className={`${isFullscreen ? 'fixed inset-0 z-50 animate-fade-in' : 'h-full'} bg-primary flex flex-col`}
    >
      <ChartHeader
        timeframe={timeframe}
        onTimeframeChange={setTimeframe}
        chartType={chartType}
        showChartTypeMenu={showChartTypeMenu}
        onToggleChartTypeMenu={handleToggleChartTypeMenu}
        onSelectChartType={handleSelectChartType}
        showIndicatorMenu={showIndicatorMenu}
        onToggleIndicatorMenu={handleToggleIndicatorMenu}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeIndicators={activeIndicators}
        onToggleIndicator={toggleIndicator}
        showSettingsMenu={showSettingsMenu}
        onToggleSettingsMenu={handleToggleSettingsMenu}
        showVolume={showVolume}
        onToggleVolume={handleToggleVolume}
        showGrid={showGrid}
        onToggleGrid={handleToggleGrid}
        showCrosshair={showCrosshair}
        onToggleCrosshair={handleToggleCrosshair}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        onDownload={downloadChart}
        isMobile={isMobile}
        activeChartTab={activeChartTab}
        onChartTabChange={onChartTabChange}
      />

      <div
        className="flex-1 bg-secondary relative overflow-hidden min-h-[200px]"
        style={{ touchAction: 'none' }}
      >
        <Watermark market={selectedMarket} isMobile={isMobile} isDark={isDark} />
        <HistoryLoadingOverlay isFetchingMore={isFetchingMore} />
        <DrawingToolbar
          show={showDrawingToolbar}
          onShow={() => setShowDrawingToolbar(true)}
          onHide={() => setShowDrawingToolbar(false)}
          activeTool={activeDrawTool}
          activeCategory={activeCategory}
          onSelectCategory={setActiveCategory}
          onSelectTool={handleSelectDrawTool}
          onClear={clearDrawings}
        />
        <Legend
          legend={legend}
          market={selectedMarket}
          timeframe={timeframe}
          colors={themeColors}
          activeIndicators={activeIndicators}
          indicatorResults={lastIndicatorResults.current}
          indicatorResultsVersion={indicatorResultsVersion}
          showIndicatorPills={showIndicatorPills}
          onTogglePills={handleToggleIndicatorPills}
          onToggleVisibility={toggleIndicatorVisibility}
          onEdit={setEditingInstanceId}
          onRemove={handleRemoveIndicator}
          leftOffset={showDrawingToolbar ? 54 : 12}
        />
        <DrawingStyleBar
          active={!!activeDrawTool && activeDrawTool !== ''}
          hasSelected={hasSelectedDrawing}
          color={activeDrawingColor}
          onColorChange={handleDrawingColorChange}
          width={activeDrawingWidth}
          onWidthChange={handleDrawingWidthChange}
          onDeleteSelected={deleteSelectedDrawing}
        />
        <ScaleModeToggle isLog={isLogScale} onToggle={handleToggleLogScale} />

        {editingInstanceId && (
          <IndicatorSettingsModal
            instanceId={editingInstanceId}
            active={editingIndicator}
            onClose={() => setEditingInstanceId(null)}
            onChangeField={handleFieldChange}
            onChangeColor={handleColorChange}
          />
        )}

        {error && (
          <div className="absolute top-14 left-2 right-2 sm:mx-4 p-2 sm:p-3 bg-red-500/10 border border-red-500/30 rounded-lg z-10 backdrop-blur-sm">
            <p className="text-xs sm:text-sm text-red-400 font-medium">{error}</p>
          </div>
        )}

        <MarketTransitionOverlay
          isLoading={isLoading && !hasInitiallyLoaded}
          market={selectedMarket}
        />

        <div
          ref={chartContainerRef}
          className="absolute right-0 top-0 bottom-0 opacity-100 transition-all duration-300"
          style={{
            left: showDrawingToolbar ? '46px' : '0px',
            touchAction: 'none',
            overscrollBehavior: 'contain',
          }}
        />
      </div>
    </div>
  );
}
