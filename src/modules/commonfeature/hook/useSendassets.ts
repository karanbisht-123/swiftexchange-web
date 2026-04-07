import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SendErcAbi } from '../../../abi/SendErcAbi';
// getNativeBalance 
import { validateAddress } from '../../../validator/AddressValidator';
import { estimateEVMFees } from '../../evm/service/evmService';
import { addLocalTransaction } from '../../evm/service/localTransactionService';
import {
  estimateStellarFees,
  getStellarBalance,
  sendCryptoStellarBuild,
  fetchStellarAccountAssets,
} from '../../steallr/service/stellarService';
import type {
  StellarSendTransaction,
  StellarTransactionOptions,
} from '../../steallr/types/stellarTransaction.types';
import { useTransactionRouter } from '../../transction/hook/useTransactionRouter';
import type { TransactionRequest } from '../../transction/router/transactionRouter';
import { getEVMChains } from '../../walletconnect/config/chains';
import { getStellarConfig } from '../../walletconnect/config/chains';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import {
  type ReceiveAsset,
  assetFromStellar,
} from '../../walletconnect/utils/assetFromChain';
import { getTokensForChain, fetchSingleTokenBalance } from '../../evm/service/tokenListService';
import { getEVMNetworkConfig } from '../../evm/utils/evmUtils';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { ethers } from 'ethers';
import { switchOrAddChain } from '../../evm/utils/evmChainUtils';

interface TransactionState {
  txHash: string | null;
  step: 'form' | 'review' | 'signing' | 'success' | 'error';
  error: string | null;
  stellarTransaction?: StellarSendTransaction | null;
}
interface EnhancedReceiveAsset extends ReceiveAsset {
  type: 'evm' | 'stellar';
  networkKey: number | string;
  decimals: number;
  baseFee: number;
  tokenAddress?: string;
  isNative?: boolean;
  blockExplorerUrl?: string;
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
  const type: 'evm' | 'stellar' =
    asset.addressType === 'stellar' || asset.walletType === 'stellar' ? 'stellar' : 'evm';
  const networkKey = asset.chainId || 0;
  const decimals = type === 'stellar' ? 7 : 18;
  const baseFee = type === 'stellar' ? 0.00001 : 0.001;

  return {
    ...asset,
    type,
    networkKey,
    decimals: (asset as any).decimals !== undefined ? (asset as any).decimals : decimals,
    baseFee,
  };
};

export const useSendAsset = (onBack?: () => void) => {
  const { connectedWallets, getProvider } = useWalletConnect();
  const { sendTransaction, canHandleTransaction, getSessionInfo } = useTransactionRouter();

  const currentNetwork = useWalletStore(state => state.network);
  const [stellarWalletAssets, setStellarWalletAssets] = useState<any[]>([]);

  useEffect(() => {
    const fetchStellarAssets = async () => {
      const address = connectedWallets[WalletType.STELLAR]?.address;
      if (address) {
        const assets = await fetchStellarAccountAssets(address);
        setStellarWalletAssets(assets);
      } else {
        setStellarWalletAssets([]);
      }
    };
    fetchStellarAssets();
  }, [connectedWallets[WalletType.STELLAR]?.address]);

  const rawAssets: ReceiveAsset[] = useMemo(() => {
    const evmChains = getEVMChains(currentNetwork);
    const evmAssets: ReceiveAsset[] = [];

    for (const chain of evmChains) {
      const tokens = getTokensForChain(chain.chainId);
      for (const token of tokens) {
        evmAssets.push({
          value: token.address ? `${token.symbol}-${chain.chainId}-${token.address}` : `${token.symbol}-${chain.chainId}`,
          label: `${token.symbol} (${chain.name})`,
          symbol: token.symbol,
          logo: token.logoURI || chain.logoUrl || '',
          network: chain.name,
          chainId: chain.chainId,
          addressType: 'evm',
          walletType: WalletType.EVM,
          tokenAddress: token.address,
          decimals: token.decimals,
          isNative: token.isNative,
          blockExplorerUrl: chain.blockExplorerUrl,
        } as any);
      }
    }

    const stellarConfigs = getStellarConfig(currentNetwork);

    const stellarAssets: ReceiveAsset[] = [assetFromStellar(stellarConfigs)];
    stellarAssets[0].value = stellarAssets[0].symbol + '-stellar';
    (stellarAssets[0] as any).isNative = true; // Ensure XLM is treated as native

    if (stellarWalletAssets.length > 0) {
      for (const asset of stellarWalletAssets) {
        if (asset.isNative) continue;
        stellarAssets.push({
          value: `${asset.code}-stellar-${asset.issuer}`,
          label: `${asset.code} (Stellar)`,
          symbol: asset.code,
          logo: '',
          network: 'Stellar',
          chainId: stellarConfigs.chainId,
          addressType: 'stellar',
          walletType: WalletType.STELLAR,
          tokenAddress: asset.issuer,
          decimals: 7,
          isNative: false,
          blockExplorerUrl: 'https://stellar.expert/explorer/public',
        } as any);
      }
    }

    return [...evmAssets, ...stellarAssets];
  }, [currentNetwork, stellarWalletAssets, connectedWallets]);

  const allAssets: EnhancedReceiveAsset[] = useMemo(() => {
    return rawAssets.map(enhanceAsset);
  }, [rawAssets]);

  const availableChains = useMemo(() => {
    const chains: Array<{ id: number | 'stellar' | 'all'; name: string }> = [{ id: 'all', name: 'All Networks' }];
    const seen = new Set<string | number>();

    rawAssets.forEach(a => {
      const id = a.walletType === WalletType.STELLAR ? 'stellar' : a.chainId;
      if (id && !seen.has(id)) {
        seen.add(id);
        chains.push({
          id: id as any,
          name: a.network,
        });
      }
    });

    return chains;
  }, [rawAssets]);

  const [searchParams] = useSearchParams();
  const [selectedChainId, setSelectedChainId] = useState<number | 'stellar' | 'all'>('all');

  const assets = useMemo(() => {
    if (selectedChainId === 'all') return allAssets;
    return allAssets.filter(a => {
      const id = a.walletType === WalletType.STELLAR ? 'stellar' : a.chainId;
      return id === selectedChainId;
    });
  }, [allAssets, selectedChainId]);

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

  // URL driven initialization
  useEffect(() => {
    if (allAssets.length === 0) return;

    const assetSymbol = searchParams.get('asset');
    const chainIdParam = searchParams.get('chainId');

    if (assetSymbol && chainIdParam) {
      const targetChainId = chainIdParam === 'stellar' ? 'stellar' : parseInt(chainIdParam);
      
      const match = allAssets.find(a => {
        const aChainId = a.walletType === WalletType.STELLAR ? 'stellar' : a.chainId;
        return a.symbol === assetSymbol && aChainId === targetChainId;
      });

      if (match) {
        setSelectedAssetValue(match.value);
        setSelectedChainId(targetChainId);
      }
    } else if (!selectedAssetValue && assets.length > 0) {
      setSelectedAssetValue(assets[0].value);
    }
  }, [allAssets, searchParams, selectedAssetValue, assets]);

  // Automatic Chain Switching
  useEffect(() => {
    const assetSymbol = searchParams.get('asset');
    const chainIdParam = searchParams.get('chainId');

    if (assetSymbol && chainIdParam && chainIdParam !== 'stellar') {
      const targetChainId = parseInt(chainIdParam);
      const provider = getProvider(WalletType.EVM);
      
      if (provider && !isNaN(targetChainId)) {
        switchOrAddChain(provider, targetChainId).catch(err => {
          console.error('Failed to switch chain:', err);
        });
      }
    }
  }, [searchParams, getProvider]);

  const currentAsset = useMemo(
    () => allAssets.find(a => a.value === selectedAssetValue),
    [allAssets, selectedAssetValue]
  );

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

  useEffect(() => {
    const fetchBalance = async () => {
      if (!currentAsset || !senderAddress) {
        setBalance(0);
        return;
      }
      setBalance(0);
      setIsFetchingBalance(true);

      try {
        let balStr: string;

        if (currentAsset.type === 'evm' && typeof currentAsset.networkKey === 'number') {
          const config = getEVMNetworkConfig(currentAsset.networkKey);
          const provider = new ethers.JsonRpcProvider(config.rpcUrl);
          balStr = await fetchSingleTokenBalance(
            senderAddress,
            provider,
            currentAsset.tokenAddress || '',
            currentAsset.isNative || false,
            currentAsset.decimals
          );
        } else if (currentAsset.type === 'stellar') {
          const assetKey = currentAsset.isNative ? 'native' : `${currentAsset.symbol}:${currentAsset.tokenAddress}`;
          balStr = await getStellarBalance(assetKey, senderAddress);
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

  useEffect(() => {
    const estimate = async () => {
      if (
        !currentAsset ||
        !senderAddress ||
        !recipientAddress ||
        !amount ||
        parseFloat(amount) <= 0 ||
        !validateAddress(recipientAddress, {
          addressType: currentAsset.addressType as any,
          network: currentAsset.network,
        })
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
            amount,
            currentAsset.isNative ? undefined : currentAsset.tokenAddress,
            currentAsset.decimals
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

        const baseFeeData = {
          totalCost: currentAsset.baseFee.toFixed(
            currentAsset.decimals > 10 ? 8 : currentAsset.decimals
          ),
          totalFee: currentAsset.baseFee.toFixed(
            currentAsset.decimals > 10 ? 8 : currentAsset.decimals
          ),
          isEstimated: true,
          error: e.message?.toLowerCase().includes('insufficient funds')
            ? 'Could not estimate exact fee due to insufficient funds. Showing base fee.'
            : formatErrorMessage(e, 'Fee estimation'),
        };

        setEstimatedFees(baseFeeData);
      } finally {
        setIsEstimatingFees(false);
      }
    };

    const timer = setTimeout(estimate, 500);
    return () => clearTimeout(timer);
  }, [currentAsset, senderAddress, recipientAddress, amount, memo]);

  const validateInputs = useCallback(() => {
    if (!currentAsset) return 'Please select an asset.';
    if (!isWalletConnected) return `Please connect your ${currentAsset.walletType} wallet first.`;
    if (!senderAddress)
      return `No ${currentAsset.type.toUpperCase()} address available. Please ensure your wallet supports ${currentAsset.network}.`;
    if (!recipientAddress.trim()) return 'Recipient address cannot be empty.';
    if (
      !validateAddress(recipientAddress, {
        addressType: currentAsset.addressType as any,
        network: currentAsset.network,
      })
    )
      return `Invalid recipient address for ${currentAsset.network}.`;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return 'Amount must be greater than 0.';
    if (numAmount > balance)
      return `Insufficient balance. Available: ${balance.toLocaleString(undefined, {
        maximumFractionDigits: currentAsset.decimals,
      })} ${currentAsset.value}.`;

    if (estimatedFees && estimatedFees.totalCost) {
      const totalCost = parseFloat(estimatedFees.totalCost);
      const total = numAmount + totalCost;

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
    if (!currentAsset || isFetchingBalance) return;
    const fee =
      estimatedFees && estimatedFees.totalCost
        ? parseFloat(estimatedFees.totalCost)
        : currentAsset.baseFee;

    const max = balance - fee;

    const precision = currentAsset.decimals > 10 ? 8 : currentAsset.decimals;
    setAmount(max > 0 ? max.toFixed(precision) : '0');
  }, [currentAsset, estimatedFees, balance, isFetchingBalance]);

  const handleReviewTransaction = useCallback(async () => {
    setTransactionState(p => ({ ...p, step: 'review', error: null }));
  }, []);

  const handleConfirmTransaction = useCallback(async () => {
    if (!currentAsset || !isWalletConnected || !senderAddress) return;

    try {
      setTransactionState(p => ({ ...p, step: 'signing', error: null }));
      let transactionRequest: TransactionRequest;

      if (currentAsset.type === 'evm') {
        let data: string | undefined = memo || undefined;
        let toAddress = recipientAddress;
        let sendAmount = amount;

        if (!currentAsset.isNative && currentAsset.tokenAddress) {
          const iface = new ethers.Interface(SendErcAbi);
          const amountParsed = ethers.parseUnits(amount, currentAsset.decimals);
          data = iface.encodeFunctionData('transfer', [recipientAddress, amountParsed]);
          toAddress = currentAsset.tokenAddress;
          console.log(toAddress, 'toAddress');
          sendAmount = '0';
        }

        transactionRequest = {
          type: 'evm',
          network: currentAsset.network,
          networkKey: currentAsset.networkKey as number,
          from: senderAddress,
          to: toAddress,
          amount: sendAmount,
          data: data,
        };
      } else if (currentAsset.type === 'stellar') {
        const options: StellarTransactionOptions = {};
        if (memo.trim()) options.memo = memo.trim();
        const stellarTx = await sendCryptoStellarBuild(
          senderAddress,
          recipientAddress,
          amount,
          options,
          {
            code: currentAsset.symbol,
            issuer: currentAsset.tokenAddress,
            isNative: currentAsset.isNative
          }
        );
        const networkPassphrase =
          currentNetwork === 'testnet'
            ? 'Test SDF Network ; September 2015'
            : 'Public Global Stellar Network ; September 2015';
        const networkString = currentNetwork === 'testnet' ? 'TESTNET' : 'PUBLIC';

        transactionRequest = {
          type: 'stellar',
          network: currentAsset.network,
          networkKey: currentAsset.networkKey as string,
          from: senderAddress,
          to: recipientAddress,
          amount,
          data: {
            xdr: stellarTx.xdr,
            networkPassphrase: networkPassphrase,
            network: networkString,
          },
        };
      } else {
        throw new Error(`Unsupported asset type: ${currentAsset.type}`);
      }

      const response = await sendTransaction(transactionRequest);

      if (response.status === 'success') {
        if (currentAsset.type === 'evm' && response.hash) {
          addLocalTransaction({
            hash: response.hash,
            chainId: currentAsset.networkKey as number,
            type: 'send',
            timestamp: Date.now(),
            description: `Send ${amount} ${currentAsset.value}`,
          });
        }

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
    currentNetwork,
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
    } catch { }
  }, []);

  useEffect(() => {
    if (currentAsset) {
      getSessionInfo(currentAsset.walletType);
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
    availableChains,
    selectedChainId,
    setSelectedChainId,
    onBack,
  };
};
