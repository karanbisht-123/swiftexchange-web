export interface ChartDataPoint {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  baseVolume: string;
  counterVolume: string;
  tradeCount: number;
}

export interface ChartTimeRange {
  startTime: number;
  endTime: number;
}

export interface ChartAssetPair {
  base: string;
  counter: string;
  baseIssuer?: string;
  counterIssuer?: string;
}

export interface ChartOptions {
  resolution: ChartResolution;
  limit?: number;
  order?: 'asc' | 'desc';
  offset?: number;
}

export type ChartResolution =
  | 60000 // 1 minute
  | 300000 // 5 minutes
  | 900000 // 15 minutes
  | 3600000 // 1 hour
  | 86400000 // 1 day
  | 604800000; // 1 week

export interface StellarTradeAggregation {
  timestamp: string;
  trade_count: string;
  base_volume: string;
  counter_volume: string;
  avg: string;
  high: string;
  high_r: {
    N: number;
    D: number;
  };
  low: string;
  low_r: {
    N: number;
    D: number;
  };
  open: string;
  open_r: {
    N: number;
    D: number;
  };
  close: string;
  close_r: {
    N: number;
    D: number;
  };
}

export interface ChartState {
  data: ChartDataPoint[];
  isLoading: boolean;
  error: string | null;
  isStreaming: boolean;
  lastUpdate: number | null;
}

export interface UseChartReturn extends ChartState {
  startStreaming: () => void;
  stopStreaming: () => void;
  refreshData: () => Promise<void>;
  setResolution: (resolution: ChartResolution) => void;
  setTimeRange: (range: ChartTimeRange) => void;
  setAssetPair: (pair: ChartAssetPair) => void;
}
