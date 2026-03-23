import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { dydxWalletService } from '../service/dydxWalletService';
import {
  type MarginMode,
  SUBACCOUNT_CONSTANTS,
  type SubaccountBalance,
} from '../types/trading.types';

interface SubaccountState {
  selectedMarginMode: MarginMode;
  activeSubaccountNumber: number;
  isolatedMarket: string | null;
  isTransferring: boolean;
  transferError: string | null;
  setMarginMode: (mode: MarginMode, market?: string) => void;
  setActiveSubaccount: (subaccountNumber: number) => void;
  setIsolatedMarket: (market: string | null) => void;
  setTransferring: (isTransferring: boolean) => void;
  setTransferError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  selectedMarginMode: 'CROSS' as MarginMode,
  activeSubaccountNumber: SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT,
  isolatedMarket: null as string | null,
  isTransferring: false,
  transferError: null as string | null,
};

export const useSubaccountStore = create<SubaccountState>()(
  subscribeWithSelector((set, _get) => ({
    ...initialState,

    setMarginMode: (mode: MarginMode, market?: string) => {
      if (mode === 'CROSS') {
        dydxWalletService.setActiveSubaccount(SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT);
        set({
          selectedMarginMode: 'CROSS',
          activeSubaccountNumber: SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT,
          isolatedMarket: null,
        });
      } else {
        set({
          selectedMarginMode: 'ISOLATED',
          isolatedMarket: market || null,
        });
      }
    },

    setActiveSubaccount: (subaccountNumber: number) => {
      if (subaccountNumber < 0 || subaccountNumber > SUBACCOUNT_CONSTANTS.ISOLATED_END) {
        return;
      }

      const marginMode: MarginMode =
        subaccountNumber >= SUBACCOUNT_CONSTANTS.ISOLATED_START ? 'ISOLATED' : 'CROSS';

      dydxWalletService.setActiveSubaccount(subaccountNumber);

      set({
        activeSubaccountNumber: subaccountNumber,
        selectedMarginMode: marginMode,
      });
    },

    setIsolatedMarket: (market: string | null) => {
      set({ isolatedMarket: market });
    },

    setTransferring: (isTransferring: boolean) => {
      set({ isTransferring });
    },

    setTransferError: (error: string | null) => {
      set({ transferError: error });
    },

    reset: () => {
      dydxWalletService.resetToDefaultSubaccount();
      set(initialState);
    },
  }))
);

export const selectMarginMode = (state: SubaccountState) => state.selectedMarginMode;
export const selectActiveSubaccount = (state: SubaccountState) => state.activeSubaccountNumber;
export const selectIsolatedMarket = (state: SubaccountState) => state.isolatedMarket;
export const selectIsTransferring = (state: SubaccountState) => state.isTransferring;

export const selectIsIsolatedMode = (state: SubaccountState) =>
  state.selectedMarginMode === 'ISOLATED';

export const getSubaccountBalance = (
  subaccountNumber: number,
  childSubaccounts: Array<{
    subaccountNumber: number;
    equity: string;
    freeCollateral: string;
    openPerpetualPositions: Record<string, any>;
  }>
): SubaccountBalance | null => {
  const subaccount = childSubaccounts.find(c => c.subaccountNumber === subaccountNumber);

  if (!subaccount) return null;

  const markets = Object.keys(subaccount.openPerpetualPositions || {});

  return {
    subaccountNumber,
    marginMode: subaccountNumber >= SUBACCOUNT_CONSTANTS.ISOLATED_START ? 'ISOLATED' : 'CROSS',
    equity: subaccount.equity,
    freeCollateral: subaccount.freeCollateral,
    market: markets.length > 0 ? markets[0] : undefined,
    hasOpenPosition: markets.length > 0,
  };
};
