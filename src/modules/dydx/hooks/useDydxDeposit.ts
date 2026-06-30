import { useCallback, useState } from 'react';

import { SubaccountInfo } from '@dydxprotocol/v4-client-js';
import { executeRoute, route as fetchSkipRoute } from '@skip-go/client';
import Long from 'long';

import { type NotificationType } from '../../../components/common/Notification';
import { switchOrAddChain } from '../../evm/utils/evmChainUtils';
import { walletService } from '../../walletconnect/services/walletService';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { getCurrentDepositTx, useTransactionStore } from '../hooks/useTransactionTracker';
import { storeSwapOrder } from '../../evm/service/evmTransactionStatusService';
import { getChainById } from '../../evm/utils/Chainregistry';
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
  computeSplit,
  dydxToNoble,
  fetchDydxWalletUsdcBalance,
  pollUntilBalance,
} from '../utils/skipBridgeUtils';

export const MIN_DEPOSIT_USDC = 0.1;
export const MIN_SUBACCOUNT_DEPOSIT_UUSDC = 10_000;
const DYDX_POLL_TIMEOUT_MS = 25 * 60 * 1_000;
const DYDX_POLL_INTERVAL_MS = 10_000;
const GAS_RESERVE_UUSDC = Math.round(NATIVE_WALLET_GAS_RESERVE_USD * 1_000_000);

let isAutoDepositingGlobal = false;

export type DepositStep =
  | 'idle'
  | 'routing'
  | 'signing_evm'
  | 'pending_bridge'
  | 'transferring'
  | 'success'
  | 'error';

export type DepositPhase =
  | 'idle'
  | 'switching-chain'
  | 'approving'
  | 'approved'
  | 'depositing'
  | 'polling'
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

interface DepositResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export const useDydxDeposit = () => {
  const [step, setStep] = useState<DepositStep>('idle');
  const [depositPhase, setDepositPhase] = useState<DepositPhase>('idle');
  const [failedPhase, setFailedPhase] = useState<DepositPhase | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [errorRetryable, setErrorRetryable] = useState(true);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [depositedAmount, setDepositedAmount] = useState<number | null>(null);
  const [route, setRoute] = useState<DepositRoute | null>(null);

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
      const chainId =
        evmChainId ??
        (useWalletStore.getState().connectedWallets.evm?.chainId as number | string) ??
        1;
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
          receivedAmount: Number.parseInt(raw.amountOut, 10) / 1e6,
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

  // Deposit
  const deposit = useCallback(
    async (
      assetSymbol: string,
      amountHuman: number,
      evmChainId?: number | string,
      goFast = false,
      slippageTolerancePercent = '1',
      tokenAddress?: string,
      isNative?: boolean,
      decimals?: number,
      onTransactionBroadcast?: (hash: string) => void
    ): Promise<DepositResult> => {
      setError(null);
      setErrorRetryable(true);
      setTxHash(null);
      setDepositedAmount(null);

      const capturedAssetSymbol = assetSymbol;
      const capturedAmount = amountHuman.toString();
      let bridgeTxHash = '';
      let currentPhase: DepositPhase = 'idle';

      try {
        const storeState = useWalletStore.getState();
        const evmWallet = storeState.connectedWallets.evm;
        const evmAddress = evmWallet?.address;
        const dydxAddress =
          evmWallet?.dydxAddress ?? storeState.connectedWallets.cosmos?.dydxAddress;

        if (!evmAddress) throw new Error('EVM wallet not connected');
        if (!dydxAddress) throw new Error('dYdX wallet not derived -- please onboard first');

        const chainId = evmChainId ?? (evmWallet?.chainId as number | string) ?? 1;

        if (chainId === 'pubnet' || chainId === 'testnet') {
          throw new Error('Stellar deposits must use the CCTP bridge panel.');
        }

        // Step 1 => chain switch (if needed)
        const isChainMismatch = Number(evmWallet?.chainId) !== Number(chainId);
        if (isChainMismatch) {
          currentPhase = 'switching-chain';
          setDepositPhase('switching-chain');
          setStep('routing');
        }

        const evmProvider = walletService.getProvider('evm');
        if (evmProvider) {
          try {
            await switchOrAddChain(evmProvider, chainId);
          } catch (switchErr: any) {
            throw new Error(`Failed to switch network: ${switchErr.message}`);
          }
        }

        // Step 2 => approving (ERC-20 allowance check happens inside executeRoute)
        currentPhase = 'approving';
        setDepositPhase('approving');
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
          throw new Error('Skip route returned no requiredChainAddresses.');
        }

        const userAddresses = buildUserAddresses(requiredChainIds, { evmAddress, dydxAddress });
        const localWallet = walletService.getSigningWallet();

        if (!localWallet) throw new Error('dYdX signing wallet not available');

        const rawSigner =
          localWallet.offlineSigner ?? (localWallet as any).signer ?? (localWallet as any).wallet;
        if (!rawSigner) throw new Error('No offline signer on localWallet');

        setStep('signing_evm');

        const estTime = rawRoute.estimatedRouteDurationSeconds
          ? skipApiService.formatDuration(rawRoute.estimatedRouteDurationSeconds)
          : undefined;

        await executeRoute({
          route: rawRoute,
          userAddresses,
          getCosmosSigner: buildCosmosSigner(rawSigner),
          getEvmSigner: buildEvmSigner(evmAddress, walletService.getProvider('evm')),
          slippageTolerancePercent,

          onApproveAllowance: async ({ status }) => {
            console.log(`[deposit] allowance status: ${status}`);
            if (status === 'completed') {
              currentPhase = 'approved';
              setDepositPhase('approved');
            }
          },

          onTransactionBroadcast: async ({ txHash: hash, chainId: cid }) => {
            console.log(`[deposit] broadcast on ${cid}: ${hash}`);
            bridgeTxHash = hash;
            setTxHash(hash);

            const isApproval = currentPhase === 'approving';

            if (!isApproval) {
              // Step 3 => depositing phase (deposit tx is now on-chain)
              currentPhase = 'depositing';
              setDepositPhase('depositing');
              setStep('pending_bridge');

              const currentWallets = useWalletStore.getState().connectedWallets;
              useTransactionStore.getState().setDepositTx({
                txHash: hash,
                chainId: String(cid),
                startedAt: Date.now(),
                status: 'pending',
                amount: capturedAmount,
                assetSymbol: capturedAssetSymbol,
                stepLabel: 'Deposit tx broadcast...',
                estimatedTime: estTime,
                requiredWallets: {
                  evm: currentWallets.evm?.address,
                  dydx: currentWallets.evm?.dydxAddress || currentWallets.cosmos?.dydxAddress,
                  cosmos: currentWallets.cosmos?.address,
                },
              });
            }

            // Store swap/bridge or approval order in backend so it appears in recent transactions
            const fromChainSymbol = getChainById(cid)?.symbol || 'unknown';
            if (isApproval) {
              storeSwapOrder({
                txHash: hash,
                walletAddress: evmAddress!,
                provider: 'DYDX',
                fromChain: fromChainSymbol,
                fromToken: capturedAssetSymbol,
                toChain: fromChainSymbol,
                toToken: capturedAssetSymbol,
                amountIn: capturedAmount,
                amountOut: capturedAmount,
                txType: 'Token Approval',
              }).catch(err => console.error('Failed to store dYdX deposit approval order:', err));
            } else {
              const confirmedReceiveAmount = rawRoute.amountOut
                ? (Number.parseInt(rawRoute.amountOut, 10) / 10 ** 6).toString()
                : capturedAmount;

              storeSwapOrder({
                txHash: hash,
                walletAddress: evmAddress!,
                provider: 'DYDX',
                fromChain: fromChainSymbol,
                fromToken: capturedAssetSymbol,
                toChain: 'SRB',
                toToken: 'USDC',
                amountIn: capturedAmount,
                amountOut: confirmedReceiveAmount,
                txType: 'Bridge',
              }).catch(err => console.error('Failed to store dYdX deposit order:', err));
            }

            if (onTransactionBroadcast) onTransactionBroadcast(hash);
          },
        });

        // Step 4 => polling — wait for dYdX wallet balance to arrive
        currentPhase = 'polling';
        setDepositPhase('polling');
        setStep('transferring');

        let preExistingWalletUusdc = 0;
        try {
          preExistingWalletUusdc = await fetchDydxWalletUsdcBalance(dydxAddress);
        } catch {
          preExistingWalletUusdc = 0;
        }

        const expectedAmountUusdc = parseInt(rawRoute.amountOut ?? '0', 10);
        const minPollTarget = Math.max(
          preExistingWalletUusdc + Math.floor(expectedAmountUusdc * 0.9),
          GAS_RESERVE_UUSDC
        );

        console.log(
          `[deposit] polling dYdX wallet: pre=${preExistingWalletUusdc} need>=${minPollTarget} (timeout ${DYDX_POLL_TIMEOUT_MS / 60000} min)`
        );

        const walletBalanceAfter = await pollUntilBalance(
          () => fetchDydxWalletUsdcBalance(dydxAddress),
          minPollTarget,
          DYDX_POLL_TIMEOUT_MS,
          DYDX_POLL_INTERVAL_MS,
          'dYdX'
        );

        const incomingUusdc = Math.max(0, walletBalanceAfter - preExistingWalletUusdc);
        const { depositUusdc } = computeSplit(incomingUusdc, preExistingWalletUusdc);

        if (depositUusdc < MIN_SUBACCOUNT_DEPOSIT_UUSDC) {
          console.warn(
            `[deposit] depositUusdc (${depositUusdc}) below dust threshold — skipping subaccount deposit.`
          );
          setDepositedAmount(0);
          await new Promise(r => setTimeout(r, 1_000));
          currentPhase = 'success';
          setDepositPhase('success');
          setStep('success');

          const currentTx = getCurrentDepositTx();
          if (currentTx && (currentTx.status === 'pending' || currentTx.status === 'awaiting-signature')) {
            useTransactionStore.getState().setDepositTx({ ...currentTx, status: 'success' });
          }
          return { success: true, txHash: bridgeTxHash };
        }

        // Step 5 => subaccount deposit (dYdX-internal: wallet → subaccount)
        console.log(`[deposit] calling post.deposit with ${depositUusdc} uusdc`);

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
        if (currentTx && (currentTx.status === 'pending' || currentTx.status === 'awaiting-signature')) {
          useTransactionStore.getState().setDepositTx({ ...currentTx, status: 'success' });
        }

        currentPhase = 'success';
        setDepositPhase('success');
        setStep('success');

        return { success: true, txHash: bridgeTxHash };
      } catch (err: any) {
        console.error('[deposit] error:', err);
        const classified = classifyBridgeError(err);

        if (!bridgeTxHash) {
          useTransactionStore.getState().clearDepositTx();
        }

        setNotification({ type: 'error', title: 'Deposit Failed', message: classified.message });
        setError(classified.message);
        setErrorRetryable(classified.retryable);
        setFailedPhase(currentPhase);
        setDepositPhase('error');
        setStep('error');
        return { success: false, error: classified.message };
      }
    },
    []
  );

  // checkPendingDeposit
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
        if (total > reserve) {
          const amountToDeposit = total - reserve;
          setPendingDydxQuantums(amountToDeposit.toString());

          const activeTx = getCurrentDepositTx();
          const hasActivePending = activeTx && activeTx.status === 'pending';

          if (
            amountToDeposit >= BigInt(MIN_SUBACCOUNT_DEPOSIT_UUSDC) &&
            !isAutoDepositingGlobal &&
            !hasActivePending
          ) {
            isAutoDepositingGlobal = true;
            console.log(`[deposit] Auto-depositing ${amountToDeposit} uusdc to subaccount`);

            // Execute in background
            (async () => {
              try {
                const localWallet = walletService.getSigningWallet();
                if (!localWallet) throw new Error('dYdX signing wallet not available');

                const client = await dydxWalletService.getCompositeClient();
                if (!client) throw new Error('dYdX client not connected');

                const subaccount = SubaccountInfo.forLocalWallet(
                  localWallet,
                  SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT
                );

                await client.validatorClient.post.deposit(
                  subaccount,
                  0,
                  Long.fromNumber(Number(amountToDeposit))
                );

                console.log('[deposit] Auto-deposit success!');
                setNotification({
                  type: 'success',
                  title: 'Funds Deposited',
                  message: `${(Number(amountToDeposit) / 1e6).toFixed(2)} USDC from your wallet has been credited to your trading account.`,
                });
                setPendingDydxQuantums(null);
              } catch (autoErr: any) {
                console.error('[deposit] Auto-deposit execution error:', autoErr);
              } finally {
                isAutoDepositingGlobal = false;
              }
            })();
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

  // reset
  const reset = useCallback(() => {
    setStep('idle');
    setDepositPhase('idle');
    setFailedPhase(null);
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
    pending_bridge: 'Deposit broadcast...',
    transferring: 'Crediting account...',
    success: 'Deposit complete',
    error: 'Deposit failed',
  };

  return {
    deposit,
    getRoute,
    reset,
    checkPendingDeposit,
    pendingNobleQuantums,
    pendingDydxQuantums,
    pendingQuantums: pendingNobleQuantums,
    dydxNativeQuantums: pendingDydxQuantums,
    isCheckingPending,
    step,
    depositPhase,
    failedPhase,
    stepLabel: stepLabelMap[step],
    error,
    errorRetryable,
    txHash,
    route,
    depositedAmount,
    isLoading: depositPhase !== 'idle' && depositPhase !== 'success' && depositPhase !== 'error',
    MIN_DEPOSIT_USDC,
    MIN_SUBACCOUNT_DEPOSIT_UUSDC,
    NATIVE_WALLET_GAS_RESERVE_USD,
    GAS_RESERVE_UUSDC,
    notification,
    clearNotification,
  };
};
