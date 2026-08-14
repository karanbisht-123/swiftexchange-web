import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

  pendingTxStatus: 'idle' | 'preparing' | 'signing' | 'success' | 'error';
  pendingTxHasPendingSign: boolean;
  pendingTxErrorMsg: string | null;
  pendingTxHash: string | null;
  pendingTxFromChainId: number | string | null;

  bridgePendingSignPhase:
    | 'idle'
    | 'signing_swap'
    | 'signing_bridge'
    | 'signing_deposit'
    | 'signing_bridge_approve'
    | 'signing_bridge_send'
    | 'signing_deposit_approve'
    | 'signing_deposit_confirm';
  bridgePendingSignSessionId: string | null;

  executionApprovalRequired: boolean | null;
  executionCurrentStep: 'preparing' | 'approving' | 'signing';

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

  setExecutionApprovalRequired: (val: boolean | null) => void;
  setExecutionCurrentStep: (step: 'preparing' | 'approving' | 'signing') => void;

  setBridgePendingSignPhase: (
    phase: SwapState['bridgePendingSignPhase'],
    sessionId?: string | null
  ) => void;
  clearBridgePendingSign: () => void;
}

export const useSwapStore = create<SwapState>()(
  persist(
    set => ({
      fromChainId: 'pubnet',
      toChainId: 'pubnet',
      sellAssetSymbol: '',
      sellAssetAddress: '',
      buyAssetSymbol: '',
      buyAssetAddress: '',
      sellAmount: '',
      isGasless: false,
      userSlippageTolerance: 1.0,
      feePayType: 'stablecoin',

      pendingTxStatus: 'idle',
      pendingTxHasPendingSign: false,
      pendingTxErrorMsg: null,
      pendingTxHash: null,
      pendingTxFromChainId: null,

      bridgePendingSignPhase: 'idle',
      bridgePendingSignSessionId: null,

      executionApprovalRequired: null,
      executionCurrentStep: 'preparing',

      setFromChainId: id => set({ fromChainId: id }),
      setToChainId: id => set({ toChainId: id }),
      setSellAssetSymbol: symbol => set({ sellAssetSymbol: symbol }),
      setSellAssetAddress: address => set({ sellAssetAddress: address }),
      setBuyAssetSymbol: symbol => set({ buyAssetSymbol: symbol }),
      setBuyAssetAddress: address => set({ buyAssetAddress: address }),
      setSellAmount: amount => set({ sellAmount: amount }),
      setIsGasless: enabled => set({ isGasless: enabled }),
      setUserSlippageTolerance: slippage => set({ userSlippageTolerance: slippage }),
      setFeePayType: type => set({ feePayType: type }),
      resetInputs: () =>
        set({
          sellAmount: '',
          isGasless: false,
          feePayType: 'stablecoin',
        }),

      setPendingTxStatus: s => set({ pendingTxStatus: s }),
      setPendingTxHasPendingSign: v => set({ pendingTxHasPendingSign: v }),
      setPendingTxErrorMsg: msg => set({ pendingTxErrorMsg: msg }),
      setPendingTxHash: hash => set({ pendingTxHash: hash }),
      setPendingTxFromChainId: id => set({ pendingTxFromChainId: id }),
      clearPendingTx: () =>
        set({
          pendingTxStatus: 'idle',
          pendingTxHasPendingSign: false,
          pendingTxErrorMsg: null,
          pendingTxHash: null,
          pendingTxFromChainId: null,
          executionApprovalRequired: null,
          executionCurrentStep: 'preparing',
        }),

      setExecutionApprovalRequired: val => set({ executionApprovalRequired: val }),
      setExecutionCurrentStep: step => set({ executionCurrentStep: step }),

      setBridgePendingSignPhase: (phase, sessionId = null) =>
        set({
          bridgePendingSignPhase: phase,
          bridgePendingSignSessionId: sessionId ?? null,
        }),
      clearBridgePendingSign: () =>
        set({
          bridgePendingSignPhase: 'idle',
          bridgePendingSignSessionId: null,
        }),
    }),
    {
      name: 'swiftex-swap-selection',
      partialize: state => ({
        fromChainId: state.fromChainId,
        toChainId: state.toChainId,
        sellAssetSymbol: state.sellAssetSymbol,
        sellAssetAddress: state.sellAssetAddress,
        buyAssetSymbol: state.buyAssetSymbol,
        buyAssetAddress: state.buyAssetAddress,
        userSlippageTolerance: state.userSlippageTolerance,
      }),
    }
  )
);
