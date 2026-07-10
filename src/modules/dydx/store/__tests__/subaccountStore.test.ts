import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dydxWalletService } from '../../service/dydxWalletService';
import type { MarginMode } from '../../types/trading.types';
import {
  getSubaccountBalance,
  selectActiveSubaccount,
  selectIsTransferring,
  selectIsolatedMarket,
  selectMarginMode,
  useSubaccountStore,
} from '../subaccountStore';

vi.mock('../../service/dydxWalletService', () => ({
  dydxWalletService: {
    setActiveSubaccount: vi.fn(),
    resetToDefaultSubaccount: vi.fn(),
  },
}));

describe('subaccountStore', () => {
  beforeEach(() => {
    useSubaccountStore.setState({
      selectedMarginMode: 'CROSS' as MarginMode,
      activeSubaccountNumber: 0,
      isolatedMarket: null,
      isTransferring: false,
      transferError: null,
    });
    vi.clearAllMocks();
  });

  describe('setMarginMode', () => {
    it('sets CROSS mode and sets active subaccount to 0 using walletService', () => {
      const store = useSubaccountStore.getState();
      store.setMarginMode('CROSS');

      expect(useSubaccountStore.getState().selectedMarginMode).toBe('CROSS');
      expect(useSubaccountStore.getState().activeSubaccountNumber).toBe(0);
      expect(useSubaccountStore.getState().isolatedMarket).toBeNull();
      expect(dydxWalletService.setActiveSubaccount).toHaveBeenCalledWith(0);
    });

    it('sets ISOLATED mode with market and does not invoke walletService setActiveSubaccount', () => {
      const store = useSubaccountStore.getState();
      store.setMarginMode('ISOLATED', 'BTC-USD');

      expect(useSubaccountStore.getState().selectedMarginMode).toBe('ISOLATED');
      expect(useSubaccountStore.getState().isolatedMarket).toBe('BTC-USD');
      expect(dydxWalletService.setActiveSubaccount).not.toHaveBeenCalled();
    });
  });

  describe('setActiveSubaccount', () => {
    it('ignores invalid subaccount numbers', () => {
      const store = useSubaccountStore.getState();
      store.setActiveSubaccount(-1);
      expect(useSubaccountStore.getState().activeSubaccountNumber).toBe(0);

      store.setActiveSubaccount(200000);
      expect(useSubaccountStore.getState().activeSubaccountNumber).toBe(0);
      expect(dydxWalletService.setActiveSubaccount).not.toHaveBeenCalled();
    });

    it('derives correct marginMode based on ISOLATED_START boundary', () => {
      const store = useSubaccountStore.getState();

      // < 128 -> CROSS
      store.setActiveSubaccount(10);
      expect(useSubaccountStore.getState().selectedMarginMode).toBe('CROSS');
      expect(dydxWalletService.setActiveSubaccount).toHaveBeenCalledWith(10);

      // >= 128 -> ISOLATED
      store.setActiveSubaccount(128);
      expect(useSubaccountStore.getState().selectedMarginMode).toBe('ISOLATED');
      expect(dydxWalletService.setActiveSubaccount).toHaveBeenCalledWith(128);
    });
  });

  describe('reset', () => {
    it('calls resetToDefaultSubaccount on walletService and resets store state', () => {
      useSubaccountStore.setState({
        selectedMarginMode: 'ISOLATED',
        activeSubaccountNumber: 128,
        isolatedMarket: 'ETH-USD',
        isTransferring: true,
      });

      const store = useSubaccountStore.getState();
      store.reset();

      expect(dydxWalletService.resetToDefaultSubaccount).toHaveBeenCalledTimes(1);
      const state = useSubaccountStore.getState();
      expect(state.selectedMarginMode).toBe('CROSS');
      expect(state.activeSubaccountNumber).toBe(0);
      expect(state.isolatedMarket).toBeNull();
      expect(state.isTransferring).toBe(false);
    });
  });

  describe('getSubaccountBalance', () => {
    const childSubaccounts = [
      {
        subaccountNumber: 0,
        equity: '1000',
        freeCollateral: '900',
        openPerpetualPositions: {
          'BTC-USD': {},
        },
      },
    ];

    it('returns null if subaccount is not found', () => {
      expect(getSubaccountBalance(1, childSubaccounts)).toBeNull();
    });

    it('derives balance details correctly', () => {
      const bal = getSubaccountBalance(0, childSubaccounts);
      expect(bal).not.toBeNull();
      expect(bal!.subaccountNumber).toBe(0);
      expect(bal!.marginMode).toBe('CROSS');
      expect(bal!.equity).toBe('1000');
      expect(bal!.freeCollateral).toBe('900');
      expect(bal!.market).toBe('BTC-USD');
      expect(bal!.hasOpenPosition).toBe(true);
    });
  });

  describe('Selectors', () => {
    it('should correctly select parts of state', () => {
      const state = useSubaccountStore.getState();
      expect(selectMarginMode(state)).toBe('CROSS');
      expect(selectActiveSubaccount(state)).toBe(0);
      expect(selectIsolatedMarket(state)).toBeNull();
      expect(selectIsTransferring(state)).toBe(false);
    });
  });
});
