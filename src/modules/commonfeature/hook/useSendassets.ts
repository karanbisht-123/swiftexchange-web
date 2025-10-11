import { useCallback, useEffect, useMemo, useState } from 'react';

import { type NetworkKey } from '../../../config/swapConfigs';
import type {
  EVMSendTransaction,
  EVMTransactionOptions,
} from '../../../types/evm/evmTransaction.types';
import { validateAddress } from '../../../validator/AddressValidator';
import {
  estimateEVMFees,
  getNativeBalance,
  sendCryptoEVMBroadcast,
  sendCryptoEVMBuild,
  signEVMTransaction,
} from '../../evm/service/evmService';
import {
  estimateStellarFees,
  getStellarBalance,
  sendCryptoStellarBroadcast,
  sendCryptoStellarBuild,
  signStellarTransaction,
} from '../../steallr/service/stellarService';
import type {
  StellarSendTransaction,
  StellarTransactionOptions,
} from '../../steallr/types/stellarTransaction.types';
import { useWalletStore } from '../../wallet/store.ts/walletStore';

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  duration?: number;
}

type Transaction = EVMSendTransaction | StellarSendTransaction;

interface TransactionState {
  transaction: Transaction | null;
  signedTransaction: string | null;
  txHash: string | null;
  step: 'form' | 'review' | 'signing' | 'broadcasting' | 'success' | 'error';
  error: string | null;
}

const assets = [
  {
    value: 'XLM',
    label: 'Stellar (XLM)',
    logo: 'https://coin-images.coingecko.com/coins/images/100/large/fmpFRHHQ_400x400.jpg?1735231350',
    memoRequired: false,
    memoType: 'Text',
    network: 'Stellar',
    networkKey: 'stellar',
    type: 'stellar' as const,
    feePerUnit: 0.00001,
    baseFee: 0.00001,
    chainId: 'stellar:testnet',
    assetType: 'native',
    assetIssuer: null,
    decimals: 7,
  },
  {
    value: 'ETH',
    label: 'Ethereum (ETH)',
    logo: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628',
    memoRequired: false,
    network: 'Ethereum Sepolia',
    networkKey: 'sepolia',
    type: 'evm' as const,
    feePerUnit: 0.00000002,
    baseFee: 0.002,
    chainId: '11155111',
    decimals: 18,
  },
  {
    value: 'BNB',
    label: 'BNB Chain Testnet (BNB)',
    logo: 'https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1696501970',
    memoRequired: false,
    network: 'BSC Testnet',
    networkKey: 'bscTestnet',
    type: 'evm' as const,
    feePerUnit: 0.000000005,
    baseFee: 0.0005,
    chainId: '97',
    decimals: 18,
  },
];

export const useSendAsset = (onBack?: () => void) => {
  const { walletAddresses, getPrivateKey, isSessionValid } = useWalletStore();
  const [recipientAddress, setRecipientAddress] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [selectedAssetValue, setSelectedAssetValue] = useState<string>('XLM');
  const [balance, setBalance] = useState<number>(0);
  const [isFetchingBalance, setIsFetchingBalance] = useState<boolean>(false);
  const [transactionState, setTransactionState] = useState<TransactionState>({
    transaction: null,
    signedTransaction: null,
    txHash: null,
    step: 'form',
    error: null,
  });
  const [isEstimatingFees, setIsEstimatingFees] = useState<boolean>(false);
  const [estimatedFees, setEstimatedFees] = useState<any>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((notification: Omit<Notification, 'id'>) => {
    const newNotification: Notification = {
      ...notification,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    };
    setNotifications(prev => [...prev, newNotification]);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const currentAsset = useMemo(
    () => assets.find(a => a.value === selectedAssetValue),
    [selectedAssetValue]
  );

  const senderAddress = useMemo(() => {
    if (!walletAddresses.length || !currentAsset) return null;

    if (currentAsset.type === 'stellar') {
      return walletAddresses.find(addr => addr.startsWith('G')) || null;
    } else {
      return walletAddresses.find(addr => addr.startsWith('0x')) || null;
    }
  }, [walletAddresses, currentAsset]);

  useEffect(() => {
    const fetchBalance = async () => {
      if (!currentAsset || !senderAddress) {
        setBalance(0);
        return;
      }

      console.log(senderAddress, 'hii i am sender Ders ');
      setIsFetchingBalance(true);
      try {
        const balStr =
          currentAsset.type === 'evm'
            ? await getNativeBalance(currentAsset.networkKey as NetworkKey, senderAddress)
            : await getStellarBalance(currentAsset.networkKey, senderAddress);
        setBalance(parseFloat(balStr));
      } catch (error) {
        console.error('Failed to fetch balance:', error);
        setBalance(0);
        addNotification({
          type: 'warning',
          title: 'Balance Fetch Failed',
          message: 'Could not fetch balance. Showing 0.',
          duration: 5000,
        });
      } finally {
        setIsFetchingBalance(false);
      }
    };

    fetchBalance();
  }, [currentAsset, senderAddress, addNotification]);

  useEffect(() => {
    const estimateFeesFunc = async () => {
      if (
        !currentAsset ||
        !senderAddress ||
        !recipientAddress ||
        !amount ||
        parseFloat(amount) <= 0
      ) {
        setEstimatedFees(null);
        return;
      }

      if (!validateAddress(recipientAddress, currentAsset.network)) {
        return;
      }

      setIsEstimatingFees(true);
      try {
        const fees =
          currentAsset.type === 'evm'
            ? await estimateEVMFees(
                currentAsset.networkKey as NetworkKey,
                senderAddress,
                recipientAddress,
                amount
              )
            : await estimateStellarFees(currentAsset.networkKey);
        setEstimatedFees(fees);
      } catch (error) {
        console.error('Fee estimation failed:', error);
        setEstimatedFees({
          totalCost: currentAsset.baseFee.toFixed(
            currentAsset.decimals > 10 ? 8 : currentAsset.decimals
          ),
          totalFee: currentAsset.baseFee.toFixed(
            currentAsset.decimals > 10 ? 8 : currentAsset.decimals
          ),
        });
      } finally {
        setIsEstimatingFees(false);
      }
    };

    const debounceTimer = setTimeout(estimateFeesFunc, 500);
    return () => clearTimeout(debounceTimer);
  }, [currentAsset, senderAddress, recipientAddress, amount, memo, addNotification]);

  const validateInputs = useCallback(() => {
    if (!currentAsset) {
      return 'Please select an asset.';
    }
    if (!senderAddress) {
      return `No ${currentAsset.type.toUpperCase()} address available. Please ensure your wallet supports ${
        currentAsset.network
      }.`;
    }
    if (!recipientAddress.trim()) {
      return 'Recipient address cannot be empty.';
    }
    if (!validateAddress(recipientAddress, currentAsset.network)) {
      return `Invalid recipient address for ${currentAsset.network}.`;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return 'Amount must be greater than 0.';
    }
    if (numAmount > balance) {
      return `Insufficient balance. Available: ${balance.toLocaleString(undefined, {
        maximumFractionDigits: currentAsset.decimals,
      })} ${currentAsset.value}.`;
    }

    if (estimatedFees) {
      const totalCost = numAmount + parseFloat(estimatedFees.totalCost);
      if (totalCost > balance) {
        return `Insufficient balance to cover amount + fee. Total needed: ${totalCost.toLocaleString(
          undefined,
          { maximumFractionDigits: currentAsset.decimals }
        )} ${currentAsset.value}.`;
      }
    }

    return null;
  }, [recipientAddress, amount, currentAsset, estimatedFees, senderAddress, balance]);

  const formError = validateInputs();

  const handleMaxClick = useCallback(() => {
    if (!currentAsset) return;

    const feeAmount = estimatedFees ? parseFloat(estimatedFees.totalCost) : currentAsset.baseFee;
    const maxAmount = balance - feeAmount;

    if (maxAmount <= 0) {
      setAmount('0');
      addNotification({
        type: 'warning',
        title: 'Insufficient Balance',
        message: 'Not enough balance to cover transaction fees.',
      });
      return;
    }

    const precision = currentAsset.decimals > 10 ? 8 : currentAsset.decimals;
    setAmount(maxAmount.toFixed(precision));
    addNotification({
      type: 'info',
      title: 'Max Amount Set',
      message: `Set to maximum available: ${maxAmount.toFixed(precision)} ${currentAsset.value}`,
    });
  }, [currentAsset, estimatedFees, balance, addNotification]);

  const buildTransactionFunc = useCallback(async () => {
    if (!currentAsset || !senderAddress || formError) {
      throw new Error(formError || 'Invalid form data');
    }

    if (!isSessionValid()) {
      throw new Error('Session expired. Please reconnect your wallet.');
    }

    const options: EVMTransactionOptions | StellarTransactionOptions = {};
    if (memo.trim()) {
      options.memo = memo.trim();
    }

    const transaction =
      currentAsset.type === 'evm'
        ? await sendCryptoEVMBuild(
            currentAsset.networkKey as NetworkKey,
            senderAddress,
            recipientAddress,
            amount,
            options as EVMTransactionOptions
          )
        : await sendCryptoStellarBuild(
            currentAsset.networkKey,
            senderAddress,
            recipientAddress,
            amount,
            options as StellarTransactionOptions
          );

    return transaction;
  }, [currentAsset, senderAddress, recipientAddress, amount, memo, formError, isSessionValid]);

  const signTransactionFunc = useCallback(
    async (transaction: Transaction) => {
      if (!currentAsset) throw new Error('No asset selected');

      const privateKey = await getPrivateKey(currentAsset.type);
      if (!privateKey) {
        throw new Error('Private key not available. Please reconnect your wallet.');
      }

      const isMainnet = currentAsset.networkKey === 'stellarMainnet';
      return currentAsset.type === 'evm'
        ? await signEVMTransaction(transaction as EVMSendTransaction, privateKey)
        : await signStellarTransaction(
            transaction as StellarSendTransaction,
            privateKey,
            isMainnet
          );
    },
    [currentAsset, getPrivateKey]
  );

  const broadcastTransactionFunc = useCallback(
    async (signedTransaction: string) => {
      if (!currentAsset) throw new Error('No asset selected');

      return currentAsset.type === 'evm'
        ? await sendCryptoEVMBroadcast(signedTransaction, currentAsset.networkKey as NetworkKey)
        : await sendCryptoStellarBroadcast(signedTransaction, currentAsset.networkKey);
    },
    [currentAsset]
  );

  const handleReviewTransaction = useCallback(async () => {
    try {
      setTransactionState(prev => ({ ...prev, step: 'review', error: null }));

      addNotification({
        type: 'info',
        title: 'Building Transaction',
        message: 'Preparing transaction for review...',
        duration: 3000,
      });

      const transaction = await buildTransactionFunc();

      setTransactionState(prev => ({
        ...prev,
        transaction,
        step: 'review',
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to build transaction';
      console.error('Transaction build error:', error);

      setTransactionState(prev => ({
        ...prev,
        step: 'error',
        error: errorMessage,
      }));

      addNotification({
        type: 'error',
        title: 'Transaction Build Failed',
        message: errorMessage,
        duration: 8000,
      });
    }
  }, [buildTransactionFunc, addNotification]);

  const handleConfirmTransaction = useCallback(async () => {
    if (!transactionState.transaction) return;

    try {
      setTransactionState(prev => ({
        ...prev,
        step: 'signing',
        error: null,
      }));

      addNotification({
        type: 'info',
        title: 'Signing Transaction',
        message: 'Signing transaction with your private key...',
        duration: 3000,
      });

      const signedTransaction = await signTransactionFunc(transactionState.transaction);

      setTransactionState(prev => ({
        ...prev,
        signedTransaction,
        step: 'broadcasting',
      }));

      addNotification({
        type: 'info',
        title: 'Broadcasting Transaction',
        message: 'Submitting transaction to the network...',
        duration: 5000,
      });

      const txHash = await broadcastTransactionFunc(signedTransaction);

      setTransactionState(prev => ({
        ...prev,
        txHash,
        step: 'success',
      }));

      addNotification({
        type: 'success',
        title: 'Transaction Successful!',
        message: `Transaction broadcasted with hash: ${txHash.slice(0, 10)}...`,
        duration: 10000,
      });

      setTimeout(() => {
        setRecipientAddress('');
        setAmount('');
        setMemo('');
        setTransactionState({
          transaction: null,
          signedTransaction: null,
          txHash: null,
          step: 'form',
          error: null,
        });
      }, 3000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Transaction failed';
      console.error('Transaction error:', error);

      setTransactionState(prev => ({
        ...prev,
        step: 'error',
        error: errorMessage,
      }));

      addNotification({
        type: 'error',
        title: 'Transaction Failed',
        message: errorMessage,
        duration: 10000,
      });
    }
  }, [
    transactionState.transaction,
    signTransactionFunc,
    broadcastTransactionFunc,
    addNotification,
  ]);

  const handleBackToForm = useCallback(() => {
    setTransactionState({
      transaction: null,
      signedTransaction: null,
      txHash: null,
      step: 'form',
      error: null,
    });
  }, []);

  const handleRetryTransaction = useCallback(() => {
    handleBackToForm();
    clearNotifications();
  }, [handleBackToForm, clearNotifications]);

  const copyToClipboard = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        addNotification({
          type: 'success',
          title: 'Copied!',
          message: `${label} copied to clipboard`,
          duration: 3000,
        });
      } catch (error) {
        addNotification({
          type: 'error',
          title: 'Copy Failed',
          message: 'Failed to copy to clipboard',
          duration: 3000,
        });
      }
    },
    [addNotification]
  );

  return {
    recipientAddress,
    setRecipientAddress,
    amount,
    setAmount,
    memo,
    setMemo,
    selectedAssetValue,
    setSelectedAssetValue,
    balance,
    isFetchingBalance,
    transactionState,
    setTransactionState,
    isEstimatingFees,
    estimatedFees,
    notifications,
    addNotification,
    removeNotification,
    clearNotifications,
    currentAsset,
    senderAddress,
    handleMaxClick,
    buildTransactionFunc,
    signTransactionFunc,
    broadcastTransactionFunc,
    handleReviewTransaction,
    handleConfirmTransaction,
    handleBackToForm,
    handleRetryTransaction,
    copyToClipboard,
    formError,
    assets,
    onBack,
  };
};
