import React, { useEffect, useRef } from 'react';
import { getLocalTransactions, updateLocalTransactionStatus, type LocalTransaction } from '../service/localTransactionService';
import { useNotificationStore } from '../../../store/notificationStore';
import { getEVMNetworkConfig } from '../utils/evmUtils';
import { rpcManager } from '../utils/rpcProvider';


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

    const monitorTransaction = async (tx: LocalTransaction) => {
      try {
        const config = getEVMNetworkConfig(tx.chainId);
        const receipt = await rpcManager.fetchWithFallback(tx.chainId, config.rpcUrls, async (provider) => {
          let attempts = 0;
          while (attempts < 60) {
            const r = await provider.getTransactionReceipt(tx.hash);
            if (r) return r;
            await new Promise(res => setTimeout(res, 5000));
            attempts++;
          }
          return null;
        });

        if (receipt) {
          const isSuccess = receipt.status === 1;
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
