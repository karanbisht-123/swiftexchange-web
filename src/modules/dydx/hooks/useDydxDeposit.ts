import { useCallback, useState } from 'react';

import { SubaccountInfo } from '@dydxprotocol/v4-client-js';
import { executeRoute, route as fetchSkipRoute } from '@skip-go/client';
import Long from 'long';

import { walletService } from '../../walletconnect/services/walletService';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { dydxWalletService } from '../service/dydxWalletService';
import { skipApiService } from '../service/skipApiService';
import { SUBACCOUNT_CONSTANTS } from '../types/trading.types';
import {
  DYDX_CHAIN_ID,
  DYDX_USDC_DENOM,
  NOBLE_USDC_DENOM,
  buildCosmosSigner,
  buildEvmSigner,
  buildUserAddresses,
  dydxToNoble,
  isInsufficientGasError,
} from '../utils/skipBridgeUtils';

export const MIN_DEPOSIT_USDC = 1;

const DYDX_POLL_TIMEOUT_MS = 180_000;
const DYDX_POLL_INTERVAL_MS = 5_000;


export type DepositStep =
  | 'idle'
  | 'routing'
  | 'signing_evm'
  | 'pending_bridge'
  | 'transferring'
  | 'success'
  | 'error';

export interface DepositRoute {
  estimatedTime: string;
  fee: number;
  receivedAmount: number;
  usdAmountOut: string;
}
/**
 * Poll the dYdX chain REST endpoint until the IBC-wrapped USDC balance
 * reaches `minUusdc`. Throws if funds don't arrive within the timeout.
 */
async function waitForDydxWalletBalance(dydxAddress: string, minUusdc: number): Promise<number> {
  const deadline = Date.now() + DYDX_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(
        `https://dydx-rest.publicnode.com/cosmos/bank/v1beta1/balances/${dydxAddress}`
      );
      if (res.ok) {
        const { balances = [] } = await res.json();
        const coin = (balances as { denom: string; amount: string }[]).find(
          b => b.denom === DYDX_USDC_DENOM
        );
        const bal = parseInt(coin?.amount ?? '0', 10);
        console.log(`[deposit] dYdX wallet: ${bal} uusdc (need >= ${minUusdc})`);
        if (bal >= minUusdc) return bal;
      }
    } catch (e) {
      console.warn('[deposit] balance poll error:', e);
    }
    await new Promise(r => setTimeout(r, DYDX_POLL_INTERVAL_MS));
  }

  throw new Error(
    `Timed out waiting for bridged funds on dYdX chain. ` +
    `Check https://www.mintscan.io/dydx/address/${dydxAddress}`
  );
}


function classifyDepositError(err: any): string {
  const raw: string = err?.message ?? err?.reason ?? 'Deposit failed';

  if (isInsufficientGasError(err)) {
    return (
      'Not enough ETH to pay for gas. Please add ETH to your wallet to cover ' +
      'the transaction fee and try again.'
    );
  }

  const lower = raw.toLowerCase();
  if (lower.includes('invalid user addresses') || lower.includes('createvalidaddresslist')) {
    return (
      'Failed to build the deposit route — wallet address mismatch. ' +
      'Please disconnect and reconnect your wallet, then try again.'
    );
  }

  return raw;
}

export const useDydxDeposit = () => {
  const [step, setStep] = useState<DepositStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [route, setRoute] = useState<DepositRoute | null>(null);

  const [pendingNobleQuantums, setPendingNobleQuantums] = useState<string | null>(null);
  const [pendingDydxQuantums, setPendingDydxQuantums] = useState<string | null>(null);
  const [isCheckingPending, setIsCheckingPending] = useState(false);

  const getRoute = useCallback(
    async (
      assetSymbol: string,
      amountHuman: number,
      evmChainId?: number,
      goFast = false
    ): Promise<DepositRoute | null> => {
      setStep('routing');
      setError(null);
      try {
        const chainId =
          evmChainId ?? Number(useWalletStore.getState().connectedWallets.evm?.chainId ?? 1);

        const raw = await skipApiService.getDepositRoute(assetSymbol, chainId, amountHuman, goFast);

        const result: DepositRoute = {
          estimatedTime: skipApiService.formatDuration(raw.estimatedDurationSeconds),
          fee: raw.estimatedFeesUsd,
          receivedAmount: parseInt(raw.amountOut, 10) / 1e6,
          usdAmountOut: raw.usdAmountOut,
        };

        setRoute(result);
        setStep('idle');
        return result;
      } catch (err: any) {
        setError(err.message ?? 'Failed to fetch route');
        setStep('error');
        return null;
      }
    },
    []
  );

  const deposit = useCallback(
    async (
      assetSymbol: string,
      amountHuman: number,
      evmChainId?: number,
      goFast = false,
      slippageTolerancePercent = '1'
    ): Promise<{ success: boolean; txHash?: string; error?: string }> => {
      setError(null);
      setTxHash(null);

      try {
        // 1. Resolve addresses
        const storeState = useWalletStore.getState();
        const evmWallet = storeState.connectedWallets.evm;
        const evmAddress = evmWallet?.address;
        const dydxAddress =
          evmWallet?.dydxAddress ?? storeState.connectedWallets.cosmos?.dydxAddress;

        if (!evmAddress) throw new Error('EVM wallet not connected');
        if (!dydxAddress) throw new Error('dYdX wallet not derived — please onboard first');

        const chainId = evmChainId ?? Number(evmWallet?.chainId ?? 1);

        // 2. Fetch Skip route

        setStep('routing');

        const sourceDenom = skipApiService.getSourceDenomForAsset(assetSymbol, chainId);
        const amountIn = skipApiService.toAmountIn(amountHuman, assetSymbol);

        const rawRoute = await fetchSkipRoute({
          sourceAssetDenom: sourceDenom,
          sourceAssetChainId: String(chainId),
          destAssetDenom: DYDX_USDC_DENOM,
          destAssetChainId: DYDX_CHAIN_ID,
          amountIn,
          cumulativeAffiliateFeeBps: '0',
          allowUnsafe: false,
          smartRelay: true,
          smartSwapOptions: { splitRoutes: false, evmSwaps: true },
          bridges: ['CCTP', 'GO_FAST', 'IBC', 'AXELAR'] as any,
          allowMultiTx: true,
          goFast,
        });

        if (!rawRoute) throw new Error('No deposit route returned from Skip');

        // 3. Build userAddresses

        const requiredChainIds: string[] = rawRoute.requiredChainAddresses ?? [];

        if (requiredChainIds.length === 0) {
          throw new Error(
            'Skip route returned no requiredChainAddresses — cannot build userAddresses.'
          );
        }

        console.log('[deposit] requiredChainAddresses:', requiredChainIds);

        const userAddresses = buildUserAddresses(requiredChainIds, {
          evmAddress,
          dydxAddress,
        });

        console.log('[deposit] userAddresses:', userAddresses);

        //4. Resolve signing wallet
        const localWallet = walletService.getSigningWallet();
        if (!localWallet) throw new Error('dYdX signing wallet not available');

        const rawSigner =
          localWallet.offlineSigner ?? (localWallet as any).signer ?? (localWallet as any).wallet;
        if (!rawSigner) throw new Error('No offline signer on localWallet');

        // 5. Execute route

        setStep('signing_evm');
        let bridgeTxHash = '';

        await executeRoute({
          route: rawRoute,
          userAddresses,
          getCosmosSigner: buildCosmosSigner(rawSigner),
          getEvmSigner: buildEvmSigner(evmAddress, walletService.getProvider('evm')),
          slippageTolerancePercent,

          onTransactionBroadcast: async ({ txHash: hash, chainId: cid }) => {
            console.log(`[deposit] broadcast on ${cid}: ${hash}`);
            bridgeTxHash = hash;
            setTxHash(hash);
            setStep('pending_bridge');
          },
          onTransactionTracked: async ({ txHash: hash, chainId: cid }) => {
            console.log(`[deposit] tracked on ${cid}: ${hash}`);
          },
          onTransactionCompleted: async ({ txHash: hash, chainId: cid, status }) => {
            console.log(`[deposit] completed on ${cid}: ${hash}`, status);
          },
          onApproveAllowance: async (approvalInfo: any) => {
            console.log(
              `[deposit] ERC-20 approval ${approvalInfo.status} for ${approvalInfo.allowance?.tokenContract}`
            );
          },
        });

        // 6. Wait for IBC funds on dYdX chain wallet
        setStep('pending_bridge');
        const minUusdc = Math.floor(parseInt(rawRoute.amountOut ?? '0', 10) * 0.9);
        const walletBalance = await waitForDydxWalletBalance(dydxAddress, minUusdc);

        console.log('[deposit] dYdX wallet balance confirmed:', walletBalance, 'uusdc');

        // 7. Deposit dYdX wallet balance into subaccount 
        setStep('transferring');

        const client = await dydxWalletService.getCompositeClient();
        if (!client) throw new Error('dYdX client not connected');

        const subaccount = SubaccountInfo.forLocalWallet(
          localWallet,
          SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT
        );

        // Reserve 5,000 uusdc for future gas on the dYdX chain wallet
        const depositQuantums = walletBalance - 5_000;
        if (depositQuantums <= 0) throw new Error('dYdX wallet balance too low after fees');

        await client.validatorClient.post.deposit(subaccount, 0, Long.fromNumber(depositQuantums));

        await new Promise(r => setTimeout(r, 2_000));
        setStep('success');

        return { success: true, txHash: bridgeTxHash };
      } catch (err: any) {
        console.error('[deposit] error:', err);
        const userMessage = classifyDepositError(err);
        setError(userMessage);
        setStep('error');
        return { success: false, error: userMessage };
      }
    },
    []
  );

  const recoverDeposit = useCallback(
    async (
      amountQuantums: string,
      subaccountNumber = 0
    ): Promise<{ success: boolean; transactionHash?: string; error?: string }> => {
      setError(null);
      setStep('transferring');
      try {
        const result = await dydxWalletService.depositToSubaccount(
          amountQuantums,
          subaccountNumber
        );

        if (result.success) {
          setTxHash(result.transactionHash ?? null);
          setStep('success');
          setPendingDydxQuantums(null);
          setPendingNobleQuantums(null);
        } else {
          setError(result.error ?? 'Recovery failed');
          setStep('error');
        }
        return result;
      } catch (err: any) {
        const message = err.message ?? 'Recovery failed';
        setError(message);
        setStep('error');
        return { success: false, error: message };
      }
    },
    []
  );

  const checkPendingDeposit = useCallback(async () => {
    setIsCheckingPending(true);
    setPendingNobleQuantums(null);
    setPendingDydxQuantums(null);

    try {
      const dydxAddress =
        useWalletStore.getState().connectedWallets.evm?.dydxAddress ??
        useWalletStore.getState().connectedWallets.cosmos?.dydxAddress;

      if (!dydxAddress) return;

      const nobleAddress = dydxToNoble(dydxAddress);

      try {
        const res = await fetch(
          `https://rest.cosmos.directory/noble/cosmos/bank/v1beta1/balances/${nobleAddress}`
        );
        if (res.ok) {
          const { balances = [] } = await res.json();
          const uusdc = (balances as any[]).find(b => b.denom === NOBLE_USDC_DENOM);
          if (uusdc && BigInt(uusdc.amount) > 0n) {
            setPendingNobleQuantums(uusdc.amount);
          }
        }
      } catch (e) {
        console.warn('[deposit] Noble balance check failed:', e);
      }
      try {
        const res = await fetch(
          `https://dydx-rest.publicnode.com/cosmos/bank/v1beta1/balances/${dydxAddress}`
        );
        if (res.ok) {
          const { balances = [] } = await res.json();
          const coin = (balances as any[]).find(b => b.denom === DYDX_USDC_DENOM);
          if (coin) {
            const total = BigInt(coin.amount);
            const GAS_RESERVE = 10_000n;
            if (total > GAS_RESERVE) {
              setPendingDydxQuantums((total - GAS_RESERVE).toString());
            }
          }
        }
      } catch (e) {
        console.warn('[deposit] dYdX balance check failed:', e);
      }
    } catch (e) {
      console.error('[deposit] checkPendingDeposit error:', e);
    } finally {
      setIsCheckingPending(false);
    }
  }, []);


  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
    setTxHash(null);
    setRoute(null);
  }, []);


  const stepLabelMap: Record<DepositStep, string> = {
    idle: '',
    routing: 'Finding best route...',
    signing_evm: 'Sign in wallet...',
    pending_bridge: 'Bridging funds...',
    transferring: 'Moving to account...',
    success: 'Deposit complete',
    error: 'Deposit failed',
  };

  return {
    deposit,
    getRoute,
    reset,
    recoverDeposit,
    checkPendingDeposit,
    pendingNobleQuantums,
    pendingDydxQuantums,
    pendingQuantums: pendingNobleQuantums,
    dydxNativeQuantums: pendingDydxQuantums,
    isCheckingPending,
    step,
    stepLabel: stepLabelMap[step],
    error,
    txHash,
    route,
    isLoading: step !== 'idle' && step !== 'success' && step !== 'error',
    MIN_DEPOSIT_USDC,
  };
};
