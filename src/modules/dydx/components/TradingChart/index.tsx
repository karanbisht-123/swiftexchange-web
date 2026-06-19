import { useCallback, useEffect, useRef, useState } from 'react';

import {
    AreaSeries,
    CandlestickSeries,
    HistogramSeries,
    LineSeries,
    PriceScaleMode,
} from 'lightweight-charts';

import { useThemeStore } from '../../../../store/themeStore';
import { useRealtimeChart } from '../../hooks/useCandles';
import useMarketStore from '../../store/marketStore';

import type { LegendData } from './types';
import { normalizeCandles } from './utils/candles';
import { readLocalStorage } from './utils/storage';
import { hydrateDrawing } from './constants/drawingClassMap';

import { useIsMobile } from './hooks/useIsMobile'
import { useChartSettings } from './hooks/useChartSettings';
import { useChartInstance } from './hooks/useChartInstance';
import { useChartData } from './hooks/useChartData';
import { useChartIndicators } from './hooks/useChartIndicators';
import { useChartDrawings } from './hooks/useChartDrawings';

import { ChartHeader } from './components/ChartHeader';
import { Legend } from './components/Legend';
import {
    DrawingStyleBar,
    DrawingToolbar,
    ScaleModeToggle,
} from './components/DrawingToolbar';
import { IndicatorSettingsModal } from './components/IndicatorSettingsModal';
import {
    HistoryLoadingOverlay,
    MarketTransitionOverlay,
    Watermark,
} from './components/LoadingOverlay';

export default function TradingChart() {
    const isDark = useThemeStore(s => s.theme) === 'dark';
    const isMobile = useIsMobile();
    const { selectedMarket } = useMarketStore();

    // ----- Persisted chart settings -----
    const settings = useChartSettings();
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
    } = settings;

    // ----- Pure UI state (not persisted) -----
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

    const chartInstance = useChartInstance(isDark);
    const {
        chartContainerRef,
        chartRef,
        seriesRef,
        volumeSeriesRef,
        markersPluginRef,
        themeColors,
        createChartInstance,
    } = chartInstance;

    const chartData = useChartData();
    const {
        lastCandleDataRef,
        lastBarTimeRef,
        // lastDatasetIdRef,
        // prevMarketRef,
        // prevTimeframeRef,
        applyDataset,
        applyTick,
    } = chartData;

    const indicators = useChartIndicators();
    const {
        activeSeriesRefs,
        lastIndicatorResults,
        indicatorResultsVersion,
        syncIndicatorSeries,
        applyIndicators,
        // applyIndicatorsTick,
        scheduleIndicatorRecalc,
        setRecalcContext,
    } = indicators;

    const drawings = useChartDrawings();
    const {
        drawingManagerRef,
        isSwitchingMarketRef,
        attachDrawingManager,
        detachDrawingManager,
        clearDrawings,
        setActiveTool,
        attachPointerHandlers,
    } = drawings;

    // ----- Refs to current values (for stable callbacks) -----
    const selectedMarketRef = useRef(selectedMarket);
    useEffect(() => {
        selectedMarketRef.current = selectedMarket;
    }, [selectedMarket]);

    const activeIndicatorsRef = useRef(activeIndicators);
    useEffect(() => {
        activeIndicatorsRef.current = activeIndicators;
        setRecalcContext({ activeIndicators });
    }, [activeIndicators, setRecalcContext]);

    // Keep the indicator hook's lastCandleDataRef in sync (it reads from a
    // shared ref attached to activeSeriesRefs via __candleDataRef).
    useEffect(() => {
        (activeSeriesRefs as any).__candleDataRef = lastCandleDataRef;
    }, [activeSeriesRefs, lastCandleDataRef]);

    // ----- Data hook -----
    const { candles, latestCandle, isLoading, isFetchingMore, error, fetchMore } =
        useRealtimeChart(selectedMarket, timeframe, 1000);

    const isFetchingMoreRef = useRef(isFetchingMore);
    useEffect(() => {
        isFetchingMoreRef.current = isFetchingMore;
    }, [isFetchingMore]);

    const candlesRef = useRef(candles);
    useEffect(() => {
        candlesRef.current = candles;
    }, [candles]);

    // ----- Legend builder (stable identity) -----
    const buildLegend = useCallback((time?: number): LegendData | null => {
        const candleData = lastCandleDataRef.current;
        if (!candleData.length) return null;

        let idx = candleData.length - 1;
        if (time !== undefined) {
            let lo = 0,
                hi = candleData.length - 1;
            let found = -1;
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
    }, [lastCandleDataRef, lastIndicatorResults]);

    // ----- Crosshair move handler (called by useChartInstance's rAF coalescer) -----
    const handleCrosshairMove = useCallback(
        (time: number | null) => {
            setLegend(time == null ? buildLegend() : buildLegend(time));
        },
        [buildLegend]
    );

    // ----- Visible range change handler (fetch more history when scrolled left) -----
    const handleVisibleRangeChange = useCallback(() => {
        if (isFetchingMoreRef.current) return;
        const chart = chartRef.current;
        if (!chart) return;
        const logicalRange = chart.timeScale().getVisibleLogicalRange();
        if (logicalRange && logicalRange.from < 10) fetchMore();
    }, [chartRef, fetchMore]);

    // ----- Create chart instance -----
    // Re-runs when chart display options change (theme, grid, crosshair, etc).
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
            handleCrosshairMove,
            handleVisibleRangeChange
        );

        const chart = chartRef.current;
        const container = chartContainerRef.current;
        if (!chart || !container) return;

        // Main series
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
        } else if (chartType === 'area') {
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
            chart
                .priceScale('volume')
                .applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
        }
        activeSeriesRefs.current.clear();
        markersPluginRef.current = null;

        // Attach DrawingManager
        if (seriesRef.current) {
            attachDrawingManager(chart, seriesRef.current, container, selectedMarketRef.current);
        }

        // Load existing candle data into the new chart
        const currentCandles = candlesRef.current;
        if (currentCandles.length > 0) {
            const candleData = normalizeCandles(currentCandles);
            if (candleData.length > 0) {
                if (chartType === 'candlestick') {
                    seriesRef.current?.setData(candleData);
                } else {
                    seriesRef.current?.setData(
                        candleData.map(c => ({ time: c.time, value: c.close }))
                    );
                }

                lastBarTimeRef.current = candleData[candleData.length - 1].time;

                if (showVolume && volumeSeriesRef.current) {
                    volumeSeriesRef.current.setData(
                        candleData.map(c => ({
                            time: c.time,
                            value: c.volume,
                            color:
                                c.close >= c.open
                                    ? themeColors.upColor + '40'
                                    : themeColors.downColor + '40',
                        }))
                    );
                }

                lastCandleDataRef.current = candleData;
                syncIndicatorSeries(
                    chart,
                    activeIndicatorsRef.current,
                    themeColors,
                    isMobile
                );
                applyIndicators(
                    candleData,
                    activeIndicatorsRef.current,
                    seriesRef,
                    markersPluginRef
                );
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

    // ----- Init / destroy chart -----
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

    // ----- Sync indicator series whenever activeIndicators changes -----
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        syncIndicatorSeries(chart, activeIndicators, themeColors, isMobile);

        if (lastCandleDataRef.current.length > 0) {
            applyIndicators(
                lastCandleDataRef.current,
                activeIndicators,
                seriesRef,
                markersPluginRef
            );
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

    // ----- Main data effect (full dataset replace) -----
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

    // ----- Real-time candle update -----
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
            setLegend(buildLegend());
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

    // ----- Sync drawings on market change -----
    useEffect(() => {
        const manager = drawingManagerRef.current;
        if (!manager) return;

        isSwitchingMarketRef.current = true;
        try {
            manager.clearAll?.();
        } catch { }

        try {
            const saved = readLocalStorage<any[]>(
                `dydx_drawings_${selectedMarket}`,
                s => JSON.parse(s),
                []
            );
            if (saved && saved.length > 0) {
                manager.importDrawings(saved, (type: string, data: any) =>
                    hydrateDrawing(type, data)
                );
            }
        } catch {
        } finally {
            setTimeout(() => {
                isSwitchingMarketRef.current = false;
            }, 50);
        }
    }, [selectedMarket, drawingManagerRef, isSwitchingMarketRef]);

    // ----- Scale mode effect -----
    useEffect(() => {
        if (chartRef.current) {
            chartRef.current.priceScale('right').applyOptions({
                mode: isLogScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
            });
        }
    }, [isLogScale, chartRef]);

    // ----- Cursor for drawing tools -----
    useEffect(() => {
        const container = chartContainerRef.current;
        if (!container) return;
        container.style.cursor =
            activeDrawTool && activeDrawTool !== '' ? 'crosshair' : 'default';
    }, [activeDrawTool, chartContainerRef]);

    // ----- Drawing pointer events -----
    useEffect(() => {
        const container = chartContainerRef.current;
        const chart = chartRef.current;
        const series = seriesRef.current;
        if (!container || !chart || !series || !activeDrawTool || activeDrawTool === '') {
            return;
        }

        const cleanup = attachPointerHandlers(
            container,
            chart,
            series,
            activeDrawTool,
            activeDrawingColor,
            activeDrawingWidth,
            () => setActiveDrawTool(null)
        );

        return cleanup;
    }, [
        activeDrawTool,
        activeDrawingColor,
        activeDrawingWidth,
        attachPointerHandlers,
        chartContainerRef,
        chartRef,
        seriesRef,
    ]);

    // ----- Drawing tool selection -----
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

    // ----- Indicator toggle (add or remove from picker) -----
    const toggleIndicator = useCallback(
        (registryId: string, instanceId: string | null) => {
            if (instanceId) {
                removeIndicator(instanceId);
            } else {
                addIndicator(registryId);
            }
        },
        [addIndicator, removeIndicator]
    );

    // ----- Settings modal field change -----
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
                prev.map(ind =>
                    ind.instanceId === editingInstanceId ? { ...ind, color } : ind
                )
            );
        },
        [editingInstanceId, setActiveIndicators]
    );

    // ----- Misc -----
    const downloadChart = useCallback(() => {
        if (!chartContainerRef.current) return;
        const canvas = chartContainerRef.current.querySelector('canvas');
        if (canvas) {
            const link = document.createElement('a');
            link.download = `${selectedMarket}-${timeframe}-${Date.now()}.png`;
            link.href = canvas.toDataURL();
            link.click();
        }
    }, [chartContainerRef, selectedMarket, timeframe]);

    const toggleFullscreen = useCallback(() => setIsFullscreen(prev => !prev), []);

    // Bump indicatorResultsVersion triggers re-render so Legend re-reads results
    void indicatorResultsVersion;

    const editingIndicator = editingInstanceId
        ? activeIndicators.find(ind => ind.instanceId === editingInstanceId)
        : undefined;

    // ----- Render -----
    return (
        <div
            className={`${isFullscreen ? 'fixed inset-0 z-50 animate-fade-in' : 'h-full'
                } bg-primary flex flex-col`}
        >
            <ChartHeader
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
                chartType={chartType}
                showChartTypeMenu={showChartTypeMenu}
                onToggleChartTypeMenu={() => setShowChartTypeMenu(v => !v)}
                onSelectChartType={v => {
                    setChartType(v);
                    setShowChartTypeMenu(false);
                }}
                showIndicatorMenu={showIndicatorMenu}
                onToggleIndicatorMenu={() => setShowIndicatorMenu(v => !v)}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                activeIndicators={activeIndicators}
                onToggleIndicator={toggleIndicator}
                showSettingsMenu={showSettingsMenu}
                onToggleSettingsMenu={() => setShowSettingsMenu(v => !v)}
                showVolume={showVolume}
                onToggleVolume={() => setShowVolume(v => !v)}
                showGrid={showGrid}
                onToggleGrid={() => setShowGrid(v => !v)}
                showCrosshair={showCrosshair}
                onToggleCrosshair={() => setShowCrosshair(v => !v)}
                isFullscreen={isFullscreen}
                onToggleFullscreen={toggleFullscreen}
                onDownload={downloadChart}
                isMobile={isMobile}
            />

            <div className="flex-1 bg-secondary relative overflow-hidden min-h-[200px]">
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
                    colors={themeColors}
                    activeIndicators={activeIndicators}
                    indicatorResults={lastIndicatorResults.current}
                    showIndicatorPills={showIndicatorPills}
                    onTogglePills={() => setShowIndicatorPills(v => !v)}
                    onToggleVisibility={toggleIndicatorVisibility}
                    onEdit={setEditingInstanceId}
                    onRemove={instanceId => {
                        removeIndicator(instanceId);
                        if (editingInstanceId === instanceId) setEditingInstanceId(null);
                    }}
                    leftOffset={showDrawingToolbar ? 54 : 12}
                />
                <DrawingStyleBar
                    active={!!activeDrawTool && activeDrawTool !== ''}
                    color={activeDrawingColor}
                    onColorChange={setActiveDrawingColor}
                    width={activeDrawingWidth}
                    onWidthChange={setActiveDrawingWidth}
                />
                <ScaleModeToggle
                    isLog={isLogScale}
                    onToggle={() => setIsLogScale(v => !v)}
                />
                <IndicatorSettingsModal
                    instanceId={editingInstanceId}
                    active={editingIndicator}
                    onClose={() => setEditingInstanceId(null)}
                    onChangeField={handleFieldChange}
                    onChangeColor={handleColorChange}
                />
                {error && (
                    <div className="absolute top-14 left-2 right-2 sm:mx-4 p-2 sm:p-3 bg-red-500/10 border border-red-500/30 rounded-lg z-10 backdrop-blur-sm">
                        <p className="text-xs sm:text-sm text-red-400 font-medium">{error}</p>
                    </div>
                )}
                <MarketTransitionOverlay isLoading={isLoading} market={selectedMarket} />
                <div
                    ref={chartContainerRef}
                    className="absolute right-0 top-0 bottom-0 opacity-100 transition-all duration-300"
                    style={{
                        left: showDrawingToolbar ? '46px' : '0px',
                        touchAction: 'none',
                    }}
                />
            </div>
        </div>
    );
}

// Re-export types and helpers for callers
export * from './types';
export { normalizeCandles, findAt, formatNum } from './utils/candles';
