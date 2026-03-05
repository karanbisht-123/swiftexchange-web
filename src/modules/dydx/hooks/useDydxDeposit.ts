import { useCallback, useState } from 'react';
import { SubaccountInfo } from '@dydxprotocol/v4-client-js';
import Long from 'long';

import { walletService } from '../../walletconnect/services/walletService';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { dydxWalletService } from '../service/dydxWalletService';
import { skipApiService, type SkipRoute } from '../service/skipApiService';
import { SUBACCOUNT_CONSTANTS } from '../types/trading.types';

const MIN_DEPOSIT_USDC = 10;
const NOBLE_POLL_INTERVAL_MS = 4000;
const NOBLE_POLL_MAX_ATTEMPTS = 45;

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
    raw: SkipRoute;
}

async function sendEvmTx(tx: {
    to: string;
    value: string;
    data: string;
    chainId: string;
}): Promise<string> {
    const ethereum = (window as any).ethereum;
    if (!ethereum) throw new Error('MetaMask not found');

    const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts.length) throw new Error('No EVM account connected');

    const from = accounts[0];
    const txHash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
            from,
            to: tx.to,
            value: tx.value === '0' ? '0x0' : '0x' + BigInt(tx.value).toString(16),
            data: tx.data,
            chainId: '0x' + parseInt(tx.chainId, 10).toString(16),
        }],
    });
    return txHash as string;
}

async function approveErc20IfNeeded(
    tokenContract: string,
    spender: string,
    amount: string
): Promise<void> {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });
    const owner = accounts[0];

    const allowanceData = '0xdd62ed3e' +
        owner.replace('0x', '').padStart(64, '0') +
        spender.replace('0x', '').padStart(64, '0');

    const allowanceHex: string = await ethereum.request({
        method: 'eth_call',
        params: [{ to: tokenContract, data: allowanceData }, 'latest'],
    });

    const allowance = BigInt(allowanceHex);
    const required = BigInt(amount);

    if (allowance >= required) return;

    const approveData = '0x095ea7b3' +
        spender.replace('0x', '').padStart(64, '0') +
        required.toString(16).padStart(64, '0');

    await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from: owner, to: tokenContract, data: approveData }],
    });

    await new Promise(r => setTimeout(r, 3000));
}

async function pollNobleBalance(nobleAddress: string, expectedUusdc: bigint): Promise<void> {
    for (let i = 0; i < NOBLE_POLL_MAX_ATTEMPTS; i++) {
        try {
            const res = await fetch(
                `https://rest.cosmos.directory/noble/cosmos/bank/v1beta1/balances/${nobleAddress}`
            );
            if (res.ok) {
                const data = await res.json();
                const balances: { denom: string; amount: string }[] = data.balances || [];
                const uusdc = balances.find(b => b.denom === 'uusdc');
                if (uusdc && BigInt(uusdc.amount) >= expectedUusdc) return;
            }
        } catch {
        }
        await new Promise(r => setTimeout(r, NOBLE_POLL_INTERVAL_MS));
    }
    throw new Error('Bridge timeout: funds did not arrive at Noble in time. Check your transaction and try again.');
}

function dydxToNoble(dydxAddress: string): string {
    try {
        const { fromBech32, toBech32 } = require('@cosmjs/encoding');
        const { data } = fromBech32(dydxAddress);
        return toBech32('noble', data);
    } catch {
        return dydxAddress.replace(/^dydx/, 'noble');
    }
}

export const useDydxDeposit = () => {
    const [step, setStep] = useState<DepositStep>('idle');
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [route, setRoute] = useState<DepositRoute | null>(null);

    const getRoute = useCallback(async (
        assetSymbol: string,
        amountHuman: number,
        evmChainId?: number,
        goFast: boolean = false
    ): Promise<DepositRoute | null> => {
        setStep('routing');
        setError(null);

        try {
            const chainId = evmChainId
                ?? Number(useWalletStore.getState().connectedWallets.evm?.chainId ?? 1);

            const raw = await skipApiService.getDepositRoute(assetSymbol, chainId, amountHuman, goFast);
            const receivedUsdc = parseInt(raw.amountOut || '0', 10) / 1e6;

            const result: DepositRoute = {
                estimatedTime: skipApiService.formatDuration(raw.estimatedDurationSeconds),
                fee: raw.estimatedFees,
                receivedAmount: receivedUsdc,
                usdAmountOut: raw.usdAmountOut,
                raw,
            };

            setRoute(result);
            setStep('idle');
            return result;
        } catch (err: any) {
            setError(err.message || 'Failed to fetch route');
            setStep('error');
            return null;
        }
    }, []);

    const deposit = useCallback(async (
        assetSymbol: string,
        amountHuman: number,
        evmChainId?: number,
        goFast: boolean = false
    ): Promise<{ success: boolean; txHash?: string; error?: string }> => {
        setError(null);
        setTxHash(null);

        try {
            const storeState = useWalletStore.getState();
            const evmWallet = storeState.connectedWallets.evm;
            const evmAddress = evmWallet?.address;
            const dydxAddress = evmWallet?.dydxAddress
                ?? storeState.connectedWallets.cosmos?.dydxAddress;

            if (!evmAddress) throw new Error('EVM wallet not connected');
            if (!dydxAddress) throw new Error('dYdX wallet not derived. Please derive your dYdX wallet first.');

            const chainId = evmChainId ?? Number(evmWallet?.chainId ?? 1);

            setStep('routing');
            const skipRoute = await skipApiService.getDepositRoute(assetSymbol, chainId, amountHuman, goFast);

            setStep('signing_evm');
            const msgsResponse = await skipApiService.getDepositMsgs(skipRoute, evmAddress, dydxAddress);

            const evmTxData = msgsResponse.txs.find(t => t.evm_tx)?.evm_tx;
            if (!evmTxData) throw new Error('No EVM transaction returned from Skip');

            if (evmTxData.required_erc20_approvals?.length) {
                for (const approval of evmTxData.required_erc20_approvals) {
                    await approveErc20IfNeeded(approval.token_contract, approval.spender, approval.amount);
                }
            }

            const bridgeTxHash = await sendEvmTx({
                to: evmTxData.to,
                value: evmTxData.value || '0',
                data: evmTxData.data,
                chainId: evmTxData.chain_id,
            });
            setTxHash(bridgeTxHash);

            setStep('pending_bridge');
            const nobleAddress = dydxToNoble(dydxAddress);
            const expectedUusdc = BigInt(skipRoute.amountOut);
            await pollNobleBalance(nobleAddress, expectedUusdc);

            setStep('transferring');
            const localWallet = walletService.getSigningWallet();
            if (!localWallet) throw new Error('dYdX signing wallet not available');

            const client = await dydxWalletService.getCompositeClient();
            if (!client) throw new Error('dYdX client not connected');

            const subaccount = SubaccountInfo.forLocalWallet(
                localWallet,
                SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT
            );

            const quantums = Long.fromString(skipRoute.amountOut);
            await client.validatorClient.post.deposit(subaccount, 0, quantums);

            await new Promise(r => setTimeout(r, 2000));

            setStep('success');
            return { success: true, txHash: bridgeTxHash };
        } catch (err: any) {
            const message = err.message || 'Deposit failed';
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

    const stepLabel: Record<DepositStep, string> = {
        idle: '',
        routing: 'Finding best route...',
        signing_evm: 'Sign in MetaMask...',
        pending_bridge: 'Bridging funds...',
        transferring: 'Moving to account...',
        success: 'Deposit complete',
        error: 'Deposit failed',
    };

    return {
        deposit,
        getRoute,
        reset,
        step,
        stepLabel: stepLabel[step],
        error,
        txHash,
        route,
        isLoading: step === 'routing' || step === 'signing_evm' || step === 'pending_bridge' || step === 'transferring',
        MIN_DEPOSIT_USDC,
    };
};
