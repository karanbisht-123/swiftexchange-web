import { beforeEach, describe, expect, it } from 'vitest';

import { useLargeOrderStore } from '../orderBookSwapStore';

describe('orderBookSwapStore', () => {
  beforeEach(() => {
    useLargeOrderStore.setState({
      transactions: [],
      favorites: [],
      defaultSlippage: 1,
      expertMode: false,
    });
  });

  const mockToken = {
    code: 'USDC',
    issuer: 'GIssuer',
    balance: '100',
    icon: 'usdc.png',
  };

  describe('addTransaction & updateTransaction & clearHistory', () => {
    it('manages large order transaction lists in state', () => {
      const store = useLargeOrderStore.getState();
      store.addTransaction({ id: 'tx1', status: 'pending' } as any);

      expect(useLargeOrderStore.getState().transactions).toEqual([
        { id: 'tx1', status: 'pending' },
      ]);

      store.updateTransaction('tx1', { status: 'filled' } as any);
      expect(useLargeOrderStore.getState().transactions[0].status).toBe('filled');

      store.clearHistory();
      expect(useLargeOrderStore.getState().transactions).toEqual([]);
    });
  });

  describe('addFavorite & removeFavorite', () => {
    it('manages token favorites in state without duplicates', () => {
      const store = useLargeOrderStore.getState();
      store.addFavorite(mockToken as any);

      expect(useLargeOrderStore.getState().favorites).toEqual([mockToken]);

      // Add again (no duplicates allowed)
      store.addFavorite(mockToken as any);
      expect(useLargeOrderStore.getState().favorites.length).toBe(1);

      store.removeFavorite('USDC');
      expect(useLargeOrderStore.getState().favorites).toEqual([]);
    });
  });

  describe('setters', () => {
    it('updates slippage and expertMode properties', () => {
      const store = useLargeOrderStore.getState();

      store.setDefaultSlippage(2.5);
      expect(useLargeOrderStore.getState().defaultSlippage).toBe(2.5);

      store.setExpertMode(true);
      expect(useLargeOrderStore.getState().expertMode).toBe(true);
    });
  });
});
