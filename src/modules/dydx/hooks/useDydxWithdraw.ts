import { useCallback, useState } from 'react';

import { StargateClient } from '@cosmjs/stargate';
import { SubaccountInfo } from '@dydxprotocol/v4-client-js';
import Long from 'long';

import { walletService } from '../../walletconnect/services/walletService';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { dydxSubaccountService } from '../service/dydxSubaccountService';
import { dydxWalletService } from '../service/dydxWalletService';
import { SUBACCOUNT_CONSTANTS } from '../types/trading.types';
import {
  // DYDX_CHAIN_ID,
  NOBLE_CHAIN_ID,
  NOBLE_USDC_DENOM,
  SKIP_BRIDGES,
  USDC_EVM_CONTRACTS,
  buildCosmosSigner,
  buildEvmSigner,
  buildUserAddresses,
  dydxToNoble,
  sumNobleFeesUusdc,
} from '../utils/skipBridgeUtils';

const NOBLE_RPC_ENDPOINT = 'https://noble-rpc.polkachu.com:443';

const NOBLE_POLL_TIMEOUT_MS = 120_000;
const NOBLE_POLL_INTERVAL_MS = 5_000;

const DYDX_TO_NOBLE_PORT = 'transfer';
const DYDX_TO_NOBLE_CHANNEL = 'channel-0';

const DYDX_USDC_IBC_DENOM = 'ibc/8E27BA2D5493AF5636760E354E46004562C46AB7EC0CC4C1CA14E9E20E2545B5';

export type WithdrawStep =
  | 'idle'
  | 'routing'
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
    console.log(`[withdraw] Noble balance: ${bal} uusdc (need ≥ ${minAmountUusdc})`);

    if (bal >= minAmountUusdc) return bal;
    await new Promise(r => setTimeout(r, NOBLE_POLL_INTERVAL_MS));
  }

  throw new Error(
    `Timed out waiting for Noble funds. ` +
    `Check https://www.mintscan.io/noble/address/${nobleAddress}`
  );
}

export const useDydxWithdraw = () => {
  const [step, setStep] = useState<WithdrawStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [nobleBalance, setNobleBalance] = useState<number>(0);

  const _bridgeFromNoble = useCallback(
    async (
      nobleBalUusdc: number,
      nobleAddress: string,
      dydxAddress: string,
      evmAddress: string,
      evmWallet: any,
      destChainId: number | undefined,
      rawSigner: any
    ): Promise<{ success: boolean; transactionHash?: string; error?: string }> => {
      const { route: fetchSkipRoute, executeRoute } = await import('@skip-go/client');

      const chainId = destChainId ?? Number(evmWallet?.chainId ?? 1);
      const destAssetDenom = USDC_EVM_CONTRACTS[chainId] ?? USDC_EVM_CONTRACTS[1];

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
        `[bridge] balance=${nobleBalUusdc} fees=${estimatedFeesUusdc} ` +
        `buffer=${feeBuffer} safeAmountIn=${safeAmountIn}`
      );

      if (safeAmountIn <= 0) {
        throw new Error(
          `Noble balance (${nobleBalUusdc} uusdc) too low to cover fees (~${feeBuffer} uusdc). ` +
          `Need at least ${feeBuffer + 1} uusdc.`
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

      let bridgeTxHash = '';

      await executeRoute({
        route: rawRoute,
        userAddresses,
        getCosmosSigner: buildCosmosSigner(rawSigner),
        getEvmSigner: buildEvmSigner(evmAddress, walletService.getProvider('evm')),
        slippageTolerancePercent: '1',
        onTransactionBroadcast: async ({ chainId: cid, txHash: hash }: any) => {
          bridgeTxHash = hash;
          setTxHash(hash);
          console.log(`[bridge] broadcast on ${cid}: ${hash}`);
        },
        onTransactionTracked: async ({ chainId: cid, txHash: hash }: any) => {
          console.log(`[bridge] tracked on ${cid}: ${hash}`);
        },
        onTransactionCompleted: async ({ chainId: cid, txHash: hash, status }: any) => {
          console.log(`[bridge] completed on ${cid}: ${hash}`, status);
        },
      } as any);

      setStep('pending');
      await new Promise(r => setTimeout(r, 2_000));
      setStep('success');

      return { success: true, transactionHash: bridgeTxHash };
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
      setTxHash(null);
      setNobleBalance(0);

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
        if (amountValue <= 0) throw new Error('Withdraw amount must be greater than 0');

        const amountInQuantums = Math.floor(amountValue * 1e6);
        const ibcAmountUusdc = amountInQuantums - 10_000;
        if (ibcAmountUusdc <= 0) throw new Error('Withdrawal amount too small');

        const rawSigner =
          localWallet.offlineSigner ?? (localWallet as any).signer ?? (localWallet as any).wallet;
        if (!rawSigner) throw new Error('No offline signer available');

        if (fromSubaccount !== SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT) {
          setStep('transferring_to_main');
          const transferResult = await dydxSubaccountService.transfer(
            fromSubaccount,
            SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT,
            amount
          );
          if (!transferResult.success) {
            throw new Error(transferResult.error ?? 'Failed to move funds to main account');
          }
          await new Promise(r => setTimeout(r, 2_000));
        }

        setStep('signing');

        const subaccount = SubaccountInfo.forLocalWallet(
          localWallet,
          SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT
        );

        const withdrawResult = await client.validatorClient.post.withdraw(
          subaccount,
          0,
          Long.fromString(amountInQuantums.toString())
        );
        setTxHash(formatTxHash((withdrawResult as any)?.hash));

        await new Promise(r => setTimeout(r, 6_000));

        setStep('ibc_to_noble');

        const timeoutTimestamp = (BigInt(Date.now() + 10 * 60 * 1_000) * 1_000_000n).toString();

        const ibcMsg = {
          typeUrl: '/ibc.applications.transfer.v1.MsgTransfer',
          value: {
            sourcePort: DYDX_TO_NOBLE_PORT,
            sourceChannel: DYDX_TO_NOBLE_CHANNEL,
            token: { denom: DYDX_USDC_IBC_DENOM, amount: ibcAmountUusdc.toString() },
            sender: dydxAddress,
            receiver: nobleAddress,
            timeoutHeight: { revisionNumber: '0', revisionHeight: '0' },
            timeoutTimestamp,
            memo: '',
          },
        };

        const ibcResult = await client.validatorClient.post.send(
          subaccount,
          () => Promise.resolve([ibcMsg]),
          false
        );
        console.log('[withdraw] IBC tx:', formatTxHash((ibcResult as any)?.hash));

        setStep('waiting_noble');

        const minNobleBalance = Math.floor(ibcAmountUusdc * 0.9);
        const finalNobleBalance = await waitForNobleBalance(nobleAddress, minNobleBalance, bal =>
          setNobleBalance(bal)
        );
        console.log('[withdraw] Noble balance confirmed:', finalNobleBalance, 'uusdc');

        return await _bridgeFromNoble(
          finalNobleBalance,
          nobleAddress,
          dydxAddress,
          evmAddress,
          evmWallet,
          destChainId,
          rawSigner
        );
      } catch (err: any) {
        const message = err.message ?? 'Withdrawal failed';
        console.error('[withdraw] error:', err);
        setError(message);
        setStep('error');
        return { success: false, error: message };
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
          rawSigner
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
    setTxHash(null);
    setNobleBalance(0);
  }, []);

  const stepLabelMap: Record<WithdrawStep, string> = {
    idle: '',
    routing: 'Calculating fees...',
    transferring_to_main: 'Moving to main account...',
    signing: 'Signing withdrawal...',
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
    txHash,
    nobleBalance,
    isWithdrawing: step !== 'idle' && step !== 'success' && step !== 'error',
    withdrawError: error,
    clearWithdrawError: () => setError(null),
  };
};