import { useCallback, useState } from 'react';

import { SubaccountInfo } from '@dydxprotocol/v4-client-js';
import { executeRoute, route as fetchSkipRoute } from '@skip-go/client';
import Long from 'long';

import { walletService } from '../../walletconnect/services/walletService';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { dydxWalletService } from '../service/dydxWalletService';
import { skipApiService } from '../service/skipApiService';
import { SUBACCOUNT_CONSTANTS } from '../types/trading.types';
import { classifyBridgeError } from '../utils/bridgeErrorUtils';
import {
  DYDX_CHAIN_ID,
  DYDX_USDC_DENOM,
  NATIVE_WALLET_GAS_RESERVE_USD,
  buildCosmosSigner,
  buildEvmSigner,
  buildUserAddresses,
  dydxToNoble,
  fetchDydxWalletUsdcBalance,
} from '../utils/skipBridgeUtils';

export const MIN_DEPOSIT_USDC = 3;

const MIN_SUBACCOUNT_DEPOSIT_UUSDC = 10_000;

const DYDX_POLL_TIMEOUT_MS = 180_000;
const DYDX_POLL_INTERVAL_MS = 5_000;

const GAS_RESERVE_UUSDC = Math.round(NATIVE_WALLET_GAS_RESERVE_USD * 1_000_000);

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
 * Computes how much to keep in the dYdX wallet (gas reserve) and how much to
 * deposit into the subaccount.
 *
 * Rule:
 *   - Always keep exactly GAS_RESERVE_UUSDC (≈ $1.50) in the wallet.
 *   - If the current wallet balance already covers the reserve, deposit only
 *     the excess above the reserve.
 *   - If depositing would leave the wallet under the reserve, keep the reserve
 *     first and deposit only the remainder.
 *   - Never deposit a negative or dust amount.
 */
function computeSplit(walletBalanceUusdc: number): { keepUusdc: number; depositUusdc: number } {
  const keep = GAS_RESERVE_UUSDC;
  const deposit = Math.max(0, walletBalanceUusdc - keep);
  return { keepUusdc: keep, depositUusdc: deposit };
}

async function waitForDydxWalletBalance(dydxAddress: string, minUusdc: number): Promise<number> {
  const deadline = Date.now() + DYDX_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const bal = await fetchDydxWalletUsdcBalance(dydxAddress);
      console.log(`[deposit] dYdX wallet: ${bal} uusdc (need >= ${minUusdc})`);
      if (bal >= minUusdc) return bal;
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

export const useDydxDeposit = () => {
  const [step, setStep] = useState<DepositStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [errorRetryable, setErrorRetryable] = useState(true);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [route, setRoute] = useState<DepositRoute | null>(null);
  const [depositedAmount, setDepositedAmount] = useState<number | null>(null);

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
      setErrorRetryable(true);
      setTxHash(null);
      setDepositedAmount(null);

      try {
        const storeState = useWalletStore.getState();
        const evmWallet = storeState.connectedWallets.evm;
        const evmAddress = evmWallet?.address;
        const dydxAddress =
          evmWallet?.dydxAddress ?? storeState.connectedWallets.cosmos?.dydxAddress;

        if (!evmAddress) throw new Error('EVM wallet not connected');
        if (!dydxAddress) throw new Error('dYdX wallet not derived -- please onboard first');

        const chainId = evmChainId ?? Number(evmWallet?.chainId ?? 1);

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

        const requiredChainIds: string[] = rawRoute.requiredChainAddresses ?? [];
        if (requiredChainIds.length === 0) {
          throw new Error(
            'Skip route returned no requiredChainAddresses -- cannot build userAddresses.'
          );
        }

        const userAddresses = buildUserAddresses(requiredChainIds, { evmAddress, dydxAddress });
        console.log('[deposit] requiredChainAddresses:', requiredChainIds);
        console.log('[deposit] userAddresses:', userAddresses);

        const localWallet = walletService.getSigningWallet();
        if (!localWallet) throw new Error('dYdX signing wallet not available');

        const rawSigner =
          localWallet.offlineSigner ?? (localWallet as any).signer ?? (localWallet as any).wallet;
        if (!rawSigner) throw new Error('No offline signer on localWallet');

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
        });

        setStep('transferring');

        const expectedAmountUusdc = parseInt(rawRoute.amountOut ?? '0', 10);
        const minExpectedUusdc = Math.max(
          Math.floor(expectedAmountUusdc * 0.9),
          GAS_RESERVE_UUSDC + MIN_SUBACCOUNT_DEPOSIT_UUSDC
        );

        const walletBalance = await waitForDydxWalletBalance(dydxAddress, minExpectedUusdc);
        console.log('[deposit] dYdX wallet balance confirmed:', walletBalance, 'uusdc');

        const { keepUusdc, depositUusdc } = computeSplit(walletBalance);

        console.log(
          `[deposit] wallet=${walletBalance} keep=${keepUusdc} deposit=${depositUusdc} ` +
          `(reserve=${GAS_RESERVE_UUSDC} uusdc)`
        );

        if (depositUusdc < MIN_SUBACCOUNT_DEPOSIT_UUSDC) {
          console.warn(
            `[deposit] depositUusdc (${depositUusdc}) below dust threshold -- ` +
            `skipping subaccount deposit. Wallet gas reserve funded.`
          );
          setDepositedAmount(0);
          await new Promise(r => setTimeout(r, 1_000));
          setStep('success');
          return { success: true, txHash: bridgeTxHash };
        }

        const client = await dydxWalletService.getCompositeClient();
        if (!client) throw new Error('dYdX client not connected');

        const subaccount = SubaccountInfo.forLocalWallet(
          localWallet,
          SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT
        );

        await client.validatorClient.post.deposit(
          subaccount,
          0,
          Long.fromNumber(Math.floor(depositUusdc))
        );

        console.log(`[deposit] deposited ${depositUusdc} uusdc to subaccount`);

        setDepositedAmount(depositUusdc / 1e6);
        await new Promise(r => setTimeout(r, 2_000));
        setStep('success');

        return { success: true, txHash: bridgeTxHash };
      } catch (err: any) {
        console.error('[deposit] error:', err);
        const classified = classifyBridgeError(err);
        setError(classified.message);
        setErrorRetryable(classified.retryable);
        setStep('error');
        return { success: false, error: classified.message };
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
          const uusdc = (balances as any[]).find(b => b.denom === 'uusdc');
          if (uusdc && BigInt(uusdc.amount) > 0n) setPendingNobleQuantums(uusdc.amount);
        }
      } catch (e) {
        console.warn('[deposit] Noble balance check failed:', e);
      }

      try {
        const walletBal = await fetchDydxWalletUsdcBalance(dydxAddress);
        const total = BigInt(walletBal);
        const reserve = BigInt(GAS_RESERVE_UUSDC);
        if (total > reserve) setPendingDydxQuantums((total - reserve).toString());
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
    setErrorRetryable(true);
    setTxHash(null);
    setRoute(null);
    setDepositedAmount(null);
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
    errorRetryable,
    txHash,
    route,
    depositedAmount,
    isLoading: step !== 'idle' && step !== 'success' && step !== 'error',
    MIN_DEPOSIT_USDC,
    NATIVE_WALLET_GAS_RESERVE_USD,
    GAS_RESERVE_UUSDC,
  };
};