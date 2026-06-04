import { useCallback, useEffect, useRef, useState } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { getStellarConfig } from '../../walletconnect/config/chains';
import { StellarChartService } from '../service/stellarChartService';
import {
  BinanceBridgeService,
  isBinanceSupported,
  isFlippedPair,
  getBinanceSymbol,
  getBinanceInterval,
} from '../service/binanceBridgeService';
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

const globalChartCache = new Map<string, ChartDataPoint[]>();

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
  const [service, setService] = useState<StellarChartService | null>(null);
  const cacheKey = getCacheKey(assetPair || null, resolution);
  const [data, setData] = useState<ChartDataPoint[]>(globalChartCache.get(cacheKey) || []);
  const [isLoading, setIsLoading] = useState<boolean>(!globalChartCache.has(cacheKey));
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);

  // Retrieve current Stellar configuration and network state from the central store
  const network = useWalletStore(state => state.network);
  const currentStellarConfig = getStellarConfig(network);
  const initialNetwork = useWalletStore.getState().network;

  // Initialize currentNetwork with the store's initial network state
  const [currentNetwork, setCurrentNetwork] = useState<NetworkType>(initialNetwork);

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

  const [binanceActive, setBinanceActive] = useState(() =>
    currentAssetPair ? isBinanceSupported(currentAssetPair.base, currentAssetPair.counter) : false
  );

  useEffect(() => {
    setBinanceActive(
      currentAssetPair ? isBinanceSupported(currentAssetPair.base, currentAssetPair.counter) : false
    );
  }, [currentAssetPair?.base, currentAssetPair?.counter]);

  useEffect(() => {
    const handleFallback = () => {
      setBinanceActive(false);
    };
    window.addEventListener('binance:connection-failed', handleFallback);
    return () => window.removeEventListener('binance:connection-failed', handleFallback);
  }, []);

  useEffect(() => {
    const config = currentStellarConfig;
    const actualNetwork: NetworkType = config.network === 'PUBLIC' ? 'mainnet' : 'testnet';

    try {
      const chartService = new StellarChartService(
        config.horizonUrl,
        config.networkPassphrase,
        config.chainId
      );
      setService(chartService);
      setCurrentNetwork(actualNetwork);

      if (!assetPair) {
        if (actualNetwork === 'mainnet') {
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
  }, [currentStellarConfig, assetPair]);

  const fetchData = useCallback(async (isBackground = false) => {
    if (!currentAssetPair?.base || !currentAssetPair?.counter) {
      setError('Invalid asset pair configuration');
      return;
    }

    if (!isBackground) setIsLoading(true);
    if (!isBackground) setError(null);

    try {
      const base = currentAssetPair.base;
      const counter = currentAssetPair.counter;

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
          if (key) globalChartCache.set(key, chartData);
        }
      } else {
        if (!service) {
          setError('Invalid asset pair configuration');
          return;
        }

        const chartData = await service.fetchTradeAggregations(currentAssetPair, currentTimeRange, {
          resolution: currentResolution,
        });

        if (mountedRef.current) {
          setData(chartData);
          setLastUpdate(Date.now());
          const key = getCacheKey(currentAssetPair, currentResolution);
          if (key) globalChartCache.set(key, chartData);
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
  }, [service, currentAssetPair, currentTimeRange, currentResolution, binanceActive]);

  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
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

    const base = currentAssetPair.base;
    const counter = currentAssetPair.counter;

    const symbol = getBinanceSymbol(base, counter);

    if (binanceActive && typeof symbol === 'string') {
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

      const handleStreamError = (err: any) => {
        console.error('Binance chart stream error:', err);
      };

      try {
        const isFlipped = isFlippedPair(base, counter);
        const binanceInterval = getBinanceInterval(currentResolution);

        const closer = BinanceBridgeService.streamTradeAggregations(
          symbol,
          isFlipped,
          binanceInterval,
          handleNewData,
          handleStreamError
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
      if (!service) return;

      try {
        const recentData = await service.fetchTradeAggregations(
          currentAssetPair,
          { startTime: Date.now() - Math.max(3600000, currentResolution * 2), endTime: Date.now() },
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
    }
  }, [service, currentAssetPair, currentResolution, startPolling, stopPolling, stopStreaming, binanceActive]);

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
    // Stellar specific validation logic: only 'XLM' or 'native' are allowed without an issuer
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
    setCurrentAssetPair(pair);
  }, []);

  useEffect(() => {
    // 1. Fetch historical data on parameter change
    if (currentAssetPair) {
      fetchData();
    }
    // 2. Stop streaming if parameters change
    stopStreaming();
  }, [currentAssetPair, currentTimeRange, currentResolution, fetchData, stopStreaming]);

  useEffect(() => {
    // Restart streaming if streaming was previously requested and parameters change
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
    // Auto-stream start logic
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
