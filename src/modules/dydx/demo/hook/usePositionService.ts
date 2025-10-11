import { useCallback, useState } from 'react';

import { PositionService } from '../service/PositionService';
import { type Position } from '../types/types';
import { useDemoWallet } from './useDemoWallet';

interface PositionState {
  positions: Position[];
  isLoading: boolean;
  error: string | null;
}

export function usePositionService() {
  const { walletService, address } = useDemoWallet();
  const [state, setState] = useState<PositionState>({
    positions: [],
    isLoading: false,
    error: null,
  });
  const [positionService, setPositionService] = useState<PositionService | null>(null);

  const initializePositionService = useCallback(() => {
    if (walletService) {
      const indexerClient = walletService.getIndexerClient();
      if (indexerClient) {
        setPositionService(new PositionService({ indexerClient }));
      } else {
        setState(prev => ({
          ...prev,
          error: 'Indexer client not initialized',
        }));
      }
    } else {
      setState(prev => ({
        ...prev,
        error: 'Wallet service not initialized',
      }));
    }
  }, [walletService]);

  const fetchOpenPositions = useCallback(
    async (subaccountNumber: number = 0) => {
      if (!positionService || !address) {
        setState(prev => ({
          ...prev,
          error: 'Position service or wallet address not initialized',
        }));
        return;
      }

      setState(prev => ({ ...prev, isLoading: true, error: null }));

      try {
        const positions = await positionService.getOpenPositions(address, subaccountNumber);
        setState(prev => ({
          ...prev,
          positions,
          isLoading: false,
        }));
        return positions;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch positions';
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        console.error('Failed to fetch open positions:', error);
      }
    },
    [positionService, address]
  );

  const fetchPositionByMarket = useCallback(
    async (market: string, subaccountNumber: number = 0) => {
      if (!positionService || !address) {
        setState(prev => ({
          ...prev,
          error: 'Position service or wallet address not initialized',
        }));
        return null;
      }

      setState(prev => ({ ...prev, isLoading: true, error: null }));

      try {
        const position = await positionService.getPositionByMarket(
          address,
          subaccountNumber,
          market
        );
        setState(prev => ({
          ...prev,
          isLoading: false,
        }));
        return position;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch position';
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        console.error('Failed to fetch position by market:', error);
        return null;
      }
    },
    [positionService, address]
  );

  return {
    ...state,
    positionService,
    initializePositionService,
    fetchOpenPositions,
    fetchPositionByMarket,
  };
}
