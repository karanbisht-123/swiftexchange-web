import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getStellarConfig } from '../../walletconnect/config/chains';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import {
  BinanceBridgeService,
  getBinanceInterval,
  getBinanceSymbol,
  isBinanceSupported,
  isFlippedPair,
} from '../service/binanceBridgeService';
import { StellarChartService } from '../service/stellarChartService';
import type {
  ChartAssetPair,
  ChartDataPoint,
  ChartOptions,
  ChartResolution,
  ChartTimeRange,
  UseChartReturn,
} from '../types/stellarChart.types';

type NetworkType = 'mainnet' | 'testnet';

const DEFAULT_RESOLUTION = 900000;
const STREAM_MAX_RETRIES = 3;
const STREAM_RECONNECT_DELAY = 2000;
const POLLING_INTERVAL = 30000;
const MAX_DATA_POINTS = 500;

const globalChartCache = new Map<string, { data: ChartDataPoint[]; timestamp: number }>();

const getCached = (key: string): ChartDataPoint[] | null => {
  const entry = globalChartCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > 120000) {
    globalChartCache.delete(key);
    return null;
  }
  return entry.data;
};

const getCacheKey = (pair: ChartAssetPair | null, resolution: ChartResolution) => {
  if (!pair) return '';
  return `${pair.base}-${pair.baseIssuer || ''}-${pair.counter}-${pair.counterIssuer || ''}-${resolution}`;
};

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
  const currentNetwork = useWalletStore(state => state.network) as NetworkType;
  const currentStellarConfig = useMemo(() => getStellarConfig(currentNetwork), [currentNetwork]);

  const serviceRef = useRef<StellarChartService | null>(null);
  const [currentResolution, setCurrentResolution] = useState<ChartResolution>(resolution);
  const [currentTimeRange, setCurrentTimeRange] = useState<ChartTimeRange>(
    timeRange || { startTime: Date.now() - 86400000, endTime: Date.now() }
  );

  const currentResolutionRef = useRef(currentResolution);
  useEffect(() => {
    currentResolutionRef.current = currentResolution;
  }, [currentResolution]);

  const getDefaultAssetPair = useCallback((net: NetworkType): ChartAssetPair => {
    return net === 'mainnet'
      ? {
          base: 'XLM',
          counter: 'USDC',
          counterIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        }
      : {
          base: 'XLM',
          counter: 'USDC',
          counterIssuer: 'GAHPYWLK6YRN7CVYZOO4H3VDRZ7PVF5UJGLZCSPAEIKJE2XSWF5LAGER',
        };
  }, []);

  const [currentAssetPair, setCurrentAssetPair] = useState<ChartAssetPair | null>(
    assetPair || getDefaultAssetPair(currentNetwork)
  );

  const cacheKey = getCacheKey(currentAssetPair, currentResolution);
  const cachedData = getCached(cacheKey);
  const [data, setData] = useState<ChartDataPoint[]>(cachedData || []);
  const [isLoading, setIsLoading] = useState<boolean>(!cachedData);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);

  const [binanceActive, setBinanceActive] = useState(() =>
    currentAssetPair ? isBinanceSupported(currentAssetPair.base, currentAssetPair.counter) : false
  );

  const streamCloseRef = useRef<(() => void) | null>(null);
  const retryCountRef = useRef<number>(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isReconnectingRef = useRef<boolean>(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef<boolean>(true);
  const streamingRequestedRef = useRef<boolean>(false);

  // Initialize Service and update default pair if network changes
  useEffect(() => {
    try {
      const chartService = new StellarChartService(
        currentStellarConfig.horizonUrl,
        currentStellarConfig.networkPassphrase,
        currentStellarConfig.chainId
      );
      serviceRef.current = chartService;

      if (!assetPair) {
        setCurrentAssetPair(getDefaultAssetPair(currentNetwork));
      }
    } catch (err) {
      console.error('Failed to initialize chart service:', err);
      setError('Failed to connect to Stellar network');
    }
  }, [currentStellarConfig, currentNetwork, assetPair, getDefaultAssetPair]);

  useEffect(() => {
    if (currentAssetPair) {
      setBinanceActive(isBinanceSupported(currentAssetPair.base, currentAssetPair.counter));
    }
  }, [currentAssetPair]);

  useEffect(() => {
    const handleFallback = () => setBinanceActive(false);
    window.addEventListener('binance:connection-failed', handleFallback);
    return () => window.removeEventListener('binance:connection-failed', handleFallback);
  }, []);

  const handleNewData = useCallback((newDataPoint: ChartDataPoint) => {
    if (!mountedRef.current) return;

    setData(prevData => {
      const exists = prevData.some(d => d.timestamp === newDataPoint.timestamp);
      if (exists) {
        return prevData.map(d => (d.timestamp === newDataPoint.timestamp ? newDataPoint : d));
      } else {
        const updated = [...prevData, newDataPoint].sort((a, b) => a.timestamp - b.timestamp);
        return updated.length > MAX_DATA_POINTS ? updated.slice(-MAX_DATA_POINTS) : updated;
      }
    });
    setLastUpdate(Date.now());
  }, []);

  const fetchData = useCallback(
    async (isBackground = false) => {
      if (!currentAssetPair?.base || !currentAssetPair?.counter) {
        setError('Invalid asset pair configuration');
        return;
      }

      if (!isBackground) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const { base, counter } = currentAssetPair;
        const symbol = getBinanceSymbol(base, counter);

        if (binanceActive && symbol) {
          const isFlipped = isFlippedPair(base, counter);
          const binanceInterval = getBinanceInterval(currentResolution);

          const chartData = await BinanceBridgeService.fetchTradeAggregations(
            symbol,
            isFlipped,
            binanceInterval,
            200
          );

          if (mountedRef.current) {
            setData(chartData);
            setLastUpdate(Date.now());
            const key = getCacheKey(currentAssetPair, currentResolution);
            if (key) globalChartCache.set(key, { data: chartData, timestamp: Date.now() });
          }
        } else {
          const activeService = serviceRef.current;
          if (!activeService) {
            setError('Chart service not initialized');
            return;
          }

          const chartData = await activeService.fetchTradeAggregations(
            currentAssetPair,
            currentTimeRange,
            {
              resolution: currentResolution,
            }
          );

          if (mountedRef.current) {
            setData(chartData);
            setLastUpdate(Date.now());
            const key = getCacheKey(currentAssetPair, currentResolution);
            if (key) globalChartCache.set(key, { data: chartData, timestamp: Date.now() });
          }
        }
      } catch (err) {
        if (mountedRef.current) {
          const message = err instanceof Error ? err.message : 'Failed to fetch chart data';
          setError(message);
          console.error('Chart data fetch error:', err);
        }
      } finally {
        if (mountedRef.current && !isBackground) {
          setIsLoading(false);
        }
      }
    },
    [currentAssetPair, currentTimeRange, currentResolution, binanceActive]
  );

  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

    setIsPolling(true);
    pollingIntervalRef.current = setInterval(() => {
      fetchData(true);
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
    if (!currentAssetPair?.base || !currentAssetPair?.counter) {
      setError('Invalid asset pair configuration');
      return;
    }

    if (isReconnectingRef.current || streamCloseRef.current) {
      return;
    }

    const { base, counter } = currentAssetPair;
    const symbol = getBinanceSymbol(base, counter);

    streamingRequestedRef.current = true;
    setError(null);
    stopPolling();

    if (binanceActive && typeof symbol === 'string') {
      setIsStreaming(true);

      try {
        const isFlipped = isFlippedPair(base, counter);
        const binanceInterval = getBinanceInterval(currentResolution);

        const closer = BinanceBridgeService.streamTradeAggregations(
          symbol,
          isFlipped,
          binanceInterval,
          handleNewData,
          (err: any) => console.error('Binance chart stream error:', err)
        );

        if (mountedRef.current && streamingRequestedRef.current) {
          streamCloseRef.current = closer;
          retryCountRef.current = 0;
        } else {
          closer();
        }
      } catch (err) {
        console.error('Failed to start Binance chart stream:', err);
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to start streaming');
          setIsStreaming(false);
          startPolling();
        }
      }
    } else {
      const activeService = serviceRef.current;
      if (!activeService) return;

      setIsStreaming(true);

      const startStreamingInternal = () => {
        const options: ChartOptions = { resolution: currentResolutionRef.current };

        const handleStreamError = async (err: Error) => {
          if (!mountedRef.current || !streamingRequestedRef.current || isReconnectingRef.current) {
            return;
          }

          console.error('Stream error:', err);

          if (err.message.includes('406') || err.message.includes('No recent trades')) {
            setError(`Streaming not available for ${base}/${counter}. Using polling.`);
            stopStreaming();
            startPolling();
            return;
          }

          if (retryCountRef.current < STREAM_MAX_RETRIES) {
            retryCountRef.current++;
            const delay = STREAM_RECONNECT_DELAY * Math.pow(2, retryCountRef.current - 1);
            setError(
              `Connection lost. Retrying (${retryCountRef.current}/${STREAM_MAX_RETRIES})...`
            );

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

        activeService
          .pollTradeAggregations(currentAssetPair, options, handleNewData, handleStreamError)
          .then(closer => {
            if (mountedRef.current && streamingRequestedRef.current) {
              streamCloseRef.current = closer;
              retryCountRef.current = 0;
            } else {
              closer();
            }
          })
          .catch(err => {
            console.error('Failed to start poll:', err);
            if (mountedRef.current) {
              setError(err instanceof Error ? err.message : 'Failed to start polling');
              setIsStreaming(false);
              startPolling();
            }
          });
      };

      startStreamingInternal();
    }
  }, [
    currentAssetPair,
    currentResolution,
    binanceActive,
    handleNewData,
    startPolling,
    stopPolling,
    stopStreaming,
  ]);

  // Effects for handling lifecycle and parameter changes
  useEffect(() => {
    if (currentAssetPair) {
      fetchData();
    }
  }, [fetchData]);

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
  }, [currentAssetPair, currentResolution, startStreaming, stopStreaming]);

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

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopStreaming();
      stopPolling();
    };
  }, [stopStreaming, stopPolling]);

  // Public actions
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

    const isBaseNative = pair.base.toLowerCase() === 'xlm' || pair.base.toLowerCase() === 'native';
    const isCounterNative =
      pair.counter.toLowerCase() === 'xlm' || pair.counter.toLowerCase() === 'native';

    if (!isBaseNative && !pair.baseIssuer) {
      setError(`Issuer required for non-native base asset: ${pair.base}`);
      return;
    }
    if (!isCounterNative && !pair.counterIssuer) {
      setError(`Issuer required for non-native counter asset: ${pair.counter}`);
      return;
    }

    setError(null);
    setCurrentAssetPair(pair);
  }, []);

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
