import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DEFAULT_RESOLUTION,
  NATIVE_ASSET,
  STREAM_MAX_RETRIES,
  STREAM_RECONNECT_DELAY,
} from '../constants/steallrChartConstant';
import { StellarChartService } from '../service/stellarChartService';
import type {
  ChartAssetPair,
  ChartDataPoint,
  ChartOptions,
  ChartResolution,
  ChartTimeRange,
  UseChartReturn,
} from '../types/stellarChart.types';

interface UseStellarChartProps {
  networkKey?: string;
  assetPair?: ChartAssetPair;
  resolution?: ChartResolution;
  timeRange?: ChartTimeRange;
  autoStream?: boolean;
}

export function useStellarChart({
  networkKey = 'mainnet',
  assetPair = {
    base: 'XLM',
    counter: 'USDC',
    counterIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  },
  resolution = DEFAULT_RESOLUTION,
  timeRange,
  autoStream = false,
}: UseStellarChartProps): UseChartReturn {
  // Validate initial assetPair
  if (!assetPair || !assetPair.base || !assetPair.counter) {
    throw new Error('Invalid initial asset pair: base and counter are required');
  }
  if (assetPair.base !== 'XLM' && assetPair.base !== NATIVE_ASSET && !assetPair.baseIssuer) {
    throw new Error(`Issuer required for non-native base asset: ${assetPair.base}`);
  }
  if (
    assetPair.counter !== 'XLM' &&
    assetPair.counter !== NATIVE_ASSET &&
    !assetPair.counterIssuer
  ) {
    throw new Error(`Issuer required for non-native counter asset: ${assetPair.counter}`);
  }

  const [service] = useState(() => new StellarChartService(networkKey));
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);

  const [currentResolution, setCurrentResolution] = useState<ChartResolution>(resolution);
  const [currentTimeRange, setCurrentTimeRange] = useState<ChartTimeRange>(
    timeRange || {
      startTime: Date.now() - 86400000,
      endTime: Date.now(),
    }
  );
  const [currentAssetPair, setCurrentAssetPair] = useState<ChartAssetPair>(assetPair);

  const streamCloseRef = useRef<(() => void) | null>(null);
  const retryCountRef = useRef<number>(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isReconnectingRef = useRef<boolean>(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef<boolean>(true);
  const streamingRequestedRef = useRef<boolean>(false);

  const fetchData = useCallback(async () => {
    if (!currentAssetPair?.base || !currentAssetPair?.counter) {
      setError('Invalid asset pair configuration');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const chartData = await service.fetchTradeAggregations(currentAssetPair, currentTimeRange, {
        resolution: currentResolution,
      });

      if (mountedRef.current) {
        setData(chartData);
        setLastUpdate(Date.now());
      }
    } catch (err) {
      if (mountedRef.current) {
        const message = err instanceof Error ? err.message : 'Failed to fetch chart data';
        setError(message);
        console.error('Chart data fetch error:', err);
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [service, currentAssetPair, currentTimeRange, currentResolution]);

  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    setIsPolling(true);
    pollingIntervalRef.current = setInterval(() => {
      fetchData();
    }, 30000);
  }, [fetchData]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const stopStreaming = useCallback(() => {
    console.log('Stopping stream...');

    if (streamCloseRef.current) {
      streamCloseRef.current();
      streamCloseRef.current = null;
    }

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    setIsStreaming(false);
    retryCountRef.current = 0;
    isReconnectingRef.current = false;
    streamingRequestedRef.current = false;
  }, []);

  const startStreaming = useCallback(async () => {
    if (!currentAssetPair?.base || !currentAssetPair?.counter) {
      setError('Invalid asset pair configuration');
      return;
    }

    if (isReconnectingRef.current) {
      console.warn('Already reconnecting, skipping start');
      return;
    }

    if (streamCloseRef.current) {
      console.warn('Stream already active, skipping start');
      return;
    }

    console.log('Starting streaming for:', currentAssetPair);

    // Check for recent trades BEFORE attempting to stream
    try {
      const recentData = await service.fetchTradeAggregations(
        currentAssetPair,
        { startTime: Date.now() - 3600000, endTime: Date.now() },
        { resolution: currentResolution, limit: 1 }
      );

      if (recentData.length === 0) {
        console.warn('No recent trades found, using polling instead');
        setError(
          `No recent trades for ${currentAssetPair.base}/${currentAssetPair.counter}. Using polling.`
        );
        startPolling();
        return;
      }
    } catch (err) {
      console.error('Failed to check recent trades:', err);
      setError('Failed to verify trading activity. Using polling.');
      startPolling();
      return;
    }

    streamingRequestedRef.current = true;
    setIsStreaming(true);
    setError(null);
    stopPolling();

    const handleNewData = (newDataPoint: ChartDataPoint) => {
      if (!mountedRef.current) return;

      setData(prevData => {
        const exists = prevData.some(d => d.timestamp === newDataPoint.timestamp);

        if (exists) {
          return prevData.map(d => (d.timestamp === newDataPoint.timestamp ? newDataPoint : d));
        } else {
          const updated = [...prevData, newDataPoint].sort((a, b) => a.timestamp - b.timestamp);
          return updated.length > 500 ? updated.slice(-500) : updated;
        }
      });
      setLastUpdate(Date.now());
    };

    const handleStreamError = async (err: Error) => {
      if (!mountedRef.current || !streamingRequestedRef.current) return;

      console.error('Stream error:', err);

      if (isReconnectingRef.current) {
        console.warn('Already reconnecting');
        return;
      }

      // Check for 406 or no recent trades
      let hasRecentTrades = true;
      try {
        const recentData = await service.fetchTradeAggregations(
          currentAssetPair,
          { startTime: Date.now() - 3600000, endTime: Date.now() },
          { resolution: currentResolution, limit: 1 }
        );
        hasRecentTrades = recentData.length > 0;
      } catch (fetchErr) {
        console.error('Failed to check recent trades:', fetchErr);
        hasRecentTrades = false;
      }

      if (
        err.message.includes('406') ||
        err.message.includes('Not Acceptable') ||
        !hasRecentTrades
      ) {
        setError(
          `Streaming not supported for ${currentAssetPair.base}/${currentAssetPair.counter}. Using polling instead.`
        );
        stopStreaming();
        startPolling();
        return;
      }

      if (retryCountRef.current < STREAM_MAX_RETRIES) {
        retryCountRef.current++;
        const delay = STREAM_RECONNECT_DELAY * Math.pow(2, retryCountRef.current - 1);
        setError(
          `Connection lost. Retrying (${retryCountRef.current}/${STREAM_MAX_RETRIES}) in ${delay}ms...`
        );

        isReconnectingRef.current = true;

        if (streamCloseRef.current) {
          streamCloseRef.current();
          streamCloseRef.current = null;
        }

        retryTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current && streamingRequestedRef.current) {
            console.log(`Reconnect attempt ${retryCountRef.current}/${STREAM_MAX_RETRIES}`);
            isReconnectingRef.current = false;
            startStreamingInternal();
          }
        }, delay);
      } else {
        setError('Failed to maintain stream. Switching to polling.');
        stopStreaming();
        startPolling();
      }
    };

    const startStreamingInternal = () => {
      const options: ChartOptions = { resolution: currentResolution };

      service
        .streamTradeAggregations(currentAssetPair, options, handleNewData, handleStreamError)
        .then(closer => {
          if (mountedRef.current && streamingRequestedRef.current) {
            streamCloseRef.current = closer;
            retryCountRef.current = 0;
            console.log('Stream connected successfully');
          } else {
            closer();
          }
        })
        .catch(err => {
          console.error('Failed to start stream:', err);
          if (mountedRef.current) {
            setError(err instanceof Error ? err.message : 'Failed to start streaming');
            setIsStreaming(false);
            startPolling();
          }
        });
    };

    startStreamingInternal();
  }, [service, currentAssetPair, currentResolution, startPolling, stopPolling, stopStreaming]);

  const refreshData = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  const setResolution = useCallback((newResolution: ChartResolution) => {
    setCurrentResolution(newResolution);
  }, []);

  const setTimeRange = useCallback((range: ChartTimeRange) => {
    setCurrentTimeRange(range);
  }, []);

  const setAssetPair = useCallback((pair: ChartAssetPair) => {
    if (!pair?.base || !pair?.counter) {
      console.error('Invalid asset pair');
      setError('Invalid asset pair: base and counter are required');
      return;
    }
    if (pair.base !== 'XLM' && pair.base !== NATIVE_ASSET && !pair.baseIssuer) {
      setError(`Issuer required for non-native base asset: ${pair.base}`);
      return;
    }
    if (pair.counter !== 'XLM' && pair.counter !== NATIVE_ASSET && !pair.counterIssuer) {
      setError(`Issuer required for non-native counter asset: ${pair.counter}`);
      return;
    }
    setCurrentAssetPair(pair);
  }, []);

  // Sync prop changes
  useEffect(() => {
    if (assetPair?.base && assetPair?.counter) {
      const isDifferent =
        assetPair.base !== currentAssetPair.base ||
        assetPair.counter !== currentAssetPair.counter ||
        assetPair.baseIssuer !== currentAssetPair.baseIssuer ||
        assetPair.counterIssuer !== currentAssetPair.counterIssuer;

      if (isDifferent) {
        setAssetPair(assetPair);
      }
    }
  }, [assetPair, currentAssetPair, setAssetPair]);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [currentAssetPair, currentTimeRange, currentResolution]);

  // Handle streaming restart when config changes
  useEffect(() => {
    let timeout: NodeJS.Timeout | null = null;

    if (streamingRequestedRef.current && !isReconnectingRef.current) {
      console.log('Config changed, restarting stream');
      stopStreaming();

      timeout = setTimeout(() => {
        if (mountedRef.current && streamingRequestedRef.current) {
          startStreaming();
        }
      }, 500);
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [currentAssetPair, currentResolution, stopStreaming, startStreaming]);

  // Auto-start streaming
  useEffect(() => {
    let timeout: NodeJS.Timeout | null = null;

    if (autoStream && !isStreaming && !isPolling && !isReconnectingRef.current) {
      timeout = setTimeout(() => {
        if (mountedRef.current) {
          startStreaming();
        }
      }, 1000);
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [autoStream, isStreaming, isPolling, startStreaming]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      stopStreaming();
      stopPolling();
    };
  }, []);

  return {
    data,
    isLoading,
    error,
    isStreaming,
    lastUpdate,
    startStreaming,
    stopStreaming,
    refreshData,
    setResolution,
    setTimeRange,
    setAssetPair,
  };
}
