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

  // Pending transaction state — persists across navigation (Swap)
  pendingTxStatus: 'idle' | 'preparing' | 'signing' | 'success' | 'error';
  pendingTxHasPendingSign: boolean;
  pendingTxErrorMsg: string | null;
  pendingTxHash: string | null;
  pendingTxFromChainId: number | string | null;

  // Bridge-specific pending sign state — separate namespace, no conflict with swap
  bridgePendingSignPhase: 'idle' | 'signing_swap' | 'signing_bridge' | 'signing_deposit';
  bridgePendingSignSessionId: string | null;

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

  setPendingTxStatus: (s: SwapState['pendingTxStatus']) => void;
  setPendingTxHasPendingSign: (v: boolean) => void;
  setPendingTxErrorMsg: (msg: string | null) => void;
  setPendingTxHash: (hash: string | null) => void;
  setPendingTxFromChainId: (id: number | string | null) => void;
  clearPendingTx: () => void;

  // Bridge sign phase setters
  setBridgePendingSignPhase: (phase: SwapState['bridgePendingSignPhase'], sessionId?: string | null) => void;
  clearBridgePendingSign: () => void;
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

  // Pending transaction initial state
  pendingTxStatus: 'idle',
  pendingTxHasPendingSign: false,
  pendingTxErrorMsg: null,
  pendingTxHash: null,
  pendingTxFromChainId: null,

  // Bridge sign phase initial state
  bridgePendingSignPhase: 'idle',
  bridgePendingSignSessionId: null,

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

  setPendingTxStatus: (s) => set({ pendingTxStatus: s }),
  setPendingTxHasPendingSign: (v) => set({ pendingTxHasPendingSign: v }),
  setPendingTxErrorMsg: (msg) => set({ pendingTxErrorMsg: msg }),
  setPendingTxHash: (hash) => set({ pendingTxHash: hash }),
  setPendingTxFromChainId: (id) => set({ pendingTxFromChainId: id }),
  clearPendingTx: () => set({
    pendingTxStatus: 'idle',
    pendingTxHasPendingSign: false,
    pendingTxErrorMsg: null,
    pendingTxHash: null,
    pendingTxFromChainId: null,
  }),

  setBridgePendingSignPhase: (phase, sessionId = null) => set({
    bridgePendingSignPhase: phase,
    bridgePendingSignSessionId: sessionId ?? null,
  }),
  clearBridgePendingSign: () => set({
    bridgePendingSignPhase: 'idle',
    bridgePendingSignSessionId: null,
  }),
}));

