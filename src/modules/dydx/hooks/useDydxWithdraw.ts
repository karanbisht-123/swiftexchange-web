import { useCallback, useState } from 'react';

import { StargateClient } from '@cosmjs/stargate';
import { SubaccountInfo } from '@dydxprotocol/v4-client-js';
import { executeRoute, route as fetchSkipRoute } from '@skip-go/client';
import Long from 'long';

import { walletService } from '../../walletconnect/services/walletService';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { dydxSubaccountService } from '../service/dydxSubaccountService';
import { dydxWalletService } from '../service/dydxWalletService';
import { SUBACCOUNT_CONSTANTS } from '../types/trading.types';
import { classifyBridgeError } from '../utils/bridgeErrorUtils';
import {
  NATIVE_WALLET_GAS_RESERVE_UUSDC,
  NOBLE_CHAIN_ID,
  NOBLE_USDC_DENOM,
  SKIP_BRIDGES,
  // getUsdcAddress,
  getEvmSourceDenom,
  buildCosmosSigner,
  buildEvmSigner,
  buildUserAddresses,
  dydxToNoble,
  fetchDydxWalletUsdcBalance,
  sumNobleFeesUusdc,
} from '../utils/skipBridgeUtils';

const NOBLE_RPC_ENDPOINT = 'https://noble-rpc.polkachu.com:443';
const NOBLE_POLL_TIMEOUT_MS = 120_000;
const NOBLE_POLL_INTERVAL_MS = 5_000;

const DYDX_TO_NOBLE_PORT = 'transfer';
const DYDX_TO_NOBLE_CHANNEL = 'channel-0';
const DYDX_USDC_IBC_DENOM = 'ibc/8E27BA2D5493AF5636760E354E46004562C46AB7EC0CC4C1CA14E9E20E2545B5';

const IBC_MAX_RETRIES = 10;
const IBC_RETRY_DELAY_MS = 3_000;

export type WithdrawStep =
  | 'idle'
  | 'routing'
  | 'checking_gas'
  | 'transferring_to_main'
  | 'signing'
  | 'ibc_to_noble'
  | 'waiting_noble'
  | 'bridging'
  | 'pending'
  | 'success'
  | 'error';

function formatTxHash(hashRaw: unknown): string {
  if (typeof hashRaw === 'string') return hashRaw;
  if (hashRaw instanceof Uint8Array || Array.isArray(hashRaw)) {
    return Array.from(hashRaw as number[])
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return 'submitted';
}

async function waitForNobleBalance(
  nobleAddress: string,
  minAmountUusdc: number,
  onTick?: (balance: number) => void
): Promise<number> {
  const client = await StargateClient.connect(NOBLE_RPC_ENDPOINT);
  const deadline = Date.now() + NOBLE_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const coin = await client.getBalance(nobleAddress, NOBLE_USDC_DENOM);
    const bal = parseInt(coin?.amount ?? '0', 10);
    onTick?.(bal);
    console.log(`[withdraw] Noble balance: ${bal} uusdc (need >= ${minAmountUusdc})`);
    if (bal >= minAmountUusdc) return bal;
    await new Promise(r => setTimeout(r, NOBLE_POLL_INTERVAL_MS));
  }

  throw new Error(
    `Timed out waiting for Noble funds. ` +
    `Check https://www.mintscan.io/noble/address/${nobleAddress}`
  );
}

function isTransientBroadcastError(err: any): boolean {
  const msg = (err?.message ?? '').toLowerCase();
  return (
    (msg.includes('broadcasterror') || msg.includes('broadcasting transaction failed')) &&
    (msg.includes('smaller than') || msg.includes('insufficient funds'))
  );
}

export const useDydxWithdraw = () => {
  const [step, setStep] = useState<WithdrawStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [errorRetryable, setErrorRetryable] = useState(true);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [bridgeTxHash, setBridgeTxHash] = useState<string | null>(null);
  const [bridgeTxChainId, setBridgeTxChainId] = useState<string | null>(null);
  const [nobleBalance, setNobleBalance] = useState<number>(0);
  const [withdrawnAmount, setWithdrawnAmount] = useState<number | null>(null);

  const isWithdrawing = step !== 'idle' && step !== 'success' && step !== 'error';

  const _bridgeFromNoble = useCallback(
    async (
      nobleBalUusdc: number,
      nobleAddress: string,
      dydxAddress: string,
      evmAddress: string,
      evmWallet: any,
      destChainId: number | undefined,
      rawSigner: any,
      onBridgeTxHash: (hash: string, chainId: string) => void
    ): Promise<{ success: boolean; transactionHash?: string; error?: string }> => {
      const chainId = destChainId ?? Number(evmWallet?.chainId ?? 1);
      const destAssetDenom = getEvmSourceDenom('USDC', chainId);

      const baseRouteParams = {
        sourceAssetDenom: NOBLE_USDC_DENOM,
        sourceAssetChainId: NOBLE_CHAIN_ID,
        destAssetDenom,
        destAssetChainId: String(chainId),
        cumulativeAffiliateFeeBps: '0',
        allowUnsafe: false,
        smartRelay: true,
        bridges: SKIP_BRIDGES as any,
        allowMultiTx: true,
      };

      setStep('routing');

      const probeRoute = await fetchSkipRoute({
        ...baseRouteParams,
        amountIn: nobleBalUusdc.toString(),
      });
      if (!probeRoute) throw new Error('No probe route returned from Skip');

      const estimatedFeesUusdc = sumNobleFeesUusdc(probeRoute.estimatedFees as any[]);
      const feeBuffer = Math.ceil(estimatedFeesUusdc * 1.2) + 5_000;
      const safeAmountIn = nobleBalUusdc - feeBuffer;

      console.log(
        `[bridge] balance=${nobleBalUusdc} fees=${estimatedFeesUusdc} buffer=${feeBuffer} safeAmountIn=${safeAmountIn}`
      );

      if (safeAmountIn <= 0) {
        throw new Error(
          `Noble balance (${nobleBalUusdc} uusdc) too low to cover bridge fees ` +
          `(~${feeBuffer} uusdc). Need at least ${feeBuffer + 1} uusdc.`
        );
      }

      const rawRoute = await fetchSkipRoute({
        ...baseRouteParams,
        amountIn: safeAmountIn.toString(),
      });
      if (!rawRoute) throw new Error('No withdrawal route returned from Skip');

      setStep('bridging');

      const userAddresses = buildUserAddresses(rawRoute.requiredChainAddresses as string[], {
        evmAddress,
        dydxAddress,
        nobleAddress,
      });

      let finalBridgeTxHash = '';

      await executeRoute({
        route: rawRoute,
        userAddresses,
        getCosmosSigner: buildCosmosSigner(rawSigner),
        getEvmSigner: buildEvmSigner(evmAddress, walletService.getProvider('evm')),
        slippageTolerancePercent: '1',
        onTransactionBroadcast: async ({ chainId: cid, txHash: hash }: any) => {
          finalBridgeTxHash = hash;
          setBridgeTxHash(hash);
          setBridgeTxChainId(String(cid));
          setTxHash(hash);
          onBridgeTxHash(hash, String(cid));
          console.log(`[bridge] broadcast on ${cid}: ${hash}`);
        },
      } as any);

      setStep('pending');
      await new Promise(r => setTimeout(r, 2_000));
      setStep('success');
      return { success: true, transactionHash: finalBridgeTxHash };
    },
    []
  );

  const withdraw = useCallback(
    async (
      amount: string,
      fromSubaccount = SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT,
      toAddress?: string,
      destChainId?: number
    ): Promise<{ success: boolean; transactionHash?: string; error?: string }> => {
      setError(null);
      setErrorRetryable(true);
      setTxHash(null);
      setBridgeTxHash(null);
      setBridgeTxChainId(null);
      setNobleBalance(0);
      setWithdrawnAmount(null);

      try {
        const storeState = useWalletStore.getState();
        const evmWallet = storeState.connectedWallets.evm;
        const evmAddress = toAddress ?? evmWallet?.address;
        const dydxAddress =
          evmWallet?.dydxAddress ?? storeState.connectedWallets.cosmos?.dydxAddress;

        if (!evmAddress) throw new Error('EVM wallet not connected');
        if (!dydxAddress) throw new Error('dYdX address not available');

        const nobleAddress = dydxToNoble(dydxAddress);

        const client = await dydxWalletService.getCompositeClient();
        const localWallet = walletService.getSigningWallet();
        if (!client || !localWallet) throw new Error('dYdX client or signing wallet not available');

        const amountValue = parseFloat(amount);
        if (isNaN(amountValue) || amountValue <= 0) {
          throw new Error('Withdraw amount must be greater than 0');
        }
        const amountInQuantums = Math.floor(amountValue * 1e6);

        const rawSigner =
          localWallet.offlineSigner ?? (localWallet as any).signer ?? (localWallet as any).wallet;
        if (!rawSigner) throw new Error('No offline signer available');

        if (fromSubaccount !== SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT) {
          setStep('transferring_to_main');
          const transferResult = await dydxSubaccountService.transfer(
            fromSubaccount,
            SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT,
            (amountValue + 0.05).toString()
          );
          if (!transferResult.success) {
            throw new Error(transferResult.error ?? 'Failed to move funds to main account');
          }
          await new Promise(r => setTimeout(r, 2_000));
        }

        const subaccount = SubaccountInfo.forLocalWallet(
          localWallet,
          SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT
        );

        // ── Minimum-balance handling (same-transaction top-up)
        // Check how much USDC the native wallet currently holds.
        // If it's below the required gas reserve (~$1.24), we pull the shortfall
        // OUT of the subaccount in the same withdraw() call — no separate tx.
        // This matches dYdX's internal fund-allocation approach.
        const walletUusdc = await fetchDydxWalletUsdcBalance(dydxAddress);
        const shortfallUusdc = Math.max(0, NATIVE_WALLET_GAS_RESERVE_UUSDC - walletUusdc);

        console.log(
          `[gas] wallet=${walletUusdc} uusdc | ` +
          `reserve=${NATIVE_WALLET_GAS_RESERVE_UUSDC} uusdc | ` +
          `shortfall=${shortfallUusdc} uusdc`
        );

        // withdrawQuantums = user's requested amount + whatever the wallet still
        // needs to reach the gas reserve.  The gas-reserve portion stays in the
        // native wallet; only amountInQuantums continues to Noble → EVM.
        const withdrawQuantums = amountInQuantums + shortfallUusdc;

        setStep('signing');

        const withdrawResult = await client.validatorClient.post.withdraw(
          subaccount,
          0,
          Long.fromString(withdrawQuantums.toString())
        );
        setTxHash(formatTxHash((withdrawResult as any)?.hash));
        {
          const POLL_INTERVAL_MS = 3_000;
          const POLL_TIMEOUT_MS = 60_000;
          // We expect the wallet balance to grow by at least shortfallUusdc
          // (the user's amountInQuantums will be sent onwards via IBC).
          const requiredWalletBalance = walletUusdc + shortfallUusdc;
          const deadline = Date.now() + POLL_TIMEOUT_MS;

          console.log(`[withdraw] Waiting for native wallet >= ${requiredWalletBalance} uusdc...`);

          let settled = false;
          while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
            const currentBal = await fetchDydxWalletUsdcBalance(dydxAddress);
            console.log(
              `[withdraw] Native wallet: ${currentBal} uusdc (need >= ${requiredWalletBalance})`
            );
            if (currentBal >= requiredWalletBalance) {
              settled = true;
              break;
            }
          }

          if (!settled) {
            throw new Error(
              `Withdrawal did not reflect in native wallet within ${POLL_TIMEOUT_MS / 1000}s. ` +
              `Check https://www.mintscan.io/dydx/address/${dydxAddress}`
            );
          }
        }

        setStep('ibc_to_noble');

        const timeoutTimestamp = (BigInt(Date.now() + 10 * 60 * 1_000) * 1_000_000n).toString();
        const ibcMsg = {
          typeUrl: '/ibc.applications.transfer.v1.MsgTransfer',
          value: {
            sourcePort: DYDX_TO_NOBLE_PORT,
            sourceChannel: DYDX_TO_NOBLE_CHANNEL,
            // IBC transfer only sends the user's requested amount — the
            // shortfallUusdc stays in the native wallet as the gas reserve.
            token: { denom: DYDX_USDC_IBC_DENOM, amount: amountInQuantums.toString() },
            sender: dydxAddress,
            receiver: nobleAddress,
            timeoutHeight: { revisionNumber: '0', revisionHeight: '0' },
            timeoutTimestamp,
            memo: '',
          },
        };

        let ibcResult: any;
        let ibcSent = false;

        for (let attempt = 1; attempt <= IBC_MAX_RETRIES; attempt++) {
          try {
            ibcResult = await client.validatorClient.post.send(
              subaccount,
              () => Promise.resolve([ibcMsg]),
              false
            );
            ibcSent = true;
            break;
          } catch (err: any) {
            if (isTransientBroadcastError(err) && attempt < IBC_MAX_RETRIES) {
              console.log(
                `[withdraw] RPC lag -- retrying IBC send (${attempt}/${IBC_MAX_RETRIES})...`
              );
              await new Promise(r => setTimeout(r, IBC_RETRY_DELAY_MS));
              continue;
            }
            throw err;
          }
        }

        if (!ibcSent) {
          throw new Error('IBC send failed after all retries. Please check your dYdX wallet.');
        }

        console.log('[withdraw] IBC tx:', formatTxHash((ibcResult as any)?.hash));

        setStep('waiting_noble');

        const minNobleBalance = Math.floor(amountInQuantums * 0.9);
        const finalNobleBalance = await waitForNobleBalance(nobleAddress, minNobleBalance, bal =>
          setNobleBalance(bal)
        );
        console.log('[withdraw] Noble balance confirmed:', finalNobleBalance, 'uusdc');
        setWithdrawnAmount(parseFloat(amount));

        return await _bridgeFromNoble(
          finalNobleBalance,
          nobleAddress,
          dydxAddress,
          evmAddress,
          evmWallet,
          destChainId,
          rawSigner,
          (hash, chainId) => {
            setBridgeTxHash(hash);
            setBridgeTxChainId(chainId);
          }
        );
      } catch (err: any) {
        console.error('[withdraw] error:', err);
        const classified = classifyBridgeError(err);
        setError(classified.message);
        setErrorRetryable(classified.retryable);
        setStep('error');
        return { success: false, error: classified.message };
      }
    },
    [_bridgeFromNoble]
  );

  const recoverNobleBalance = useCallback(
    async (
      toAddress?: string,
      destChainId?: number
    ): Promise<{ success: boolean; transactionHash?: string; error?: string }> => {
      setError(null);
      setTxHash(null);
      setBridgeTxHash(null);
      setBridgeTxChainId(null);

      try {
        const storeState = useWalletStore.getState();
        const evmWallet = storeState.connectedWallets.evm;
        const evmAddress = toAddress ?? evmWallet?.address;
        const dydxAddress =
          evmWallet?.dydxAddress ?? storeState.connectedWallets.cosmos?.dydxAddress;

        if (!evmAddress) throw new Error('EVM wallet not connected');
        if (!dydxAddress) throw new Error('dYdX address not available');

        const nobleAddress = dydxToNoble(dydxAddress);
        const localWallet = walletService.getSigningWallet();
        if (!localWallet) throw new Error('Signing wallet not available');

        const rawSigner =
          localWallet.offlineSigner ?? (localWallet as any).signer ?? (localWallet as any).wallet;
        if (!rawSigner) throw new Error('No offline signer available');

        const nobleClient = await StargateClient.connect(NOBLE_RPC_ENDPOINT);
        const coin = await nobleClient.getBalance(nobleAddress, NOBLE_USDC_DENOM);
        const nobleBalUusdc = parseInt(coin?.amount ?? '0', 10);

        if (nobleBalUusdc <= 0) throw new Error('No funds found on Noble to recover');
        console.log('[recover] Noble balance:', nobleBalUusdc, 'uusdc');

        return await _bridgeFromNoble(
          nobleBalUusdc,
          nobleAddress,
          dydxAddress,
          evmAddress,
          evmWallet,
          destChainId,
          rawSigner,
          (hash, chainId) => {
            setBridgeTxHash(hash);
            setBridgeTxChainId(chainId);
          }
        );
      } catch (err: any) {
        const message = err.message ?? 'Recovery failed';
        console.error('[recover] error:', err);
        setError(message);
        setStep('error');
        return { success: false, error: message };
      }
    },
    [_bridgeFromNoble]
  );

  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
    setErrorRetryable(true);
    setTxHash(null);
    setBridgeTxHash(null);
    setBridgeTxChainId(null);
    setNobleBalance(0);
    setWithdrawnAmount(null);
  }, []);

  const stepLabelMap: Record<WithdrawStep, string> = {
    idle: '',
    routing: 'Calculating fees...',
    checking_gas: 'Preparing withdrawal...',
    transferring_to_main: 'Moving to main account...',
    signing: 'Signing & settling...',
    ibc_to_noble: 'Sending to Noble chain...',
    waiting_noble: 'Waiting for Noble funds...',
    bridging: 'Bridging to destination...',
    pending: 'Processing...',
    success: 'Withdrawal complete',
    error: 'Withdrawal failed',
  };

  return {
    withdraw,
    recoverNobleBalance,
    reset,
    step,
    stepLabel: stepLabelMap[step],
    error,
    errorRetryable,
    txHash,
    bridgeTxHash,
    bridgeTxChainId,
    nobleBalance,
    withdrawnAmount,
    isWithdrawing,
    withdrawError: error,
    clearWithdrawError: () => setError(null),
    IBC_GAS_FEE_USD: NATIVE_WALLET_GAS_RESERVE_UUSDC / 1e6,
  };
};