import { useCallback } from 'react';

import { indicatorRegistry } from 'lightweight-charts-indicators';

import { MAX_INDICATORS } from '../constants/toolCategories';
import type { ActiveIndicator, CandleResolution, ChartType } from '../types';
import { strBool, strJson, strString, useDebouncedLocalStorage } from '../utils/storage';

export interface UseChartSettingsResult {
  timeframe: CandleResolution;
  setTimeframe: (v: CandleResolution | ((p: CandleResolution) => CandleResolution)) => void;
  chartType: ChartType;
  setChartType: (v: ChartType | ((p: ChartType) => ChartType)) => void;
  showVolume: boolean;
  setShowVolume: (v: boolean | ((p: boolean) => boolean)) => void;
  showGrid: boolean;
  setShowGrid: (v: boolean | ((p: boolean) => boolean)) => void;
  showCrosshair: boolean;
  setShowCrosshair: (v: boolean | ((p: boolean) => boolean)) => void;
  isLogScale: boolean;
  setIsLogScale: (v: boolean | ((p: boolean) => boolean)) => void;
  activeIndicators: ActiveIndicator[];
  setActiveIndicators: (
    v: ActiveIndicator[] | ((p: ActiveIndicator[]) => ActiveIndicator[])
  ) => void;
  addIndicator: (registryId: string) => void;
  removeIndicator: (instanceId: string) => void;
  toggleIndicatorVisibility: (instanceId: string) => void;
}

export function useChartSettings(): UseChartSettingsResult {
  const [timeframe, setTimeframe] = useDebouncedLocalStorage<CandleResolution>(
    'dydx_chart_timeframe',
    '15MINS',
    strString.s,
    strString.d as (s: string) => CandleResolution
  );
  const [chartType, setChartType] = useDebouncedLocalStorage<ChartType>(
    'dydx_chart_type',
    'candlestick',
    strString.s,
    strString.d as (s: string) => ChartType
  );
  const [showVolume, setShowVolume] = useDebouncedLocalStorage<boolean>(
    'dydx_chart_show_volume',
    true,
    strBool.s,
    strBool.d
  );
  const [showGrid, setShowGrid] = useDebouncedLocalStorage<boolean>(
    'dydx_chart_show_grid',
    true,
    strBool.s,
    strBool.d
  );
  const [showCrosshair, setShowCrosshair] = useDebouncedLocalStorage<boolean>(
    'dydx_chart_show_crosshair',
    true,
    strBool.s,
    strBool.d
  );
  const [isLogScale, setIsLogScale] = useDebouncedLocalStorage<boolean>(
    'dydx_chart_is_log_scale',
    false,
    strBool.s,
    strBool.d
  );
  const [activeIndicators, setActiveIndicators] = useDebouncedLocalStorage<ActiveIndicator[]>(
    'dydx_active_indicators',
    [],
    strJson.s,
    (s: string) => {
      try {
        const parsed = JSON.parse(s);
        return Array.isArray(parsed) ? parsed.slice(0, MAX_INDICATORS) : [];
      } catch {
        return [];
      }
    }
  );

  const addIndicator = useCallback(
    (registryId: string) => {
      setActiveIndicators(prev => {
        if (prev.length >= MAX_INDICATORS) {
          if (import.meta.env.DEV) {
            console.warn(`[Chart] Maximum of ${MAX_INDICATORS} indicators allowed.`);
          }
          return prev;
        }
        const entry = indicatorRegistry.find(ind => ind.id === registryId);
        if (!entry) return prev;

        const defaultInputs: Record<string, any> = {};
        entry.inputConfig.forEach(input => {
          defaultInputs[input.id] = input.defval;
        });

        const newIndicator: ActiveIndicator = {
          instanceId: `${registryId}-${Date.now()}`,
          indicatorId: registryId,
          inputs: defaultInputs,
          color: entry.plotConfig[0]?.color || '#3b82f6',
        };

        return [...prev, newIndicator];
      });
    },
    [setActiveIndicators]
  );

  const removeIndicator = useCallback(
    (instanceId: string) => {
      setActiveIndicators(prev => prev.filter(ind => ind.instanceId !== instanceId));
    },
    [setActiveIndicators]
  );

  const toggleIndicatorVisibility = useCallback(
    (instanceId: string) => {
      setActiveIndicators(prev =>
        prev.map(ind =>
          ind.instanceId === instanceId
            ? { ...ind, visible: ind.visible === false ? true : false }
            : ind
        )
      );
    },
    [setActiveIndicators]
  );

  return {
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
  };
}
