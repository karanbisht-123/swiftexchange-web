import { useCallback, useEffect, useRef, useState } from 'react';

import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { DrawingManager } from 'lightweight-charts-drawing';

import { createDrawingInstance, hydrateDrawing } from '../constants/drawingClassMap';
import { getRequiredAnchors } from '../constants/toolCategories';
import { readLocalStorage, writeLocalStorage } from '../utils/storage';

export interface PointerHandlerCleanup {
  (): void;
}

export interface UseChartDrawingsResult {
  drawingManagerRef: React.MutableRefObject<any>;
  isSwitchingMarketRef: React.MutableRefObject<boolean>;
  hasSelectedDrawing: boolean;
  attachDrawingManager: (
    chart: IChartApi,
    series: ISeriesApi<any>,
    container: HTMLDivElement,
    market: string,
    onStyleChange?: (color: string, width: number) => void
  ) => void;
  detachDrawingManager: () => void;
  clearDrawings: () => void;
  deleteSelectedDrawing: () => void;
  setActiveTool: (toolId: string | null) => void;
  attachPointerHandlers: (
    container: HTMLDivElement,
    chart: IChartApi,
    series: ISeriesApi<any>,
    activeDrawTool: string,
    activeDrawingColor: string,
    activeDrawingWidth: number,
    onPlacementComplete: () => void
  ) => PointerHandlerCleanup;
}

export function useChartDrawings(): UseChartDrawingsResult {
  const drawingManagerRef = useRef<any>(null);
  const isSwitchingMarketRef = useRef(false);
  const activeDrawingRef = useRef<any>(null);
  const isPlacingRef = useRef<boolean>(false);
  const placingAnchorIndexRef = useRef<number>(0);
  const [hasSelectedDrawing, setHasSelectedDrawing] = useState(false);

  const attachDrawingManager = useCallback(
    (
      chart: IChartApi,
      series: ISeriesApi<any>,
      container: HTMLDivElement,
      market: string,
      onStyleChange?: (color: string, width: number) => void
    ) => {
      try {
        const manager = new DrawingManager();
        manager.attach(chart, series as any, container);
        drawingManagerRef.current = manager;
        const saved = readLocalStorage<any[]>(`dydx_drawings_${market}`, s => JSON.parse(s), []);
        if (saved && saved.length > 0) {
          manager.importDrawings(saved, (type: string, data: any) => hydrateDrawing(type, data));
        }

        const saveDrawings = () => {
          if (isSwitchingMarketRef.current) return;
          try {
            const list = manager.exportDrawings();
            writeLocalStorage(`dydx_drawings_${market}`, JSON.stringify(list));
          } catch {
            /* ignore */
          }
        };

        manager.on('drawing:added', saveDrawings);
        manager.on('drawing:removed', () => {
          saveDrawings();
          setHasSelectedDrawing(!!manager.getSelectedDrawing());
        });
        manager.on('drawing:updated', saveDrawings);
        manager.on('drawing:cleared', () => {
          saveDrawings();
          setHasSelectedDrawing(false);
        });

        manager.on('drawing:selected', (e: any) => {
          setHasSelectedDrawing(true);
          if (e.drawing) {
            const style = e.drawing.style;
            if (style && style.lineColor && onStyleChange) {
              onStyleChange(style.lineColor, style.lineWidth || 2);
            }
          }
        });

        manager.on('drawing:deselected', () => {
          setHasSelectedDrawing(false);
        });
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('[Chart] DrawingManager init error:', err);
        }
        drawingManagerRef.current = null;
      }
    },
    []
  );

  const detachDrawingManager = useCallback(() => {
    if (drawingManagerRef.current) {
      try {
        drawingManagerRef.current.detach?.();
      } catch {
        /* ignore */
      }
      drawingManagerRef.current = null;
      setHasSelectedDrawing(false);
    }
  }, []);

  const clearDrawings = useCallback(() => {
    const manager = drawingManagerRef.current;
    if (!manager) return;
    try {
      manager.clearAll?.();
    } catch {
      /* ignore */
    }
  }, []);

  const deleteSelectedDrawing = useCallback(() => {
    const manager = drawingManagerRef.current;
    if (!manager) return;
    try {
      const selected = manager.getSelectedDrawing();
      if (selected) {
        manager.removeDrawing(selected.id);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setActiveTool = useCallback((toolId: string | null) => {
    const manager = drawingManagerRef.current;
    if (!manager) return;
    try {
      manager.setActiveTool?.(toolId);
    } catch {
      /* ignore */
    }
  }, []);

  const cancelPlacement = useCallback((onCancel: () => void) => {
    if (isPlacingRef.current && activeDrawingRef.current) {
      const manager = drawingManagerRef.current;
      if (manager) {
        try {
          manager.removeDrawing(activeDrawingRef.current.id);
        } catch {
          /* ignore */
        }
      }
    }
    isPlacingRef.current = false;
    activeDrawingRef.current = null;
    placingAnchorIndexRef.current = 0;
    onCancel();
  }, []);

  const attachPointerHandlers = useCallback(
    (
      container: HTMLDivElement,
      chart: IChartApi,
      series: ISeriesApi<any>,
      activeDrawTool: string,
      activeDrawingColor: string,
      activeDrawingWidth: number,
      onPlacementComplete: () => void
    ): PointerHandlerCleanup => {
      const getChartCoordinates = (clientX: number, clientY: number) => {
        const rect = container.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const time = chart.timeScale().coordinateToTime(x);
        const price = series.coordinateToPrice(y);
        if (time === null || price === null) return null;
        return { time, price };
      };

      const placePoint = (clientX: number, clientY: number) => {
        const coords = getChartCoordinates(clientX, clientY);
        if (!coords) return;
        const manager = drawingManagerRef.current;
        if (!manager) return;
        const reqAnchors = getRequiredAnchors(activeDrawTool);

        if (!isPlacingRef.current) {
          const drawingId = `${activeDrawTool}-${Date.now()}`;
          const points = Array.from({ length: reqAnchors }, () => ({ ...coords }));
          const drawing = createDrawingInstance(
            activeDrawTool,
            drawingId,
            points,
            activeDrawingColor,
            activeDrawingWidth
          );
          if (drawing) {
            manager.addDrawing(drawing);
            activeDrawingRef.current = drawing;
            if (reqAnchors === 1) {
              manager.selectDrawing(drawingId);
              isPlacingRef.current = false;
              activeDrawingRef.current = null;
              placingAnchorIndexRef.current = 0;
              onPlacementComplete();
            } else {
              isPlacingRef.current = true;
              placingAnchorIndexRef.current = 1;
            }
          }
        } else {
          const drawing = activeDrawingRef.current;
          if (drawing) {
            drawing.updateAnchor(placingAnchorIndexRef.current, coords);
            const nextIndex = placingAnchorIndexRef.current + 1;
            if (nextIndex >= reqAnchors) {
              manager.selectDrawing(drawing.id);
              isPlacingRef.current = false;
              activeDrawingRef.current = null;
              placingAnchorIndexRef.current = 0;
              onPlacementComplete();
            } else {
              placingAnchorIndexRef.current = nextIndex;
            }
          }
        }
      };

      const movePoint = (clientX: number, clientY: number) => {
        if (!isPlacingRef.current || !activeDrawingRef.current) return;
        const coords = getChartCoordinates(clientX, clientY);
        if (!coords) return;
        const reqAnchors = getRequiredAnchors(activeDrawTool);
        for (let i = placingAnchorIndexRef.current; i < reqAnchors; i++) {
          activeDrawingRef.current.updateAnchor(i, coords);
        }
      };

      const handleMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        placePoint(e.clientX, e.clientY);
      };
      const handleMouseMove = (e: MouseEvent) => {
        movePoint(e.clientX, e.clientY);
      };

      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        e.stopPropagation();
        placePoint(e.touches[0].clientX, e.touches[0].clientY);
      };
      const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        e.stopPropagation();
        movePoint(e.touches[0].clientX, e.touches[0].clientY);
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          cancelPlacement(onPlacementComplete);
        }
      };

      container.addEventListener('mousedown', handleMouseDown, true);
      container.addEventListener('mousemove', handleMouseMove, true);
      container.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
      container.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
      window.addEventListener('keydown', handleKeyDown);

      return () => {
        container.removeEventListener('mousedown', handleMouseDown, true);
        container.removeEventListener('mousemove', handleMouseMove, true);
        container.removeEventListener('touchstart', handleTouchStart, { capture: true } as any);
        container.removeEventListener('touchmove', handleTouchMove, { capture: true } as any);
        window.removeEventListener('keydown', handleKeyDown);
        if (isPlacingRef.current && activeDrawingRef.current) {
          const manager = drawingManagerRef.current;
          if (manager) {
            try {
              manager.removeDrawing(activeDrawingRef.current.id);
            } catch {
              /* ignore */
            }
          }
          isPlacingRef.current = false;
          activeDrawingRef.current = null;
          placingAnchorIndexRef.current = 0;
        }
      };
    },
    [cancelPlacement]
  );

  // Ensure isPlacingRef is reset on unmount, and setup global delete key handler
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeEl = document.activeElement;
        if (
          activeEl &&
          (activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.getAttribute('contenteditable') === 'true')
        ) {
          return;
        }
        const manager = drawingManagerRef.current;
        if (manager) {
          try {
            const selected = manager.getSelectedDrawing();
            if (selected) {
              e.preventDefault();
              manager.removeDrawing(selected.id);
            }
          } catch {
            /* ignore */
          }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      isPlacingRef.current = false;
      activeDrawingRef.current = null;
      placingAnchorIndexRef.current = 0;
    };
  }, []);

  return {
    drawingManagerRef,
    isSwitchingMarketRef,
    hasSelectedDrawing,
    attachDrawingManager,
    detachDrawingManager,
    clearDrawings,
    deleteSelectedDrawing,
    setActiveTool,
    attachPointerHandlers,
  };
}
