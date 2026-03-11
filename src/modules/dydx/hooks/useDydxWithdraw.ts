import { useCallback, useState } from 'react';
import { SubaccountInfo } from '@dydxprotocol/v4-client-js';
import Long from 'long';

import { walletService } from '../../walletconnect/services/walletService';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { dydxWalletService } from '../service/dydxWalletService';
import { dydxSubaccountService } from '../service/dydxSubaccountService';
import { skipApiService, type SkipRoute } from '../service/skipApiService';
import { SUBACCOUNT_CONSTANTS } from '../types/trading.types';

export type WithdrawStep =
    | 'idle'
    | 'routing'
    | 'transferring_to_main'
    | 'signing'
    | 'pending'
    | 'success'
    | 'error';

export interface WithdrawRoute {
    estimatedTime: string;
    fee: number;
    receivedAmount: number;
    raw: SkipRoute;
}

export const useDydxWithdraw = () => {
    const [step, setStep] = useState<WithdrawStep>('idle');
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [route, setRoute] = useState<WithdrawRoute | null>(null);

    const getRoute = useCallback(async (
        amountHuman: number,
        destChainId?: number,
    ): Promise<WithdrawRoute | null> => {
        setStep('routing');
        setError(null);

        try {
            const chainId = destChainId
                ?? Number(useWalletStore.getState().connectedWallets.evm?.chainId ?? 1);

            const raw = await skipApiService.getWithdrawalRoute(chainId, amountHuman);
            const receivedUsdc = parseInt(raw.amountOut || '0', 10) / 1e6;

            const result: WithdrawRoute = {
                estimatedTime: skipApiService.formatDuration(raw.estimatedDurationSeconds),
                fee: raw.estimatedFees,
                receivedAmount: receivedUsdc,
                raw,
            };

            setRoute(result);
            setStep('idle');
            return result;
        } catch (err: any) {
            setError(err.message || 'Failed to fetch withdrawal route');
            setStep('error');
            return null;
        }
    }, []);

    const withdraw = useCallback(async (
        amount: string,
        fromSubaccount: number = SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT,
        toAddress?: string,
        destChainId?: number,
    ): Promise<{ success: boolean; transactionHash?: string; error?: string }> => {
        setError(null);
        setTxHash(null);

        try {
            const storeState = useWalletStore.getState();
            const evmWallet = storeState.connectedWallets.evm;
            const evmAddress = toAddress || evmWallet?.address;
            const dydxAddress = evmWallet?.dydxAddress
                ?? storeState.connectedWallets.cosmos?.dydxAddress;

            if (!evmAddress) throw new Error('EVM wallet not connected');
            if (!dydxAddress) throw new Error('dYdX address not available');

            const client = await dydxWalletService.getCompositeClient();
            const localWallet = walletService.getSigningWallet();

            if (!client || !localWallet) throw new Error('dYdX client or signing wallet not available');

            const amountValue = parseFloat(amount);
            if (amountValue <= 0) throw new Error('Withdraw amount must be greater than 0');

            if (fromSubaccount !== SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT) {
                setStep('transferring_to_main');
                const transferResult = await dydxSubaccountService.transfer(
                    fromSubaccount,
                    SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT,
                    amount
                );
                if (!transferResult.success) {
                    throw new Error(transferResult.error || 'Failed to move funds to main account');
                }
                await new Promise(r => setTimeout(r, 2000));
            }

            setStep('routing');
            const chainId = destChainId ?? Number(evmWallet?.chainId ?? 1);
            await skipApiService.getWithdrawalRoute(chainId, amountValue);

            setStep('signing');
            const subaccount = SubaccountInfo.forLocalWallet(
                localWallet,
                SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT
            );
            const amountInQuantums = Math.floor(amountValue * 1e6);
            if (amountInQuantums <= 0) throw new Error('Withdrawal amount too small');

            const result = await client.validatorClient.post.withdraw(
                subaccount,
                0,
                Long.fromString(amountInQuantums.toString()),
                evmAddress
            );

            setStep('pending');

            const hashRaw = (result as any)?.hash;
            const hash = typeof hashRaw === 'string'
                ? hashRaw
                : hashRaw
                    ? Array.from(hashRaw as Uint8Array)
                        .map((b: number) => b.toString(16).padStart(2, '0'))
                        .join('')
                    : 'submitted';

            setTxHash(hash);

            await new Promise(r => setTimeout(r, 2000));
            setStep('success');

            return { success: true, transactionHash: hash };
        } catch (err: any) {
            const message = err.message || 'Withdrawal failed';
            setError(message);
            setStep('error');
            return { success: false, error: message };
        }
    }, []);

    const reset = useCallback(() => {
        setStep('idle');
        setError(null);
        setTxHash(null);
        setRoute(null);
    }, []);

    const stepLabel: Record<WithdrawStep, string> = {
        idle: '',
        routing: 'Calculating fees...',
        transferring_to_main: 'Moving to main account...',
        signing: 'Sign withdrawal...',
        pending: 'Processing...',
        success: 'Withdrawal complete',
        error: 'Withdrawal failed',
    };

    return {
        withdraw,
        getRoute,
        reset,
        step,
        stepLabel: stepLabel[step],
        error,
        txHash,
        route,
        isWithdrawing: step !== 'idle' && step !== 'success' && step !== 'error',
        withdrawError: error,
        clearWithdrawError: () => setError(null),
    };
};
