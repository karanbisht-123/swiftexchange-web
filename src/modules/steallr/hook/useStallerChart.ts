import { useCallback, useEffect, useRef, useState } from 'react';

import { getStellarConfig } from '../../walletconnect/config/chains';
import { StellarChartService } from '../service/stellarChartService';
import type {
  ChartAssetPair,
  ChartDataPoint,
  ChartOptions,
  ChartResolution,
  ChartTimeRange,
  UseChartReturn,
} from '../types/stellarChart.types';

const DEFAULT_RESOLUTION = 900000;
const STREAM_MAX_RETRIES = 3;
const STREAM_RECONNECT_DELAY = 2000;
const POLLING_INTERVAL = 30000;

interface UseStellarChartProps {
  assetPair?: ChartAssetPair;
  resolution?: ChartResolution;
  timeRange?: ChartTimeRange;
  autoStream?: boolean;
}

export function useStellarChart({
  assetPair,
  resolution = DEFAULT_RESOLUTION,
  timeRange,
  autoStream = false,
}: UseStellarChartProps = {}): UseChartReturn {
  const [service, setService] = useState<StellarChartService | null>(null);
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [currentNetwork, setCurrentNetwork] = useState<string>('testnet');

  const [currentResolution, setCurrentResolution] = useState<ChartResolution>(resolution);
  const [currentTimeRange, setCurrentTimeRange] = useState<ChartTimeRange>(
    timeRange || {
      startTime: Date.now() - 86400000,
      endTime: Date.now(),
    }
  );
  const [currentAssetPair, setCurrentAssetPair] = useState<ChartAssetPair | null>(
    assetPair || null
  );

  const streamCloseRef = useRef<(() => void) | null>(null);
  const retryCountRef = useRef<number>(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isReconnectingRef = useRef<boolean>(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef<boolean>(true);
  const streamingRequestedRef = useRef<boolean>(false);

  // Initialize service with WalletConnect config
  useEffect(() => {
    try {
      const config = getStellarConfig();
      const chartService = new StellarChartService(
        config.horizonUrl,
        config.networkPassphrase,
        config.chainId
      );
      setService(chartService);

      // Determine network type
      const network = config.networkPassphrase.includes('Public Global Stellar Network')
        ? 'mainnet'
        : 'testnet';
      setCurrentNetwork(network);

      // Set default asset pair for the network
      if (!assetPair) {
        if (network === 'mainnet') {
          setCurrentAssetPair({
            base: 'XLM',
            counter: 'USDC',
            counterIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
          });
        } else {
          setCurrentAssetPair({
            base: 'XLM',
            counter: 'USDC',
            counterIssuer: 'GAHPYWLK6YRN7CVYZOO4H3VDRZ7PVF5UJGLZCSPAEIKJE2XSWF5LAGER',
          });
        }
      }
    } catch (err) {
      console.error('Failed to initialize chart service:', err);
      setError('Failed to connect to Stellar network');
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!service || !currentAssetPair?.base || !currentAssetPair?.counter) {
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
    }, POLLING_INTERVAL);
  }, [fetchData]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const stopStreaming = useCallback(() => {
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
    if (!service || !currentAssetPair?.base || !currentAssetPair?.counter) {
      setError('Invalid asset pair configuration');
      return;
    }

    if (isReconnectingRef.current || streamCloseRef.current) {
      return;
    }

    // Check for recent trades before streaming
    try {
      const recentData = await service.fetchTradeAggregations(
        currentAssetPair,
        { startTime: Date.now() - 3600000, endTime: Date.now() },
        { resolution: currentResolution, limit: 1 }
      );

      if (recentData.length === 0) {
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
      if (!mountedRef.current || !streamingRequestedRef.current || isReconnectingRef.current) {
        return;
      }

      console.error('Stream error:', err);

      if (err.message.includes('406') || err.message.includes('No recent trades')) {
        setError(
          `Streaming not available for ${currentAssetPair.base}/${currentAssetPair.counter}. Using polling.`
        );
        stopStreaming();
        startPolling();
        return;
      }

      if (retryCountRef.current < STREAM_MAX_RETRIES) {
        retryCountRef.current++;
        const delay = STREAM_RECONNECT_DELAY * Math.pow(2, retryCountRef.current - 1);
        setError(`Connection lost. Retrying (${retryCountRef.current}/${STREAM_MAX_RETRIES})...`);

        isReconnectingRef.current = true;

        if (streamCloseRef.current) {
          streamCloseRef.current();
          streamCloseRef.current = null;
        }

        retryTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current && streamingRequestedRef.current) {
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
    if (pair.base !== 'XLM' && pair.base !== 'native' && !pair.baseIssuer) {
      setError(`Issuer required for non-native base asset: ${pair.base}`);
      return;
    }
    if (pair.counter !== 'XLM' && pair.counter !== 'native' && !pair.counterIssuer) {
      setError(`Issuer required for non-native counter asset: ${pair.counter}`);
      return;
    }
    setCurrentAssetPair(pair);
  }, []);

  useEffect(() => {
    if (currentAssetPair) {
      fetchData();
    }
  }, [currentAssetPair, currentTimeRange, currentResolution]);

  useEffect(() => {
    if (streamingRequestedRef.current && !isReconnectingRef.current) {
      stopStreaming();
      const timeout = setTimeout(() => {
        if (mountedRef.current && streamingRequestedRef.current) {
          startStreaming();
        }
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [currentAssetPair, currentResolution, stopStreaming, startStreaming]);

  useEffect(() => {
    if (
      autoStream &&
      !isStreaming &&
      !isPolling &&
      !isReconnectingRef.current &&
      currentAssetPair
    ) {
      const timeout = setTimeout(() => {
        if (mountedRef.current) {
          startStreaming();
        }
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [autoStream, isStreaming, isPolling, currentAssetPair, startStreaming]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopStreaming();
      stopPolling();
    };
  }, [stopStreaming, stopPolling]);

  return {
    data,
    isLoading,
    error,
    isStreaming,
    lastUpdate,
    currentNetwork,
    currentAssetPair,
    startStreaming,
    stopStreaming,
    refreshData,
    setResolution,
    setTimeRange,
    setAssetPair,
  };
}
