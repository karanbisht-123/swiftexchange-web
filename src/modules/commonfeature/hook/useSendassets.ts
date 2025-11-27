import { useCallback, useEffect, useMemo, useState } from 'react';

import { validateAddress } from '../../../validator/AddressValidator';
import { estimateEVMFees, getNativeBalance } from '../../evm/service/evmService';
import {
  estimateStellarFees,
  getStellarBalance,
  sendCryptoStellarBuild,
} from '../../steallr/service/stellarService';
import type {
  StellarSendTransaction,
  StellarTransactionOptions,
} from '../../steallr/types/stellarTransaction.types';
import { useTransactionRouter } from '../../transction/hook/useTransactionRouter';
import type { TransactionRequest } from '../../transction/router/transactionRouter';
import {
  getCosmosChains,
  getEVMChains,
  getNetwork,
  getStellarConfig,
} from '../../walletconnect/config/chains';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import {
  type ReceiveAsset,
  assetFromCosmos,
  assetFromEVM,
  assetFromStellar,
} from '../../walletconnect/utils/assetFromChain';

interface TransactionState {
  txHash: string | null;
  step: 'form' | 'review' | 'signing' | 'success' | 'error';
  error: string | null;
  stellarTransaction?: StellarSendTransaction | null;
}
interface EnhancedReceiveAsset extends ReceiveAsset {
  type: 'evm' | 'stellar' | 'cosmos';
  networkKey: number | string;
  decimals: number;
  baseFee: number;
}

const isUserRejection = (error: any): boolean => {
  if (!error) return false;
  const code = error.code;
  const message = error.message?.toLowerCase() || '';
  return (
    code === 4001 ||
    code === 0 ||
    message.includes('user rejected') ||
    message.includes('user denied') ||
    message.includes('user cancelled') ||
    message.includes('cancelled by user') ||
    message.includes('transaction rejected') ||
    message.includes('user canceled') ||
    message.includes('cancelled') ||
    error.message?.includes('ACTION_REJECTED')
  );
};

const formatErrorMessage = (error: any, context: string): string => {
  if (isUserRejection(error)) {
    return 'Transaction cancelled. Please try again when ready.';
  }

  const code = error.code;
  const msg = error.message?.toLowerCase() || '';

  if (code === -32003 || msg.includes('insufficient funds')) {
    if (msg.includes('gas')) {
      return 'Insufficient funds for gas fees. Please add more ETH to your wallet.';
    }
    return 'Insufficient balance to complete this transaction. Please check your wallet balance.';
  }

  if (code === 4902 || msg.includes('unrecognized chain')) {
    return 'This network is not added to your wallet. Please add it and try again.';
  }
  if (msg.includes('chain mismatch') || msg.includes('wrong network')) {
    return 'Wrong network selected in wallet. Please switch to the correct network.';
  }

  if (code === -32000) return 'Insufficient funds for gas or transaction amount.';
  if (code === -32002) return 'Request already pending. Please check your wallet.';
  if (code === -32603) return 'Internal wallet error. Please try again.';

  if (msg.includes('gas')) return 'Transaction gas estimation failed. Please check your balance.';
  if (msg.includes('nonce'))
    return 'Transaction nonce error. Please reset your wallet or try again.';
  if (msg.includes('timeout'))
    return 'Request timed out. Please check your connection and try again.';
  if (msg.includes('network'))
    return 'Network error. Please check your connection or switch networks.';

  return error.message || `${context} failed. Please try again.`;
};

const enhanceAsset = (asset: ReceiveAsset): EnhancedReceiveAsset => {
  let type: 'evm' | 'stellar' | 'cosmos' = 'evm';
  if (asset.addressType === 'stellar' || asset.walletType === 'stellar') {
    type = 'stellar';
  } else if (asset.addressType === 'cosmos' || asset.walletType === 'cosmos') {
    type = 'cosmos';
  }
  const networkKey = asset.chainId || 0;

  const decimals = type === 'stellar' ? 7 : type === 'cosmos' ? 6 : 18;

  const baseFee = type === 'stellar' ? 0.00001 : type === 'cosmos' ? 0.0025 : 0.001;

  return {
    ...asset,
    type,
    networkKey,
    decimals,
    baseFee,
  };
};

export const useSendAsset = (onBack?: () => void) => {
  const { connectedWallets } = useWalletConnect();
  const { sendTransaction, canHandleTransaction, getSessionInfo } = useTransactionRouter();
  const currentNetwork = getNetwork();

  const rawAssets: ReceiveAsset[] = useMemo(() => {
    const evm = getEVMChains().map(assetFromEVM);
    const cosmos = getCosmosChains().map(assetFromCosmos);
    const stellar = [assetFromStellar(getStellarConfig())];
    return [...evm, ...cosmos, ...stellar];
  }, [currentNetwork]);

  const assets: EnhancedReceiveAsset[] = useMemo(() => {
    return rawAssets.map(enhanceAsset);
  }, [rawAssets]);

  const [recipientAddress, setRecipientAddress] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [selectedAssetValue, setSelectedAssetValue] = useState<string>('');
  const [balance, setBalance] = useState<number>(0);
  const [isFetchingBalance, setIsFetchingBalance] = useState<boolean>(false);
  const [transactionState, setTransactionState] = useState<TransactionState>({
    txHash: null,
    step: 'form',
    error: null,
    stellarTransaction: null,
  });
  const [isEstimatingFees, setIsEstimatingFees] = useState<boolean>(false);
  const [estimatedFees, setEstimatedFees] = useState<any>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Select first asset
  useEffect(() => {
    if (assets.length && !selectedAssetValue) {
      setSelectedAssetValue(assets[0].value);
    }
  }, [assets, selectedAssetValue]);

  const currentAsset = useMemo(
    () => assets.find(a => a.value === selectedAssetValue),
    [assets, selectedAssetValue]
  );
  // Wallet address
  const senderAddress = useMemo(() => {
    if (!currentAsset) return null;
    const walletInfo = connectedWallets[currentAsset.walletType];
    return walletInfo?.address || null;
  }, [connectedWallets, currentAsset]);

  const isWalletConnected = useMemo(() => {
    if (!currentAsset) return false;
    return !!connectedWallets[currentAsset.walletType];
  }, [connectedWallets, currentAsset]);

  const clearNotifications = useCallback(() => setNotifications([]), []);

  //  Balance fetching
  useEffect(() => {
    const fetchBalance = async () => {
      if (!currentAsset || !senderAddress) {
        setBalance(0);
        return;
      }

      setIsFetchingBalance(true);
      try {
        let balStr: string;

        console.log(currentAsset, '------');
        if (currentAsset.type === 'evm' && typeof currentAsset.networkKey === 'number') {
          balStr = await getNativeBalance(currentAsset.networkKey, senderAddress);
        } else if (currentAsset.type === 'stellar') {
          console.log('Fetching stellar balance', currentAsset.addressType);
          balStr = await getStellarBalance('native', senderAddress);
        } else {
          balStr = '0';
        }

        setBalance(parseFloat(balStr));
      } catch (e) {
        console.error('Balance fetch error:', e);
        setBalance(0);
      } finally {
        setIsFetchingBalance(false);
      }
    };
    fetchBalance();
  }, [currentAsset, senderAddress]);

  //  Fee estimation
  useEffect(() => {
    const estimate = async () => {
      if (
        !currentAsset ||
        !senderAddress ||
        !recipientAddress ||
        !amount ||
        parseFloat(amount) <= 0 ||
        !validateAddress(recipientAddress, currentAsset.network)
      ) {
        setEstimatedFees(null);
        return;
      }

      setIsEstimatingFees(true);
      try {
        let fees;

        if (currentAsset.type === 'evm' && typeof currentAsset.networkKey === 'number') {
          fees = await estimateEVMFees(
            currentAsset.networkKey,
            senderAddress,
            recipientAddress,
            amount
          );
        } else if (currentAsset.type === 'stellar' && typeof currentAsset.networkKey === 'string') {
          fees = await estimateStellarFees();
        } else {
          fees = {
            totalCost: currentAsset.baseFee.toFixed(
              currentAsset.decimals > 10 ? 8 : currentAsset.decimals
            ),
            totalFee: currentAsset.baseFee.toFixed(
              currentAsset.decimals > 10 ? 8 : currentAsset.decimals
            ),
          };
        }

        setEstimatedFees(fees);
      } catch (e: any) {
        console.error('Fee estimation error:', e);

        // If it's an insufficient funds
        if (e.code === -32003 || e.message?.toLowerCase().includes('insufficient funds')) {
          setEstimatedFees({
            totalCost: currentAsset.baseFee.toFixed(
              currentAsset.decimals > 10 ? 8 : currentAsset.decimals
            ),
            totalFee: currentAsset.baseFee.toFixed(
              currentAsset.decimals > 10 ? 8 : currentAsset.decimals
            ),
            isEstimated: true,
            error: 'Could not estimate exact fee due to insufficient funds. Showing estimated fee.',
          });
        } else {
          setEstimatedFees({
            totalCost: currentAsset.baseFee.toFixed(
              currentAsset.decimals > 10 ? 8 : currentAsset.decimals
            ),
            totalFee: currentAsset.baseFee.toFixed(
              currentAsset.decimals > 10 ? 8 : currentAsset.decimals
            ),
            isEstimated: true,
          });
        }
      } finally {
        setIsEstimatingFees(false);
      }
    };

    const timer = setTimeout(estimate, 500);
    return () => clearTimeout(timer);
  }, [currentAsset, senderAddress, recipientAddress, amount, memo]);

  //  Input validation
  const validateInputs = useCallback(() => {
    if (!currentAsset) return 'Please select an asset.';
    if (!isWalletConnected) return `Please connect your ${currentAsset.walletType} wallet first.`;
    if (!senderAddress)
      return `No ${currentAsset.type.toUpperCase()} address available. Please ensure your wallet supports ${currentAsset.network}.`;
    if (!recipientAddress.trim()) return 'Recipient address cannot be empty.';
    if (!validateAddress(recipientAddress, currentAsset.network))
      return `Invalid recipient address for ${currentAsset.network}.`;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return 'Amount must be greater than 0.';
    if (numAmount > balance)
      return `Insufficient balance. Available: ${balance.toLocaleString(undefined, {
        maximumFractionDigits: currentAsset.decimals,
      })} ${currentAsset.value}.`;

    if (estimatedFees) {
      const total = numAmount + parseFloat(estimatedFees.totalCost);
      if (total > balance)
        return `Insufficient balance to cover amount + fee. Total needed: ${total.toLocaleString(
          undefined,
          { maximumFractionDigits: currentAsset.decimals }
        )} ${currentAsset.value}.`;
    }

    if (!canHandleTransaction(currentAsset.type))
      return `No active session for ${currentAsset.type}. Please reconnect your wallet.`;

    return null;
  }, [
    currentAsset,
    isWalletConnected,
    senderAddress,
    recipientAddress,
    amount,
    balance,
    estimatedFees,
    canHandleTransaction,
  ]);

  const formError = validateInputs();

  const handleMaxClick = useCallback(() => {
    if (!currentAsset) return;

    const fee = estimatedFees ? parseFloat(estimatedFees.totalCost) : currentAsset.baseFee;
    const max = balance - fee;

    const precision = currentAsset.decimals > 10 ? 8 : currentAsset.decimals;
    setAmount(max > 0 ? max.toFixed(precision) : '0');
  }, [currentAsset, estimatedFees, balance]);

  const handleReviewTransaction = useCallback(async () => {
    setTransactionState(p => ({ ...p, step: 'review', error: null }));
  }, []);

  const handleConfirmTransaction = useCallback(async () => {
    if (!currentAsset || !isWalletConnected || !senderAddress) return;

    try {
      setTransactionState(p => ({ ...p, step: 'signing', error: null }));
      let transactionRequest: TransactionRequest;

      if (currentAsset.type === 'evm') {
        transactionRequest = {
          type: 'evm',
          network: currentAsset.network,
          networkKey: currentAsset.networkKey as number,
          from: senderAddress,
          to: recipientAddress,
          amount,
          data: memo || undefined,
        };
      } else if (currentAsset.type === 'stellar') {
        const options: StellarTransactionOptions = {};
        if (memo.trim()) options.memo = memo.trim();

        const stellarTx = await sendCryptoStellarBuild(
          // currentAsset.addressType as string,
          senderAddress,
          recipientAddress,
          amount,
          options
        );
        transactionRequest = {
          type: 'stellar',
          network: currentAsset.network,
          networkKey: currentAsset.networkKey as string,
          from: senderAddress,
          to: recipientAddress,
          amount,
          data: {
            xdr: stellarTx.xdr,
            networkPassphrase: 'Test SDF Network ; September 2015',
            network: 'TESTNET',
          },
        };
      } else {
        transactionRequest = {
          type: 'cosmos',
          network: currentAsset.network,
          networkKey: currentAsset.networkKey as string,
          from: senderAddress,
          to: recipientAddress,
          amount,
          memo: memo || undefined,
        };
      }

      console.log('[useSendAsset] Sending via router:', transactionRequest);
      const response = await sendTransaction(transactionRequest);

      if (response.status === 'success') {
        setTransactionState(p => ({
          ...p,
          txHash: response.hash || null,
          step: 'success',
        }));
        setTimeout(() => {
          setRecipientAddress('');
          setAmount('');
          setMemo('');
          setTransactionState({
            txHash: null,
            step: 'form',
            error: null,
            stellarTransaction: null,
          });
        }, 3000);
      } else {
        throw new Error(response.error || 'Transaction failed');
      }
    } catch (error: any) {
      console.error('Transaction error:', error);

      if (isUserRejection(error)) {
        setTransactionState(p => ({ ...p, step: 'review', error: null }));
        return;
      }

      const sessionError =
        error.message?.includes('session topic does not exist') ||
        error.message?.includes('Missing or invalid') ||
        error.message?.includes('Wallet session expired');

      if (sessionError) {
        const msg = 'Your wallet session has expired. Please reconnect and try again.';
        setTransactionState(p => ({ ...p, step: 'error', error: msg }));
        return;
      }

      const msg = formatErrorMessage(error, 'Transaction');
      setTransactionState(p => ({ ...p, step: 'error', error: msg }));
    }
  }, [
    currentAsset,
    isWalletConnected,
    senderAddress,
    recipientAddress,
    amount,
    memo,
    sendTransaction,
  ]);

  const handleBackToForm = useCallback(() => {
    setTransactionState({
      txHash: null,
      step: 'form',
      error: null,
      stellarTransaction: null,
    });
  }, []);

  const handleRetryTransaction = useCallback(() => {
    handleBackToForm();
    clearNotifications();
  }, [handleBackToForm, clearNotifications]);

  const copyToClipboard = useCallback(async (text: string, label: string) => {
    console.log(label);
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  }, []);

  useEffect(() => {
    if (currentAsset) {
      const info = getSessionInfo(currentAsset.walletType);
      console.log(`[useSendAsset] Session for ${currentAsset.walletType}:`, info);
    }
  }, [currentAsset, getSessionInfo]);

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
    clearNotifications,
    currentAsset,
    senderAddress,
    isWalletConnected,
    handleMaxClick,
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
