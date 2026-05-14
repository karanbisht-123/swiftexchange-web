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
import { useTransactionStore, getCurrentDepositTx } from '../hooks/useTransactionTracker';
import { type NotificationType } from '../../../components/common/Notification';

export const MIN_DEPOSIT_USDC = 1;

export const MIN_SUBACCOUNT_DEPOSIT_UUSDC = 10_000;

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
  estimatedDurationSeconds: number;
  fee: number;
  receivedAmount: number;
  usdAmountOut: string;
}

interface DepositNotification {
  type: NotificationType;
  title: string;
  message: string;
}
function computeSplit(
  incomingUusdc: number,
  preExistingUusdc: number,
): { keepUusdc: number; depositUusdc: number } {
  const shortfall = Math.max(0, GAS_RESERVE_UUSDC - preExistingUusdc);
  const keepUusdc = Math.min(shortfall, incomingUusdc);
  const depositUusdc = Math.max(0, incomingUusdc - keepUusdc);
  return { keepUusdc, depositUusdc };
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
  const [notification, setNotification] = useState<DepositNotification | null>(null);
  const clearNotification = useCallback(() => setNotification(null), []);
  const getRoute = useCallback(
    async (
      assetSymbol: string,
      amountHuman: number,
      evmChainId?: number | string,
      goFast = false,
      tokenAddress?: string,
      isNative?: boolean,
      decimals?: number
    ): Promise<DepositRoute | null> => {
      // Stellar assets go through the CCTP panel, not Skip route
      const chainId = evmChainId ?? (useWalletStore.getState().connectedWallets.evm?.chainId as number | string ?? 1);
      if (chainId === 'pubnet' || chainId === 'testnet') return null;

      setStep('routing');
      setError(null);
      try {
        const raw = await skipApiService.getDepositRoute(
          assetSymbol,
          chainId,
          amountHuman,
          goFast,
          tokenAddress,
          isNative,
          decimals
        );

        const result: DepositRoute = {
          estimatedTime: skipApiService.formatDuration(raw.estimatedDurationSeconds),
          estimatedDurationSeconds: raw.estimatedDurationSeconds,
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
      evmChainId?: number | string,
      goFast = false,
      slippageTolerancePercent = '1',
      tokenAddress?: string,
      isNative?: boolean,
      decimals?: number
    ): Promise<{ success: boolean; txHash?: string; error?: string }> => {
      setError(null);
      setErrorRetryable(true);
      setTxHash(null);
      setDepositedAmount(null);

      let capturedAssetSymbol = assetSymbol;
      let capturedAmount = amountHuman.toString();
      let bridgeTxHash = '';

      try {
        const storeState = useWalletStore.getState();
        const evmWallet = storeState.connectedWallets.evm;
        const evmAddress = evmWallet?.address;
        const dydxAddress =
          evmWallet?.dydxAddress ?? storeState.connectedWallets.cosmos?.dydxAddress;

        if (!evmAddress) throw new Error('EVM wallet not connected');
        if (!dydxAddress) throw new Error('dYdX wallet not derived -- please onboard first');

        const chainId = evmChainId ?? (evmWallet?.chainId as number | string ?? 1);

        // Stellar assets are handled by the CCTP panel — never send them through Skip
        if (chainId === 'pubnet' || chainId === 'testnet') {
          throw new Error('Stellar deposits must use the CCTP bridge panel.');
        }

        setStep('routing');

        const sourceDenom = skipApiService.getSourceDenomForAsset(
          assetSymbol,
          chainId,
          tokenAddress,
          isNative
        );
        const amountIn = skipApiService.toAmountIn(amountHuman, assetSymbol, decimals, chainId);

        const rawRoute = await fetchSkipRoute({
          sourceAssetDenom: sourceDenom,
          sourceAssetChainId: String(chainId),
          destAssetDenom: DYDX_USDC_DENOM,
          destAssetChainId: DYDX_CHAIN_ID,
          amountIn,
          cumulativeAffiliateFeeBps: '0',
          allowUnsafe: true,
          smartRelay: true,
          smartSwapOptions: { splitRoutes: true, evmSwaps: true },
          experimentalFeatures: ['hyperlane', 'stargate', 'eureka', 'layer_zero'] as any,
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

        const currentWallets = useWalletStore.getState().connectedWallets;
        const requiredWallets = {
          evm: currentWallets.evm?.address,
          dydx: currentWallets.evm?.dydxAddress || currentWallets.cosmos?.dydxAddress,
          cosmos: currentWallets.cosmos?.address
        };

        useTransactionStore.getState().setDepositTx({
          txHash: null,
          chainId: String(chainId),
          startedAt: Date.now(),
          status: 'pending',
          amount: capturedAmount,
          assetSymbol: capturedAssetSymbol,
          stepLabel: 'Sign in wallet...',
          requiredWallets,
        });

        setStep('signing_evm');

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

            const current = getCurrentDepositTx();
            useTransactionStore.getState().setDepositTx({
              txHash: hash,
              chainId: String(cid),
              startedAt: current?.startedAt ?? Date.now(),
              status: 'pending',
              amount: capturedAmount,
              assetSymbol: capturedAssetSymbol,
              stepLabel: 'Bridging funds...',
            });
          },
        });

        setStep('transferring');
        let preExistingWalletUusdc = 0;
        try {
          preExistingWalletUusdc = await fetchDydxWalletUsdcBalance(dydxAddress);
        } catch {
          preExistingWalletUusdc = 0;
        }
        console.log(`[deposit] pre-existing wallet balance: ${preExistingWalletUusdc} uusdc`);

        const expectedAmountUusdc = parseInt(rawRoute.amountOut ?? '0', 10);
        const minPollTarget = Math.max(
          preExistingWalletUusdc + Math.floor(expectedAmountUusdc * 0.9),
          GAS_RESERVE_UUSDC,
        );

        const walletBalanceAfter = await waitForDydxWalletBalance(dydxAddress, minPollTarget);
        console.log('[deposit] dYdX wallet balance after bridge:', walletBalanceAfter, 'uusdc');
        const incomingUusdc = Math.max(0, walletBalanceAfter - preExistingWalletUusdc);

        const { keepUusdc, depositUusdc } = computeSplit(incomingUusdc, preExistingWalletUusdc);

        console.log(
          `[deposit] incoming=${incomingUusdc} keep=${keepUusdc} deposit=${depositUusdc} ` +
          `preExisting=${preExistingWalletUusdc} reserve=${GAS_RESERVE_UUSDC} uusdc`
        );

        if (depositUusdc < MIN_SUBACCOUNT_DEPOSIT_UUSDC) {
          console.warn(
            `[deposit] depositUusdc (${depositUusdc}) below dust threshold — ` +
            `gas reserve funded, skipping subaccount deposit.`
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

        console.log(`[deposit] deposited ${depositUusdc} uusdc to subaccount (kept ${keepUusdc} uusdc for gas)`);

        setDepositedAmount(depositUusdc / 1e6);
        setNotification({
          type: 'success',
          title: 'Deposit Complete',
          message: `${(depositUusdc / 1e6).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} USDC added to your trading account.`,
        });
        const currentTx = getCurrentDepositTx();
        if (currentTx && currentTx.status === 'pending') {
          useTransactionStore.getState().setDepositTx({ ...currentTx, status: 'success' });
        }
        setStep('success');

        return { success: true, txHash: bridgeTxHash };
      } catch (err: any) {
        console.error('[deposit] error:', err);
        const classified = classifyBridgeError(err);

        if (!bridgeTxHash) {
          useTransactionStore.getState().clearDepositTx();
        }
        setNotification({
          type: 'error',
          title: 'Deposit Failed',
          message: classified.message,
        });
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
          setNotification({
            type: 'success',
            title: 'Deposit Recovered',
            message: `${(parseInt(amountQuantums) / 1e6).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} USDC added to your trading account.`,
          });
        } else {
          setError(result.error ?? 'Recovery failed');
          setStep('error');
          setNotification({
            type: 'error',
            title: 'Recovery Failed',
            message: result.error ?? 'Recovery failed',
          });
        }
        return result;
      } catch (err: any) {
        const message = err.message ?? 'Recovery failed';
        setError(message);
        setStep('error');
        setNotification({
          type: 'error',
          title: 'Recovery Failed',
          message,
        });
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
    MIN_SUBACCOUNT_DEPOSIT_UUSDC,
    NATIVE_WALLET_GAS_RESERVE_USD,
    GAS_RESERVE_UUSDC,
    notification,
    clearNotification,
  };
};