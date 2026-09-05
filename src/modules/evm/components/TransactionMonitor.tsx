/* eslint-disable react-refresh/only-export-components */
import React, { useEffect, useRef } from 'react';

import { useNotificationStore } from '../../../store/notificationStore';
import {
  type LocalTransaction,
  getLocalTransactions,
  updateLocalTransactionStatus,
} from '../service/localTransactionService';
import { CHAINS } from '../utils/assetmanagement/chains';
import { getEVMNetworkConfig } from '../utils/evmUtils';
import { rpcManager } from '../utils/rpcProvider';

export const PUBLIC_TX_CHEKER: Record<string, string> = {
  ETH: `https://eth.blockscout.com/api/v2/transactions/`,
  BSC: `https://bsc.blockscout.com/api/v2/transactions/`,
  BNB: `https://bsc.blockscout.com/api/v2/transactions/`,
  POL: `https://polygon.blockscout.com/api/v2/transactions/`,
  ARB: `https://arbitrum.blockscout.com/api/v2/transactions/`,
  OPT: `https://optimism.blockscout.com/api/v2/transactions/`,
  AVAX: `https://avalanche.blockscout.com/api/v2/transactions/`,
  BASE: `https://base.blockscout.com/api/v2/transactions/`,
};

export const checkTxStatus = async (txHash: string, chain: string) => {
  const baseUrl = PUBLIC_TX_CHEKER[chain];
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}${txHash}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === 'ok' || data.result === 'success') {
      return { status: true, message: data.result, chain, reqStatus: data.status };
    } else {
      return { status: false, message: data.result, chain, reqStatus: data.status };
    }
  } catch {
    return null;
  }
};

export const TransactionMonitor: React.FC = () => {
  const { showToast } = useNotificationStore();
  const monitoredHashes = useRef<Set<string>>(new Set());

  useEffect(() => {
    const checkPendingTransactions = async () => {
      const pendingTxs = getLocalTransactions().filter(tx => tx.status === 'pending');

      for (const tx of pendingTxs) {
        if (monitoredHashes.current.has(tx.hash)) continue;

        monitoredHashes.current.add(tx.hash);
        monitorTransaction(tx);
      }
    };

    const STELLAR_CHAIN_IDS = new Set(['pubnet', 'testnet']);

    const monitorTransaction = async (tx: LocalTransaction) => {
      // Stellar transactions are handled separately — skip EVM monitoring
      if (STELLAR_CHAIN_IDS.has(String(tx.chainId).toLowerCase())) {
        monitoredHashes.current.delete(tx.hash);
        return;
      }

      // Skip EVM/Uniswap/1inch/Rango monitoring as requested (poll status from backend, keeping code for future use)
      const providerUpper = tx.provider?.toUpperCase();
      const isBypassed =
        !tx.provider ||
        providerUpper === 'UNISWAP' ||
        providerUpper === 'EVMTX' ||
        providerUpper === 'ONEINCH' ||
        providerUpper === 'ONEINCH_FUSION' ||
        providerUpper === 'ONEINCH_FUSION_PLUS' ||
        providerUpper === 'RANGO';
      if (isBypassed) {
        monitoredHashes.current.delete(tx.hash);
        return;
      }

      try {
        let isSuccess = false;
        let isConfirmed = false;

        const chainConfig = Object.values(CHAINS).find(
          c => c.chainId === tx.chainId || c.chainId === Number(tx.chainId)
        );
        const chainSymbol = chainConfig?.symbol === 'BNB' ? 'BSC' : chainConfig?.symbol;

        if (chainSymbol) {
          const apiResult = await checkTxStatus(tx.hash, chainSymbol);
          if (apiResult) {
            isConfirmed = true;
            isSuccess = apiResult.status;
          }
        }

        if (!isConfirmed) {
          const config = getEVMNetworkConfig(tx.chainId);
          const receipt = await rpcManager.fetchWithFallback(
            tx.chainId,
            config.rpcUrls,
            async provider => {
              let attempts = 0;
              while (attempts < 60) {
                const r = await provider.getTransactionReceipt(tx.hash);
                if (r) return r;
                await new Promise(res => setTimeout(res, 5000));
                attempts++;
              }
              return null;
            }
          );

          if (receipt) {
            isConfirmed = true;
            isSuccess = receipt.status === 1;
          }
        }

        if (isConfirmed) {
          updateLocalTransactionStatus(tx.hash, isSuccess ? 'success' : 'failed');

          showToast({
            type: tx.type === 'bridge' ? 'BRIDGE' : 'EVM_SWAP',
            title: isSuccess ? 'Transaction Confirmed' : 'Transaction Failed',
            message: `${tx.description || 'Your transaction'} has been ${isSuccess ? 'confirmed on-chain' : 'reverted'}.`,
          });
        }
      } catch (err) {
        console.error('[TransactionMonitor] Error monitoring tx:', tx.hash, err);
      } finally {
        monitoredHashes.current.delete(tx.hash);
      }
    };

    const interval = setInterval(checkPendingTransactions, 10000);
    checkPendingTransactions();

    return () => clearInterval(interval);
  }, [showToast]);

  return null;
};
