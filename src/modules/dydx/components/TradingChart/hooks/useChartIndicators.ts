import { useCallback, useRef, useState } from 'react';

import {
    CandlestickSeries,
    HistogramSeries,
    LineSeries,
    type IChartApi,
    type ISeriesApi,
    createSeriesMarkers,
} from 'lightweight-charts';
import { indicatorRegistry } from 'lightweight-charts-indicators';

import type { ActiveIndicator, CandleBar, ThemeColors } from '../types';
import { INDICATOR_RECALC_THROTTLE_MS } from '../constants/toolCategories';
import { getPlot } from '../utils/candles';

export interface UseChartIndicatorsResult {
    activeSeriesRefs: React.MutableRefObject<
        Map<string, { seriesList: ISeriesApi<any>[]; paneIndex?: number }>
    >;
    lastIndicatorResults: React.MutableRefObject<Map<string, any>>;
    indicatorResultsVersion: number;
    syncIndicatorSeries: (
        chart: IChartApi,
        activeIndicators: ActiveIndicator[],
        colors: ThemeColors,
        isMobile: boolean
    ) => void;
    applyIndicators: (
        candleData: CandleBar[],
        activeIndicators: ActiveIndicator[],
        seriesRef: React.MutableRefObject<ISeriesApi<any> | null>,
        markersPluginRef: React.MutableRefObject<any>
    ) => void;
    applyIndicatorsTick: (
        activeIndicators: ActiveIndicator[]
    ) => void;
    scheduleIndicatorRecalc: (updatedBar: CandleBar) => void;
    setRecalcContext: (ctx: {
        activeIndicators: ActiveIndicator[];
    }) => void;
}

export function useChartIndicators(): UseChartIndicatorsResult {
    const activeSeriesRefs = useRef<
        Map<string, { seriesList: ISeriesApi<any>[]; paneIndex?: number }>
    >(new Map());
    const lastIndicatorResults = useRef<Map<string, any>>(new Map());
    const [indicatorResultsVersion, setIndicatorResultsVersion] = useState(0);

    const lastIndicatorRecalcRef = useRef<number>(0);
    const pendingRecalcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const recalcCtxRef = useRef<{ activeIndicators: ActiveIndicator[] }>({
        activeIndicators: [],
    });

    const setRecalcContext = useCallback((ctx: { activeIndicators: ActiveIndicator[] }) => {
        recalcCtxRef.current = ctx;
    }, []);
    const applyIndicators = useCallback(
        (
            candleData: CandleBar[],
            activeIndicators: ActiveIndicator[],
            seriesRef: React.MutableRefObject<ISeriesApi<any> | null>,
            markersPluginRef: React.MutableRefObject<any>
        ) => {
            if (candleData.length === 0) return;

            const candlestickMarkersMap = new Map<string, any[]>();

            activeIndicators.forEach(active => {
                const entry = indicatorRegistry.find(ind => ind.id === active.indicatorId);
                if (!entry) return;

                const seriesVal = activeSeriesRefs.current.get(active.instanceId);
                if (!seriesVal) return;

                try {
                    const result = entry.calculate(candleData, active.inputs);
                    lastIndicatorResults.current.set(active.instanceId, result);

                    if (active.visible !== false && result && Array.isArray(result.markers)) {
                        candlestickMarkersMap.set(active.instanceId, result.markers);
                    }

                    if (entry.group !== 'candlestick') {
                        let seriesIndex = 0;
                        (entry.plotConfig || []).forEach(plot => {
                            const series = seriesVal.seriesList[seriesIndex++];
                            if (!series) return;
                            series.applyOptions({ visible: active.visible !== false });
                            const plotData = getPlot(result, plot.id);
                            series.setData(plotData);
                        });

                        if (entry.plotCandleConfig) {
                            entry.plotCandleConfig.forEach(pc => {
                                const series = seriesVal.seriesList[seriesIndex++];
                                if (!series) return;
                                series.applyOptions({ visible: active.visible !== false });
                                const candlePlotData = result.candles?.[pc.id] || [];
                                series.setData(candlePlotData);
                            });
                        }
                    }
                } catch (err) {
                    if (import.meta.env.DEV) {
                        console.error(
                            `[Chart] Indicator calculation error (${active.indicatorId}):`,
                            err
                        );
                    }
                    seriesVal.seriesList.forEach(series => {
                        try { series.setData([]); } catch { }
                    });
                }
            });

            // Aggregate markers onto the main candlestick series
            if (seriesRef.current) {
                let combinedMarkers: any[] = [];
                candlestickMarkersMap.forEach(markers => {
                    combinedMarkers = combinedMarkers.concat(markers);
                });
                combinedMarkers.sort((a, b) => a.time - b.time);

                const mappedMarkers = combinedMarkers.map(m => {
                    let position = 'aboveBar';
                    if (m.position === 'belowBar') position = 'belowBar';
                    else if (m.position === 'inBar') position = 'inBar';

                    let shape = 'arrowDown';
                    if (m.shape === 'arrowUp' || m.shape === 'triangleUp') shape = 'arrowUp';
                    else if (m.shape === 'arrowDown' || m.shape === 'triangleDown') shape = 'arrowDown';
                    else if (m.shape === 'circle') shape = 'circle';
                    else if (m.shape === 'square') shape = 'square';

                    return {
                        time: m.time,
                        position: position as any,
                        shape: shape as any,
                        color: m.color || '#fbbf24',
                        text: m.text || '',
                    };
                });

                try {
                    if (markersPluginRef.current) {
                        markersPluginRef.current.setMarkers(mappedMarkers);
                    } else if (seriesRef.current) {
                        markersPluginRef.current = createSeriesMarkers(seriesRef.current, mappedMarkers);
                    }
                } catch (err) {
                    if (import.meta.env.DEV) {
                        console.error('[Chart] Error setting candlestick markers:', err);
                    }
                }
            }

            setIndicatorResultsVersion(v => v + 1);
        },
        []
    );

    // ----- Incremental recalc: update() only the last point on each series -----
    const applyIndicatorsTick = useCallback((activeIndicators: ActiveIndicator[]) => {
        activeIndicators.forEach(active => {
            const entry = indicatorRegistry.find(ind => ind.id === active.indicatorId);
            if (!entry || entry.group === 'candlestick') return;

            const seriesVal = activeSeriesRefs.current.get(active.instanceId);
            if (!seriesVal) return;

            try {
                // Full recalc but only apply last point — still cheaper than setData
                // for large arrays because series.update() doesn't reallocate buffers.
                const result = entry.calculate(
                    // Read latest candle data via the shared ref attached to this hook
                    (activeSeriesRefs as any).__candleDataRef?.current ?? [],
                    active.inputs
                );
                lastIndicatorResults.current.set(active.instanceId, result);

                let seriesIndex = 0;
                (entry.plotConfig || []).forEach(plot => {
                    const series = seriesVal.seriesList[seriesIndex++];
                    if (!series) return;
                    const arr = result.plots?.[plot.id] || [];
                    const lastPoint = arr[arr.length - 1];
                    if (lastPoint && typeof lastPoint.value === 'number' && isFinite(lastPoint.value)) {
                        try { series.update(lastPoint); } catch { }
                    }
                });

                if (entry.plotCandleConfig) {
                    entry.plotCandleConfig.forEach(pc => {
                        const series = seriesVal.seriesList[seriesIndex++];
                        if (!series) return;
                        const arr = result.candles?.[pc.id] || [];
                        const lastCandle = arr[arr.length - 1];
                        if (lastCandle) {
                            try { series.update(lastCandle); } catch { }
                        }
                    });
                }
            } catch (err) {
                if (import.meta.env.DEV) {
                    console.error(`[Chart] Indicator tick error (${active.indicatorId}):`, err);
                }
            }
        });

        setIndicatorResultsVersion(v => v + 1);
    }, []);

    // ----- Throttled scheduler: called on every realtime tick -----
    const scheduleIndicatorRecalc = useCallback(
        (_updatedBar: CandleBar) => {
            const now = Date.now();
            if (now - lastIndicatorRecalcRef.current < INDICATOR_RECALC_THROTTLE_MS) {
                if (pendingRecalcTimerRef.current == null) {
                    pendingRecalcTimerRef.current = setTimeout(() => {
                        pendingRecalcTimerRef.current = null;
                        lastIndicatorRecalcRef.current = Date.now();
                        applyIndicatorsTick(recalcCtxRef.current.activeIndicators);
                    }, INDICATOR_RECALC_THROTTLE_MS);
                }
                return;
            }
            lastIndicatorRecalcRef.current = now;
            applyIndicatorsTick(recalcCtxRef.current.activeIndicators);
        },
        [applyIndicatorsTick]
    );

    // ----- Create / remove series when activeIndicators changes -----
    const syncIndicatorSeries = useCallback(
        (
            chart: IChartApi,
            activeIndicators: ActiveIndicator[],
            colors: ThemeColors,
            isMobile: boolean
        ) => {
            const activeIds = new Set(activeIndicators.map(a => a.instanceId));

            // Remove series for inactive indicators
            activeSeriesRefs.current.forEach((val, instId) => {
                if (!activeIds.has(instId)) {
                    val.seriesList.forEach(series => {
                        try { chart.removeSeries(series); } catch { }
                    });
                    activeSeriesRefs.current.delete(instId);
                    lastIndicatorResults.current.delete(instId);
                }
            });

            let nextPaneIndex = 1;

            activeIndicators.forEach(active => {
                const entry = indicatorRegistry.find(ind => ind.id === active.indicatorId);
                if (!entry) return;

                if (!activeSeriesRefs.current.has(active.instanceId)) {
                    const isOverlay = entry.overlay;
                    const paneIndex = isOverlay ? 0 : nextPaneIndex++;
                    const seriesList: ISeriesApi<any>[] = [];

                    if (entry.group === 'candlestick') {
                        activeSeriesRefs.current.set(active.instanceId, { seriesList: [], paneIndex });
                    } else {
                        (entry.plotConfig || []).forEach(plot => {
                            let series: ISeriesApi<any>;
                            const isHistogram = plot.style === 'histogram' || plot.style === 'columns';

                            if (isHistogram) {
                                series = chart.addSeries(
                                    HistogramSeries,
                                    {
                                        color: plot.color || colors.upColor,
                                        priceLineVisible: false,
                                        lastValueVisible: false,
                                        title: plot.title,
                                        priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
                                        visible: active.visible !== false,
                                    },
                                    paneIndex
                                );
                            } else {
                                series = chart.addSeries(
                                    LineSeries,
                                    {
                                        color: active.color || plot.color || '#3b82f6',
                                        lineWidth: (plot.lineWidth || 2) as any,
                                        priceLineVisible: false,
                                        lastValueVisible: true,
                                        title: plot.title,
                                        crosshairMarkerVisible: false,
                                        priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
                                        visible: active.visible !== false,
                                    },
                                    paneIndex
                                );
                            }
                            seriesList.push(series);
                        });

                        if (entry.plotCandleConfig) {
                            entry.plotCandleConfig.forEach(pc => {
                                const series = chart.addSeries(
                                    CandlestickSeries,
                                    {
                                        title: pc.title,
                                        priceLineVisible: false,
                                        lastValueVisible: true,
                                        priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
                                        visible: active.visible !== false,
                                    },
                                    paneIndex
                                );
                                seriesList.push(series);
                            });
                        }

                        if (paneIndex > 0) {
                            try {
                                chart.panes()[paneIndex]?.setHeight(isMobile ? 80 : 100);
                            } catch { }
                        }

                        activeSeriesRefs.current.set(active.instanceId, { seriesList, paneIndex });
                    }
                } else {
                    const seriesVal = activeSeriesRefs.current.get(active.instanceId);
                    if (
                        seriesVal &&
                        seriesVal.seriesList.length > 0 &&
                        entry.group !== 'candlestick'
                    ) {
                        let seriesIndex = 0;
                        (entry.plotConfig || []).forEach(plot => {
                            const series = seriesVal.seriesList[seriesIndex++];
                            if (series && plot) {
                                try {
                                    const colorToUse =
                                        seriesIndex === 1 ? active.color : plot.color || active.color;
                                    series.applyOptions({
                                        color: colorToUse,
                                        visible: active.visible !== false,
                                    });
                                } catch { }
                            }
                        });
                        if (entry.plotCandleConfig) {
                            entry.plotCandleConfig.forEach(() => {
                                const series = seriesVal.seriesList[seriesIndex++];
                                if (series) {
                                    try {
                                        series.applyOptions({ visible: active.visible !== false });
                                    } catch { }
                                }
                            });
                        }
                    }
                    if (!entry.overlay && entry.group !== 'candlestick') {
                        nextPaneIndex++;
                    }
                }
            });
        },
        []
    );

    return {
        activeSeriesRefs,
        lastIndicatorResults,
        indicatorResultsVersion,
        syncIndicatorSeries,
        applyIndicators,
        applyIndicatorsTick,
        scheduleIndicatorRecalc,
        setRecalcContext,
    };
}
