import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
    ColorType,
    CrosshairMode,
    LineStyle,
    PriceScaleMode,
    type IChartApi,
    type ISeriesApi,
    createChart,
} from 'lightweight-charts';

import type { ThemeColors } from '../types';

export interface ChartInstanceOptions {
    showGrid: boolean;
    showCrosshair: boolean;
    showVolume: boolean;
    isLogScale: boolean;
    isMobile: boolean;
    isDark: boolean;
}

export interface UseChartInstanceResult {
    chartContainerRef: React.RefObject<HTMLDivElement | null>;
    chartRef: React.RefObject<IChartApi | null>;
    seriesRef: React.RefObject<ISeriesApi<any> | null>;
    volumeSeriesRef: React.RefObject<ISeriesApi<any> | null>;
    markersPluginRef: React.RefObject<any>;
    themeColors: ThemeColors;
    createChartInstance: (
        options: ChartInstanceOptions,
        onCrosshairMove: (time: number | null) => void,
        onVisibleRangeChange: () => void
    ) => void;
}

export function useChartInstance(isDark: boolean): UseChartInstanceResult {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<any> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);
    const markersPluginRef = useRef<any>(null);

    const pendingCrosshairTimeRef = useRef<number | null>(null);
    const crosshairRafIdRef = useRef<number | null>(null);

    const themeColors = useMemo<ThemeColors>(
        () =>
            isDark
                ? {
                    background: '#0f1528',
                    textColor: '#e8edf8',
                    gridColor: '#1e28405d',
                    borderColor: '#1e2840',
                    upColor: '#0ecb81',
                    downColor: '#ff4d4d',
                    volumeColor: 'rgba(128, 128, 128, 0.2)',
                    crosshairColor: '#4a5680',
                }
                : {
                    background: '#f7f8fc',
                    textColor: '#0f1729',
                    gridColor: '#dce3ed',
                    borderColor: '#e4e8f0',
                    upColor: '#00b074',
                    downColor: '#ff3b30',
                    volumeColor: 'rgba(107, 114, 128, 0.2)',
                    crosshairColor: '#8896b3',
                },
        [isDark]
    );

    const createChartInstance = useCallback(
        (
            options: ChartInstanceOptions,
            onCrosshairMove: (time: number | null) => void,
            onVisibleRangeChange: () => void
        ) => {
            if (!chartContainerRef.current) return;

            const colors = themeColors;
            const container = chartContainerRef.current;

            if (chartRef.current) {
                chartRef.current.remove();
                chartRef.current = null;
                seriesRef.current = null;
                volumeSeriesRef.current = null;
                markersPluginRef.current = null;
            }

            const chart = createChart(container, {
                width: container.clientWidth,
                height: container.clientHeight,
                layout: {
                    background: { type: ColorType.Solid, color: colors.background },
                    textColor: colors.textColor,
                    fontSize: options.isMobile ? 10 : 12,
                    fontFamily:
                        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                },
                grid: {
                    vertLines: {
                        color: options.showGrid ? colors.gridColor : 'transparent',
                        style: LineStyle.Solid,
                        visible: options.showGrid,
                    },
                    horzLines: {
                        color: options.showGrid ? colors.gridColor : 'transparent',
                        style: LineStyle.Solid,
                        visible: options.showGrid,
                    },
                },
                crosshair: {
                    mode: options.showCrosshair
                        ? CrosshairMode.Normal
                        : CrosshairMode.Hidden,
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
                    scaleMargins: { top: 0.08, bottom: options.showVolume ? 0.22 : 0.08 },
                    minimumWidth: options.isMobile ? 50 : 65,
                    mode: options.isLogScale
                        ? PriceScaleMode.Logarithmic
                        : PriceScaleMode.Normal,
                },
                timeScale: {
                    borderColor: colors.borderColor,
                    timeVisible: true,
                    secondsVisible: false,
                    rightOffset: options.isMobile ? 12 : 20,
                    barSpacing: options.isMobile ? 8 : 12,
                    minBarSpacing: options.isMobile ? 3 : 5,
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

            chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleRangeChange);

            chart.subscribeCrosshairMove(param => {
                const t = (param?.time as number | undefined) ?? null;
                if (t === pendingCrosshairTimeRef.current) return;
                pendingCrosshairTimeRef.current = t;
                if (crosshairRafIdRef.current != null) return;
                crosshairRafIdRef.current = requestAnimationFrame(() => {
                    crosshairRafIdRef.current = null;
                    onCrosshairMove(pendingCrosshairTimeRef.current);
                });
            });

            chartRef.current = chart;
        },
        [themeColors]
    );

    // ----- ResizeObserver with rAF throttle -----
    useEffect(() => {
        if (!chartContainerRef.current) return;
        const container = chartContainerRef.current;
        let rafId: number | null = null;

        const ro = new ResizeObserver(entries => {
            const entry = entries[0];
            if (!entry || !chartRef.current) return;
            const { width, height } = entry.contentRect;
            if (width <= 0 || height <= 0) return;
            if (rafId != null) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                try {
                    chartRef.current?.applyOptions({
                        width: Math.floor(width),
                        height: Math.floor(height),
                    });
                } catch { }
            });
        });
        ro.observe(container);
        return () => {
            if (rafId != null) cancelAnimationFrame(rafId);
            ro.disconnect();
        };
    }, []);

    return {
        chartContainerRef,
        chartRef,
        seriesRef,
        volumeSeriesRef,
        markersPluginRef,
        themeColors,
        createChartInstance,
    };
}