import { beforeEach, describe, expect, it } from 'vitest';

import { useAmmSwapStore } from '../ammSwapStore';

describe('ammSwapStore', () => {
  beforeEach(() => {
    useAmmSwapStore.setState({
      transactions: [],
      favorites: [],
      defaultSlippage: 1,
      expertMode: false,
      selectedChartPair: {
        base: 'XLM',
        counter: 'USDC',
        baseIssuer: undefined,
        counterIssuer: 'GBBD47R2LWK7P7TV222OISDOK6V2QQQSK37Q7VURB6L74QVN56AGEBI5',
      },
      preSelectedToken: null,
    });
  });

  const mockToken = {
    code: 'USDC',
    issuer: 'GIssuer',
    balance: '100',
    icon: 'usdc.png',
  };

  describe('addTransaction & updateTransaction & clearHistory', () => {
    it('manages transaction lists in state', () => {
      const store = useAmmSwapStore.getState();
      store.addTransaction({ id: 'tx1', status: 'pending' });

      expect(useAmmSwapStore.getState().transactions).toEqual([{ id: 'tx1', status: 'pending' }]);

      store.updateTransaction('tx1', { status: 'success' });
      expect(useAmmSwapStore.getState().transactions[0].status).toBe('success');

      store.clearHistory();
      expect(useAmmSwapStore.getState().transactions).toEqual([]);
    });
  });

  describe('addFavorite & removeFavorite', () => {
    it('manages token favorites in state without duplicates', () => {
      const store = useAmmSwapStore.getState();
      store.addFavorite(mockToken as any);

      expect(useAmmSwapStore.getState().favorites).toEqual([mockToken]);

      // Add again (no duplicates allowed)
      store.addFavorite(mockToken as any);
      expect(useAmmSwapStore.getState().favorites.length).toBe(1);

      store.removeFavorite('USDC');
      expect(useAmmSwapStore.getState().favorites).toEqual([]);
    });
  });

  describe('setters', () => {
    it('updates slippage, expertMode, chart pair, and preSelectedToken properties', () => {
      const store = useAmmSwapStore.getState();

      store.setDefaultSlippage(2.5);
      expect(useAmmSwapStore.getState().defaultSlippage).toBe(2.5);

      store.setExpertMode(true);
      expect(useAmmSwapStore.getState().expertMode).toBe(true);

      const pair = { base: 'XLM', counter: 'EURT' };
      store.setSelectedChartPair(pair);
      expect(useAmmSwapStore.getState().selectedChartPair).toEqual(pair);

      store.setPreSelectedToken({ code: 'USDC' });
      expect(useAmmSwapStore.getState().preSelectedToken).toEqual({ code: 'USDC' });
    });
  });
});
