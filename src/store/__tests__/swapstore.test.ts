import { beforeEach, describe, expect, it } from 'vitest';

import { useSwapStore } from '../swapStore';

const initialState = {
  fromChainId: 1,
  toChainId: 1,
  sellAssetSymbol: '',
  sellAssetAddress: '',
  buyAssetSymbol: '',
  buyAssetAddress: '',
  sellAmount: '',
  isGasless: false,
  userSlippageTolerance: 1.0,
  feePayType: 'stablecoin' as const,

  pendingTxStatus: 'idle' as const,
  pendingTxHasPendingSign: false,
  pendingTxErrorMsg: null,
  pendingTxHash: null,
  pendingTxFromChainId: null,

  bridgePendingSignPhase: 'idle' as const,
  bridgePendingSignSessionId: null,

  executionApprovalRequired: null,
  executionCurrentStep: 'preparing' as const,
};

const resetStore = () => {
  useSwapStore.setState({ ...initialState });
};

describe('swapStore', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('initial state', () => {
    it('matches the expected default values', () => {
      const state = useSwapStore.getState();
      expect(state.fromChainId).toBe(1);
      expect(state.toChainId).toBe(1);
      expect(state.sellAssetSymbol).toBe('');
      expect(state.sellAssetAddress).toBe('');
      expect(state.buyAssetSymbol).toBe('');
      expect(state.buyAssetAddress).toBe('');
      expect(state.sellAmount).toBe('');
      expect(state.isGasless).toBe(false);
      expect(state.userSlippageTolerance).toBe(1.0);
      expect(state.feePayType).toBe('stablecoin');
    });

    it('defaults pending transaction state to idle/empty', () => {
      const state = useSwapStore.getState();
      expect(state.pendingTxStatus).toBe('idle');
      expect(state.pendingTxHasPendingSign).toBe(false);
      expect(state.pendingTxErrorMsg).toBeNull();
      expect(state.pendingTxHash).toBeNull();
      expect(state.pendingTxFromChainId).toBeNull();
    });

    it('defaults bridge sign state to idle/null', () => {
      const state = useSwapStore.getState();
      expect(state.bridgePendingSignPhase).toBe('idle');
      expect(state.bridgePendingSignSessionId).toBeNull();
    });

    it('defaults execution progress state', () => {
      const state = useSwapStore.getState();
      expect(state.executionApprovalRequired).toBeNull();
      expect(state.executionCurrentStep).toBe('preparing');
    });
  });

  describe('basic setters', () => {
    it('setFromChainId updates fromChainId', () => {
      useSwapStore.getState().setFromChainId(137);
      expect(useSwapStore.getState().fromChainId).toBe(137);
    });

    it('setFromChainId accepts a string chain id', () => {
      useSwapStore.getState().setFromChainId('cosmos-hub-4');
      expect(useSwapStore.getState().fromChainId).toBe('cosmos-hub-4');
    });

    it('setToChainId updates toChainId', () => {
      useSwapStore.getState().setToChainId(42161);
      expect(useSwapStore.getState().toChainId).toBe(42161);
    });

    it('setSellAssetSymbol updates sellAssetSymbol', () => {
      useSwapStore.getState().setSellAssetSymbol('ETH');
      expect(useSwapStore.getState().sellAssetSymbol).toBe('ETH');
    });

    it('setSellAssetAddress updates sellAssetAddress', () => {
      useSwapStore.getState().setSellAssetAddress('0xSell');
      expect(useSwapStore.getState().sellAssetAddress).toBe('0xSell');
    });

    it('setBuyAssetSymbol updates buyAssetSymbol', () => {
      useSwapStore.getState().setBuyAssetSymbol('USDC');
      expect(useSwapStore.getState().buyAssetSymbol).toBe('USDC');
    });

    it('setBuyAssetAddress updates buyAssetAddress', () => {
      useSwapStore.getState().setBuyAssetAddress('0xBuy');
      expect(useSwapStore.getState().buyAssetAddress).toBe('0xBuy');
    });

    it('setSellAmount updates sellAmount', () => {
      useSwapStore.getState().setSellAmount('1.5');
      expect(useSwapStore.getState().sellAmount).toBe('1.5');
    });

    it('setIsGasless updates isGasless', () => {
      useSwapStore.getState().setIsGasless(true);
      expect(useSwapStore.getState().isGasless).toBe(true);
    });

    it('setUserSlippageTolerance updates userSlippageTolerance', () => {
      useSwapStore.getState().setUserSlippageTolerance(0.5);
      expect(useSwapStore.getState().userSlippageTolerance).toBe(0.5);
    });

    it('setFeePayType updates feePayType to native', () => {
      useSwapStore.getState().setFeePayType('native');
      expect(useSwapStore.getState().feePayType).toBe('native');
    });

    it('setFeePayType updates feePayType back to stablecoin', () => {
      useSwapStore.getState().setFeePayType('native');
      useSwapStore.getState().setFeePayType('stablecoin');
      expect(useSwapStore.getState().feePayType).toBe('stablecoin');
    });
  });

  describe('resetInputs', () => {
    it('resets sellAmount, isGasless, and feePayType to defaults', () => {
      useSwapStore.setState({
        sellAmount: '5',
        isGasless: true,
        feePayType: 'native',
      });

      useSwapStore.getState().resetInputs();

      const state = useSwapStore.getState();
      expect(state.sellAmount).toBe('');
      expect(state.isGasless).toBe(false);
      expect(state.feePayType).toBe('stablecoin');
    });

    it('does not reset asset symbols, addresses, or chain ids', () => {
      useSwapStore.setState({
        fromChainId: 137,
        toChainId: 42161,
        sellAssetSymbol: 'ETH',
        sellAssetAddress: '0xSell',
        buyAssetSymbol: 'USDC',
        buyAssetAddress: '0xBuy',
      });

      useSwapStore.getState().resetInputs();

      const state = useSwapStore.getState();
      expect(state.fromChainId).toBe(137);
      expect(state.toChainId).toBe(42161);
      expect(state.sellAssetSymbol).toBe('ETH');
      expect(state.sellAssetAddress).toBe('0xSell');
      expect(state.buyAssetSymbol).toBe('USDC');
      expect(state.buyAssetAddress).toBe('0xBuy');
    });

    it('does not reset slippage tolerance', () => {
      useSwapStore.setState({ userSlippageTolerance: 3.5 });
      useSwapStore.getState().resetInputs();
      expect(useSwapStore.getState().userSlippageTolerance).toBe(3.5);
    });
  });

  describe('pending transaction setters', () => {
    it('setPendingTxStatus updates pendingTxStatus', () => {
      useSwapStore.getState().setPendingTxStatus('signing');
      expect(useSwapStore.getState().pendingTxStatus).toBe('signing');
    });

    it('setPendingTxHasPendingSign updates pendingTxHasPendingSign', () => {
      useSwapStore.getState().setPendingTxHasPendingSign(true);
      expect(useSwapStore.getState().pendingTxHasPendingSign).toBe(true);
    });

    it('setPendingTxErrorMsg updates pendingTxErrorMsg', () => {
      useSwapStore.getState().setPendingTxErrorMsg('Transaction failed');
      expect(useSwapStore.getState().pendingTxErrorMsg).toBe('Transaction failed');
    });

    it('setPendingTxErrorMsg clears the error with null', () => {
      useSwapStore.getState().setPendingTxErrorMsg('Transaction failed');
      useSwapStore.getState().setPendingTxErrorMsg(null);
      expect(useSwapStore.getState().pendingTxErrorMsg).toBeNull();
    });

    it('setPendingTxHash updates pendingTxHash', () => {
      useSwapStore.getState().setPendingTxHash('0xabc123');
      expect(useSwapStore.getState().pendingTxHash).toBe('0xabc123');
    });

    it('setPendingTxFromChainId updates pendingTxFromChainId', () => {
      useSwapStore.getState().setPendingTxFromChainId(10);
      expect(useSwapStore.getState().pendingTxFromChainId).toBe(10);
    });
  });

  describe('clearPendingTx', () => {
    it('resets all pending transaction fields and execution progress fields', () => {
      useSwapStore.setState({
        pendingTxStatus: 'success',
        pendingTxHasPendingSign: true,
        pendingTxErrorMsg: 'some error',
        pendingTxHash: '0xdeadbeef',
        pendingTxFromChainId: 137,
        executionApprovalRequired: true,
        executionCurrentStep: 'signing',
      });

      useSwapStore.getState().clearPendingTx();

      const state = useSwapStore.getState();
      expect(state.pendingTxStatus).toBe('idle');
      expect(state.pendingTxHasPendingSign).toBe(false);
      expect(state.pendingTxErrorMsg).toBeNull();
      expect(state.pendingTxHash).toBeNull();
      expect(state.pendingTxFromChainId).toBeNull();
      expect(state.executionApprovalRequired).toBeNull();
      expect(state.executionCurrentStep).toBe('preparing');
    });

    it('does not affect bridge sign state or swap inputs', () => {
      useSwapStore.setState({
        sellAmount: '2.5',
        bridgePendingSignPhase: 'signing_bridge',
        bridgePendingSignSessionId: 'session-1',
      });

      useSwapStore.getState().clearPendingTx();

      const state = useSwapStore.getState();
      expect(state.sellAmount).toBe('2.5');
      expect(state.bridgePendingSignPhase).toBe('signing_bridge');
      expect(state.bridgePendingSignSessionId).toBe('session-1');
    });
  });

  describe('execution progress setters', () => {
    it('setExecutionApprovalRequired updates the flag to true', () => {
      useSwapStore.getState().setExecutionApprovalRequired(true);
      expect(useSwapStore.getState().executionApprovalRequired).toBe(true);
    });

    it('setExecutionApprovalRequired updates the flag to false', () => {
      useSwapStore.getState().setExecutionApprovalRequired(false);
      expect(useSwapStore.getState().executionApprovalRequired).toBe(false);
    });

    it('setExecutionApprovalRequired accepts null', () => {
      useSwapStore.getState().setExecutionApprovalRequired(true);
      useSwapStore.getState().setExecutionApprovalRequired(null);
      expect(useSwapStore.getState().executionApprovalRequired).toBeNull();
    });

    it('setExecutionCurrentStep updates the step', () => {
      useSwapStore.getState().setExecutionCurrentStep('approving');
      expect(useSwapStore.getState().executionCurrentStep).toBe('approving');
    });
  });

  describe('setBridgePendingSignPhase', () => {
    it('sets the phase and session id together', () => {
      useSwapStore.getState().setBridgePendingSignPhase('signing_bridge', 'session-abc');

      const state = useSwapStore.getState();
      expect(state.bridgePendingSignPhase).toBe('signing_bridge');
      expect(state.bridgePendingSignSessionId).toBe('session-abc');
    });

    it('defaults sessionId to null when omitted', () => {
      useSwapStore.getState().setBridgePendingSignPhase('signing_swap');

      expect(useSwapStore.getState().bridgePendingSignSessionId).toBeNull();
    });

    it('clears a previously-set sessionId when called again without one', () => {
      useSwapStore.getState().setBridgePendingSignPhase('signing_bridge', 'session-abc');
      useSwapStore.getState().setBridgePendingSignPhase('signing_deposit');

      const state = useSwapStore.getState();
      expect(state.bridgePendingSignPhase).toBe('signing_deposit');
      expect(state.bridgePendingSignSessionId).toBeNull();
    });

    it('treats an explicit undefined sessionId the same as omitting it', () => {
      useSwapStore.getState().setBridgePendingSignPhase('signing_bridge', 'session-abc');
      useSwapStore.getState().setBridgePendingSignPhase('signing_deposit_confirm', undefined);

      expect(useSwapStore.getState().bridgePendingSignSessionId).toBeNull();
    });

    it('accepts every valid bridge sign phase value', () => {
      const phases = [
        'idle',
        'signing_swap',
        'signing_bridge',
        'signing_deposit',
        'signing_bridge_approve',
        'signing_bridge_send',
        'signing_deposit_approve',
        'signing_deposit_confirm',
      ] as const;

      phases.forEach(phase => {
        useSwapStore.getState().setBridgePendingSignPhase(phase);
        expect(useSwapStore.getState().bridgePendingSignPhase).toBe(phase);
      });
    });
  });

  describe('clearBridgePendingSign', () => {
    it('resets phase to idle and sessionId to null', () => {
      useSwapStore.getState().setBridgePendingSignPhase('signing_bridge_send', 'session-xyz');

      useSwapStore.getState().clearBridgePendingSign();

      const state = useSwapStore.getState();
      expect(state.bridgePendingSignPhase).toBe('idle');
      expect(state.bridgePendingSignSessionId).toBeNull();
    });

    it('does not affect pending transaction or swap input state', () => {
      useSwapStore.setState({
        sellAmount: '10',
        pendingTxStatus: 'signing',
        pendingTxHash: '0xhash',
      });
      useSwapStore.getState().setBridgePendingSignPhase('signing_bridge', 'session-xyz');

      useSwapStore.getState().clearBridgePendingSign();

      const state = useSwapStore.getState();
      expect(state.sellAmount).toBe('10');
      expect(state.pendingTxStatus).toBe('signing');
      expect(state.pendingTxHash).toBe('0xhash');
    });
  });
});
