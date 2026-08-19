import { useState, useCallback } from 'react';
import type { Signer } from 'ethers';
import { useOrders } from './useOrders';

export function usePositionActions(signer: Signer | null, userAddr: string | null) {
  const [isProcessing, setIsProcessing] = useState(false);
  const { place } = useOrders(signer, userAddr);

  const closePosition = useCallback(async (symbol: string, size: string, isLong: boolean) => {
    if (!signer || isProcessing) return false;
    
    setIsProcessing(true);
    try {
      await place({
        symbol: symbol.replace('-', ''),
        side: isLong ? 'SELL' : 'BUY',
        type: 'MARKET',
        quantity: String(Math.abs(parseFloat(size))),
        reduceOnly: true,
      });
      return true;
    } catch (e) {
      console.error('Failed to close position:', e);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [signer, isProcessing, place]);

  const reversePosition = useCallback(async (symbol: string, size: string, isLong: boolean) => {
    if (!signer || isProcessing) return false;

    setIsProcessing(true);
    try {
      const cleanSymbol = symbol.replace('-', '');
      const side = isLong ? 'SELL' : 'BUY';
      const absSize = String(Math.abs(parseFloat(size)));

      // Step 1: Close current position (reduceOnly)
      await place({
        symbol: cleanSymbol,
        side,
        type: 'MARKET',
        quantity: absSize,
        reduceOnly: true,
      });

      // Step 2: Open new position in opposite direction
      await place({
        symbol: cleanSymbol,
        side,
        type: 'MARKET',
        quantity: absSize,
        reduceOnly: false,
      });

      return true;
    } catch (e) {
      console.error('Failed to reverse position:', e);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [signer, isProcessing, place]);

  return {
    isProcessing,
    closePosition,
    reversePosition,
  };
}
