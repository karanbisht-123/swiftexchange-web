import { create } from 'zustand';

export interface SwapState {
  fromChainId: number | string;
  toChainId: number | string;
  sellAssetSymbol: string;
  sellAssetAddress: string;
  buyAssetSymbol: string;
  buyAssetAddress: string;
  sellAmount: string;
  isGasless: boolean;
  userSlippageTolerance: number;
  feePayType: 'native' | 'stablecoin';

  setFromChainId: (id: number | string) => void;
  setToChainId: (id: number | string) => void;
  setSellAssetSymbol: (symbol: string) => void;
  setSellAssetAddress: (address: string) => void;
  setBuyAssetSymbol: (symbol: string) => void;
  setBuyAssetAddress: (address: string) => void;
  setSellAmount: (amount: string) => void;
  setIsGasless: (enabled: boolean) => void;
  setUserSlippageTolerance: (slippage: number) => void;
  setFeePayType: (type: 'native' | 'stablecoin') => void;
  resetInputs: () => void;
}

export const useSwapStore = create<SwapState>((set) => ({
  fromChainId: 1,
  toChainId: 1,
  sellAssetSymbol: '',
  sellAssetAddress: '',
  buyAssetSymbol: '',
  buyAssetAddress: '',
  sellAmount: '',
  isGasless: false,
  userSlippageTolerance: 1.0,
  feePayType: 'stablecoin',

  setFromChainId: (id) => set({ fromChainId: id }),
  setToChainId: (id) => set({ toChainId: id }),
  setSellAssetSymbol: (symbol) => set({ sellAssetSymbol: symbol }),
  setSellAssetAddress: (address) => set({ sellAssetAddress: address }),
  setBuyAssetSymbol: (symbol) => set({ buyAssetSymbol: symbol }),
  setBuyAssetAddress: (address) => set({ buyAssetAddress: address }),
  setSellAmount: (amount) => set({ sellAmount: amount }),
  setIsGasless: (enabled) => set({ isGasless: enabled }),
  setUserSlippageTolerance: (slippage) => set({ userSlippageTolerance: slippage }),
  setFeePayType: (type) => set({ feePayType: type }),
  resetInputs: () => set({
    sellAmount: '',
    isGasless: false,
    feePayType: 'stablecoin',
  }),
}));
