import type { ReactNode } from 'react';

import type { CandleResolution } from '../../hooks/useCandles';

export type { CandleResolution };

export type ChartType = 'candlestick' | 'line' | 'area';

export interface CandleBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface LegendData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePct: number;
  [key: string]: any;
}

export interface ActiveIndicator {
  instanceId: string;
  indicatorId: string;
  inputs: Record<string, any>;
  color: string;
  visible?: boolean;
}

export interface ThemeColors {
  background: string;
  textColor: string;
  gridColor: string;
  borderColor: string;
  upColor: string;
  downColor: string;
  volumeColor: string;
  crosshairColor: string;
}

export interface DrawingToolItem {
  id: string;
  label: string;
  icon: ReactNode;
}

export interface ToolSection {
  header: string;
  tools: DrawingToolItem[];
}

export interface ToolCategory {
  id: string;
  label: string;
  icon: ReactNode;
  sections: ToolSection[];
}

export interface ChartSettings {
  timeframe: CandleResolution;
  chartType: ChartType;
  showVolume: boolean;
  showGrid: boolean;
  showCrosshair: boolean;
  isLogScale: boolean;
  activeIndicators: ActiveIndicator[];
}
