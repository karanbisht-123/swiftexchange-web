import { act, renderHook, waitFor } from '@testing-library/react';

import { ethers } from 'ethers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePortfolioStore } from '../../../../../walletconnect/store/portfolioStore';
import { storeSwapOrder } from '../../../../service/evmTransactionStatusService';
import { addLocalTransaction } from '../../../../service/localTransactionService';
import { fetchSingleTokenBalance, getTokensForChain } from '../../../../service/tokenListService';
import { isEvmChain } from '../../../../utils/Chainregistry';
import { rpcManager } from '../../../../utils/rpcProvider';
import { executeSwap } from '../../execution/evmSwapExecutor';
import { execute1InchFusionSwap } from '../../execution/fusionSwapExecutor';
import { useEvmSwap } from '../useEvmSwap';

vi.mock('ethers', async () => {
  const actual = await vi.importActual<typeof import('ethers')>('ethers');
  const mockBrowserProvider = vi.fn().mockImplementation(function BrowserProvider() {
    return { getNetwork: vi.fn().mockResolvedValue({ chainId: 1n }) };
  });
  return {
    ...actual,
    BrowserProvider: mockBrowserProvider,
    ethers: {
      ...actual.ethers,
      isAddress: vi.fn((addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr)),
      BrowserProvider: mockBrowserProvider,
      formatUnits: vi.fn((v: string) => v),
    },
  };
});

vi.mock('../../../../../walletconnect/store/portfolioStore', () => ({
  usePortfolioStore: { getState: vi.fn(() => ({ assets: [] })) },
}));

vi.mock('../../../../../walletconnect/store/walletConnectStore', () => ({
  useWalletStore: { getState: vi.fn(() => ({ network: 'mainnet' })) },
}));

vi.mock('../../../../service/evmTransactionStatusService', () => ({
  storeSwapOrder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../service/localTransactionService', () => ({
  addLocalTransaction: vi.fn(),
}));

vi.mock('../../../../service/tokenListService', () => ({
  getTokensForChain: vi.fn(),
  fetchSingleTokenBalance: vi.fn().mockResolvedValue('0'),
}));

vi.mock('../../../../utils/Chainregistry', () => ({
  getChainById: vi.fn(() => ({ symbol: 'ETH' })),
  isEvmChain: vi.fn(() => true),
}));

vi.mock('../../../../utils/evmUtils', () => ({
  getEVMNetworkConfig: vi.fn(() => ({ rpcUrls: ['https://rpc.test'] })),
  simulateEVMTransaction: vi.fn(),
}));

vi.mock('../../../../utils/rpcProvider', () => ({
  rpcManager: { fetchWithFallback: vi.fn().mockResolvedValue('0') },
}));

vi.mock('../../utils/swapErrorHandler', () => ({
  parseSwapError: vi.fn((err: any) => err?.message || 'Unknown error'),
}));

vi.mock('../../utils/swapAmountUtils', () => ({
  toPlainString: vi.fn((v: string) => v),
  formatAmount: vi.fn((v: string) => v),
}));

vi.mock('../../services/evmSwapService', () => ({
  getSwapQuote: vi.fn(),
  prepareSwapTransaction: vi.fn(),
}));

vi.mock('../../services/fusionOrderService', () => ({
  get1InchFusionQuote: vi.fn(),
  build1InchFusionOrder: vi.fn(),
  submit1InchFusionOrder: vi.fn(),
}));

vi.mock('../../execution/evmSwapExecutor', () => ({
  executeSwap: vi.fn(),
}));

vi.mock('../../execution/fusionSwapExecutor', () => ({
  execute1InchFusionSwap: vi.fn(),
}));

vi.mock('../../../../service/evmSimulationService', () => ({
  simulateSwapTransaction: vi.fn(),
}));

vi.mock('../../../../../../utils/walletConnectUtils', () => ({
  notifyWalletSignRequest: vi.fn().mockResolvedValue(undefined),
}));

const VALID_USDC_ADDRESS = '0x1234567890123456789012345678901234567890';

const baseProps = () => ({
  chainId: 1,
  senderAddress: '0xSenderAddress000000000000000000000001',
  getProvider: vi.fn(),
});

const ethAsset = {
  symbol: 'ETH',
  address: 'native',
  isNative: true,
  chainId: 1,
  decimals: 18,
} as any;
const usdcAsset = {
  symbol: 'USDC',
  address: VALID_USDC_ADDRESS,
  chainId: 1,
  decimals: 6,
  isNative: false,
} as any;

const mockExecuteSwapCallbacks = (txHash = '0xTXHASH', triggerApproval = false) => {
  vi.mocked(executeSwap).mockImplementation(
    async (
      _chainId,
      _quote,
      _sell,
      _buy,
      _sender,
      _amount,
      _slippage,
      _deps,
      onApproval,
      onSwapSuccess,
      onBeforeSign
    ) => {
      if (triggerApproval) onApproval?.('0xAPPROVALHASH');
      onBeforeSign?.();
      onSwapSuccess?.(txHash);
      return txHash;
    }
  );
};

const mockFusionSwapCallbacks = (txHash = '0xFUSIONHASH', triggerApproval = false) => {
  vi.mocked(execute1InchFusionSwap).mockImplementation(
    async (
      _chainId,
      _fQuote,
      _preset,
      _sender,
      _sell,
      _buy,
      _amount,
      _deps,
      _onProgress,
      onApproval,
      onBeforeSign
    ) => {
      if (triggerApproval) onApproval?.('0xFUSIONAPPROVALHASH');
      onBeforeSign?.();
      return txHash;
    }
  );
};

describe('useEvmSwap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isEvmChain).mockReturnValue(true);
    vi.mocked(usePortfolioStore.getState).mockReturnValue({ assets: [] } as any);
    vi.mocked(ethers.BrowserProvider).mockImplementation(function BrowserProvider() {
      return { getNetwork: vi.fn().mockResolvedValue({ chainId: 1n }) } as any;
    } as any);
    vi.mocked(fetchSingleTokenBalance).mockResolvedValue('0');
    vi.mocked(rpcManager.fetchWithFallback).mockResolvedValue('0');
  });

  describe('initial state', () => {
    it('starts with empty/default values', () => {
      const { result } = renderHook(() => useEvmSwap(baseProps()));
      expect(result.current.txHash).toBeNull();
      expect(result.current.assets).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.isGasless).toBe(false);
      expect(result.current.userSlippageTolerance).toBe(1.0);
      expect(result.current.recommendedSlippage).toBeNull();
    });
  });

  describe('fetchTokenList', () => {
    it('sets an error when the chain is not an EVM chain', () => {
      vi.mocked(isEvmChain).mockReturnValue(false);
      const { result } = renderHook(() => useEvmSwap(baseProps()));

      act(() => result.current.fetchTokenList());

      expect(result.current.error).toBe('Unsupported network for EVM swap');
      expect(result.current.assets).toEqual([]);
    });

    it('sets an error when no tokens exist for the chain', () => {
      vi.mocked(getTokensForChain).mockReturnValue([]);
      const { result } = renderHook(() => useEvmSwap(baseProps()));

      act(() => result.current.fetchTokenList());

      expect(result.current.error).toBe('No tokens available for this network');
      expect(result.current.assets).toEqual([]);
    });

    it('merges portfolio-store balances for native tokens', () => {
      vi.mocked(getTokensForChain).mockReturnValue([ethAsset]);
      vi.mocked(usePortfolioStore.getState).mockReturnValue({
        assets: [{ chainId: 1, symbol: 'ETH', isNative: true, balance: '5.5' }],
      } as any);

      const { result } = renderHook(() => useEvmSwap(baseProps()));
      act(() => result.current.fetchTokenList());

      expect(result.current.assets[0].balance).toBe('5.5');
    });

    it('merges portfolio-store balances for non-native tokens by address', () => {
      vi.mocked(getTokensForChain).mockReturnValue([usdcAsset]);
      vi.mocked(usePortfolioStore.getState).mockReturnValue({
        assets: [
          {
            chainId: 1,
            symbol: 'USDC',
            isNative: false,
            address: VALID_USDC_ADDRESS,
            balance: '100',
          },
        ],
      } as any);

      const { result } = renderHook(() => useEvmSwap(baseProps()));
      act(() => result.current.fetchTokenList());

      expect(result.current.assets[0].balance).toBe('100');
    });

    it('leaves balance undefined when no matching store asset exists', () => {
      vi.mocked(getTokensForChain).mockReturnValue([usdcAsset]);
      const { result } = renderHook(() => useEvmSwap(baseProps()));

      act(() => result.current.fetchTokenList());

      expect(result.current.assets[0].balance).toBeUndefined();
    });

    it('recovers from a thrown error and reports a generic message', () => {
      vi.mocked(getTokensForChain).mockImplementation(() => {
        throw new Error('registry unavailable');
      });
      const { result } = renderHook(() => useEvmSwap(baseProps()));

      act(() => result.current.fetchTokenList());

      expect(result.current.error).toBe('Failed to load token list');
      expect(result.current.isFetchingAssets).toBe(false);
    });

    it('refetches automatically when a matching dynamic_assets_registered event fires', () => {
      vi.mocked(getTokensForChain).mockReturnValue([usdcAsset]);
      renderHook(() => useEvmSwap(baseProps()));

      act(() => {
        globalThis.dispatchEvent(
          new CustomEvent('dynamic_assets_registered', { detail: { chainId: 1 } })
        );
      });

      expect(getTokensForChain).toHaveBeenCalledWith(1);
    });

    it('ignores a dynamic_assets_registered event for a different chain', () => {
      vi.mocked(getTokensForChain).mockReturnValue([usdcAsset]);
      renderHook(() => useEvmSwap(baseProps()));
      vi.mocked(getTokensForChain).mockClear();

      act(() => {
        globalThis.dispatchEvent(
          new CustomEvent('dynamic_assets_registered', { detail: { chainId: 999 } })
        );
      });

      expect(getTokensForChain).not.toHaveBeenCalled();
    });
  });

  describe('updateTokenBalances', () => {
    const seedAssets = (result: any, token: any) => {
      vi.mocked(getTokensForChain).mockReturnValue([token]);
      act(() => result.current.fetchTokenList());
    };

    it('does nothing without a connected wallet address', async () => {
      const { result } = renderHook(() => useEvmSwap({ ...baseProps(), senderAddress: '' }));
      await act(async () => result.current.updateTokenBalances(usdcAsset));
      expect(fetchSingleTokenBalance).not.toHaveBeenCalled();
    });

    it('does nothing when no token is passed', async () => {
      const { result } = renderHook(() => useEvmSwap(baseProps()));
      await act(async () => result.current.updateTokenBalances());
      expect(fetchSingleTokenBalance).not.toHaveBeenCalled();
      expect(rpcManager.fetchWithFallback).not.toHaveBeenCalled();
    });

    it('prefers a live provider balance when the connected network matches', async () => {
      vi.mocked(fetchSingleTokenBalance).mockResolvedValue('42');
      const { result } = renderHook(() =>
        useEvmSwap({ ...baseProps(), getProvider: vi.fn(() => ({})) })
      );
      seedAssets(result, usdcAsset);

      await act(async () => result.current.updateTokenBalances(usdcAsset));

      await waitFor(() => expect(result.current.assets[0].balance).toBe('42'));
      expect(rpcManager.fetchWithFallback).not.toHaveBeenCalled();
    });

    it('falls back to the portfolio store when the provider network does not match', async () => {
      vi.mocked(ethers.BrowserProvider).mockImplementation(function BrowserProvider() {
        return { getNetwork: vi.fn().mockResolvedValue({ chainId: 2n }) } as any;
      } as any);
      vi.mocked(usePortfolioStore.getState).mockReturnValue({
        assets: [
          {
            chainId: 1,
            symbol: 'USDC',
            isNative: false,
            address: VALID_USDC_ADDRESS,
            balance: '7',
          },
        ],
      } as any);
      const { result } = renderHook(() =>
        useEvmSwap({ ...baseProps(), getProvider: vi.fn(() => ({})) })
      );
      seedAssets(result, usdcAsset);

      await act(async () => result.current.updateTokenBalances(usdcAsset));

      await waitFor(() => expect(result.current.assets[0].balance).toBe('7'));
    });

    it('falls back past a throwing getProvider straight to the RPC fallback', async () => {
      vi.mocked(rpcManager.fetchWithFallback).mockResolvedValue('99');
      const { result } = renderHook(() =>
        useEvmSwap({
          ...baseProps(),
          getProvider: vi.fn(() => {
            throw new Error('wallet locked');
          }),
        })
      );
      seedAssets(result, usdcAsset);

      await act(async () => result.current.updateTokenBalances(usdcAsset));

      await waitFor(() => expect(result.current.assets[0].balance).toBe('99'));
    });

    it('resolves to a zero balance without throwing when every source fails', async () => {
      vi.mocked(rpcManager.fetchWithFallback).mockRejectedValue(new Error('rpc down'));
      const { result } = renderHook(() =>
        useEvmSwap({
          ...baseProps(),
          getProvider: vi.fn(() => {
            throw new Error('wallet locked');
          }),
        })
      );
      seedAssets(result, usdcAsset);

      await expect(
        act(async () => result.current.updateTokenBalances(usdcAsset))
      ).resolves.not.toThrow();
      expect(result.current.assets[0].balance).toBe('0');
    });
  });

  describe('performSwap', () => {
    it('throws when there is no quote', async () => {
      const { result } = renderHook(() => useEvmSwap(baseProps()));
      await expect(
        result.current.performSwap(null as any, {} as any, {} as any, '1', 1)
      ).rejects.toThrow('No quote available');
    });

    it('throws when there is no connected wallet', async () => {
      const { result } = renderHook(() => useEvmSwap({ ...baseProps(), senderAddress: '' }));
      await expect(
        result.current.performSwap({ outputAmount: '1' } as any, {} as any, {} as any, '1', 1)
      ).rejects.toThrow('No wallet connected');
    });

    it('stores a swap order for a routed aggregator provider', async () => {
      mockExecuteSwapCallbacks('0xTXHASH');
      const { result } = renderHook(() => useEvmSwap(baseProps()));
      const quote = { outputAmount: '3000', provider: 'ONEINCH' } as any;

      let hash;
      await act(async () => {
        hash = await result.current.performSwap(quote, ethAsset, usdcAsset, '1', 1);
      });

      expect(hash).toBe('0xTXHASH');
      expect(storeSwapOrder).toHaveBeenCalledWith(
        expect.objectContaining({ txHash: '0xTXHASH', provider: 'ONEINCH', txType: 'Swap' })
      );
      expect(result.current.txHash).toBe('0xTXHASH');
      expect(result.current.loading).toBe(false);
    });

    it('stores a Token Approval order before the swap when an approval step occurs', async () => {
      mockExecuteSwapCallbacks('0xTXHASH', true);
      const { result } = renderHook(() => useEvmSwap(baseProps()));
      const quote = { outputAmount: '3000', provider: 'ONEINCH' } as any;

      await act(async () => {
        await result.current.performSwap(quote, ethAsset, usdcAsset, '1', 1);
      });

      expect(storeSwapOrder).toHaveBeenCalledWith(
        expect.objectContaining({ txHash: '0xAPPROVALHASH', txType: 'Token Approval' })
      );
    });

    it('records a local transaction for a non-routed provider on a standard EVM chain', async () => {
      mockExecuteSwapCallbacks('0xLOCALHASH');
      const { result } = renderHook(() => useEvmSwap(baseProps()));
      const quote = { outputAmount: '3000', provider: 'DIRECT' } as any;

      await act(async () => {
        await result.current.performSwap(quote, ethAsset, usdcAsset, '1', 1);
      });

      expect(addLocalTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ hash: '0xLOCALHASH', type: 'swap', status: 'pending' })
      );
      expect(storeSwapOrder).not.toHaveBeenCalled();
    });

    it('sets error state and rethrows a parsed message on failure', async () => {
      vi.mocked(executeSwap).mockRejectedValue(new Error('user rejected transaction'));
      const { result } = renderHook(() => useEvmSwap(baseProps()));
      const quote = { outputAmount: '3000', provider: 'ONEINCH' } as any;

      await expect(result.current.performSwap(quote, ethAsset, usdcAsset, '1', 1)).rejects.toThrow(
        'user rejected transaction'
      );

      await waitFor(() => expect(result.current.error).toBe('user rejected transaction'));
      expect(result.current.loading).toBe(false);
      expect(result.current.txHash).toBeNull();
    });
  });

  describe('performFusionSwap', () => {
    it('throws when no fusion quote is available', async () => {
      const { result } = renderHook(() => useEvmSwap(baseProps()));
      await expect(result.current.performFusionSwap(ethAsset, usdcAsset, '1')).rejects.toThrow(
        'No fusion quote available'
      );
    });

    it('throws when there is no connected wallet', async () => {
      const { result } = renderHook(() => useEvmSwap({ ...baseProps(), senderAddress: '' }));
      const fQuote = { quoteId: 'q1' } as any;
      await expect(
        result.current.performFusionSwap(ethAsset, usdcAsset, '1', 'fast', undefined, fQuote)
      ).rejects.toThrow('No wallet connected');
    });

    it('executes a fusion swap when a fusion quote is passed', async () => {
      mockFusionSwapCallbacks('0xFUSIONHASH');
      const { result } = renderHook(() => useEvmSwap(baseProps()));
      const fQuote = { quoteId: 'stateQuote' } as any;

      let hash;
      await act(async () => {
        hash = await result.current.performFusionSwap(
          ethAsset,
          usdcAsset,
          '1',
          'fast',
          undefined,
          fQuote
        );
      });

      expect(hash).toBe('0xFUSIONHASH');
    });

    it('labels a same-chain order as ONEINCH_FUSION', async () => {
      mockFusionSwapCallbacks('0xFUSIONHASH');
      const { result } = renderHook(() => useEvmSwap(baseProps()));
      const fQuote = { quoteId: 'q1', toTokenAmount: '5000' } as any;
      const sameChainBuyAsset = { ...usdcAsset, chainId: 1 };

      await act(async () => {
        await result.current.performFusionSwap(
          ethAsset,
          sameChainBuyAsset,
          '1',
          'fast',
          undefined,
          fQuote
        );
      });

      expect(storeSwapOrder).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'ONEINCH_FUSION' })
      );
    });

    it('labels a cross-chain order as ONEINCH_FUSION_PLUS', async () => {
      mockFusionSwapCallbacks('0xFUSIONHASH');
      const { result } = renderHook(() => useEvmSwap(baseProps()));
      const fQuote = { quoteId: 'q1', toTokenAmount: '5000' } as any;
      const crossChainBuyAsset = { ...usdcAsset, chainId: 137 };

      await act(async () => {
        await result.current.performFusionSwap(
          ethAsset,
          crossChainBuyAsset,
          '1',
          'fast',
          undefined,
          fQuote
        );
      });

      expect(storeSwapOrder).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'ONEINCH_FUSION_PLUS' })
      );
    });

    it('still resolves with the tx hash when the backend order-store call fails', async () => {
      mockFusionSwapCallbacks('0xFUSIONHASH');
      vi.mocked(storeSwapOrder).mockRejectedValue(new Error('backend unavailable'));
      const { result } = renderHook(() => useEvmSwap(baseProps()));
      const fQuote = { quoteId: 'q1', toTokenAmount: '5000' } as any;

      let hash;
      await act(async () => {
        hash = await result.current.performFusionSwap(
          ethAsset,
          usdcAsset,
          '1',
          'fast',
          undefined,
          fQuote
        );
      });

      expect(hash).toBe('0xFUSIONHASH');
      expect(result.current.txHash).toBe('0xFUSIONHASH');
      expect(result.current.loading).toBe(false);
    });

    it('sets error state and rethrows a parsed message on execution failure', async () => {
      vi.mocked(execute1InchFusionSwap).mockRejectedValue(new Error('fusion order expired'));
      const { result } = renderHook(() => useEvmSwap(baseProps()));
      const fQuote = { quoteId: 'q1' } as any;

      await expect(
        result.current.performFusionSwap(ethAsset, usdcAsset, '1', 'fast', undefined, fQuote)
      ).rejects.toThrow('fusion order expired');

      await waitFor(() => expect(result.current.error).toBe('fusion order expired'));
      expect(result.current.loading).toBe(false);
      expect(result.current.txHash).toBeNull();
    });
  });

  describe('reset', () => {
    it('clears error, txHash and quoteLoading', async () => {
      vi.mocked(executeSwap).mockRejectedValue(new Error('swap failed'));
      const { result } = renderHook(() => useEvmSwap(baseProps()));

      await expect(
        result.current.performSwap({ outputAmount: '3000' } as any, ethAsset, usdcAsset, '1', 1)
      ).rejects.toThrow('swap failed');

      await waitFor(() => expect(result.current.error).toBe('swap failed'));

      act(() => result.current.reset());

      expect(result.current.error).toBeNull();
      expect(result.current.txHash).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.quoteLoading).toBe(false);
    });
  });

  describe('setters', () => {
    it('updates isGasless', () => {
      const { result } = renderHook(() => useEvmSwap(baseProps()));
      act(() => result.current.setGasless(true));
      expect(result.current.isGasless).toBe(true);
    });

    it('updates userSlippageTolerance', () => {
      const { result } = renderHook(() => useEvmSwap(baseProps()));
      act(() => result.current.setUserSlippageTolerance(2.5));
      expect(result.current.userSlippageTolerance).toBe(2.5);
    });

    it('updates recommendedSlippage', () => {
      const { result } = renderHook(() => useEvmSwap(baseProps()));
      act(() => result.current.setRecommendedSlippage('0.8'));
      expect(result.current.recommendedSlippage).toBe('0.8');
    });
  });
});
