import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SendErcAbi } from '../../../abi/SendErcAbi';
import { validateAddress } from '../../../validator/AddressValidator';
import { estimateEVMFees } from '../../evm/service/evmService';
import { addLocalTransaction } from '../../evm/service/localTransactionService';
import { estimateStellarFees, sendCryptoStellarBuild, getStellarBalance } from '../../steallr/service/stellarService';
import { fetchSingleTokenBalance } from '../../evm/service/tokenListService';
import { rpcManager } from '../../evm/utils/rpcProvider';
import { getEVMNetworkConfig } from '../../evm/utils/evmUtils';
import type { StellarSendTransaction } from '../../steallr/types/stellarTransaction.types';
import { useTransactionRouter } from '../../transction/hook/useTransactionRouter';
import type { TransactionRequest } from '../../transction/router/transactionRouter';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { usePortfolioStore } from '../../walletconnect/store/portfolioStore';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { ethers } from 'ethers';

interface TransactionState {
  txHash: string | null;
  step: 'form' | 'review' | 'signing' | 'success' | 'error';
  error: string | null;
  stellarTransaction?: StellarSendTransaction | null;
}

export interface EnhancedSendAsset {
  value: string;
  symbol: string;
  label: string;
  logo: string;
  network: string;
  chainId: number | string;
  addressType: string;
  walletType: WalletType;
  tokenAddress?: string;
  decimals: number;
  isNative: boolean;
  type: 'evm' | 'stellar';
  networkKey: number | string;
  baseFee: number;
  balance: number;
  blockExplorerUrl?: string;
}

const isUserRejection = (error: any): boolean => {
  if (!error) return false;
  const msg = error.message?.toLowerCase() || '';
  return error.code === 4001 || msg.includes('rejected') || msg.includes('cancelled');
};

const formatErrorMessage = (error: any, context: string): string => {
  if (isUserRejection(error)) return 'Cancelled.';
  return error.message || `${context} failed.`;
};

export const useSendAsset = (onBack?: () => void) => {
  const { connectedWallets } = useWalletConnect();
  const { sendTransaction } = useTransactionRouter();
  const currentNetwork = useWalletStore(state => state.network);
  const storeAssets = usePortfolioStore(state => state.assets);
  const [searchParams, setSearchParams] = useSearchParams();

  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [balance, setBalance] = useState(0);
  const [isFetchingBalance, setIsFetchingBalance] = useState(false);
  const [transactionState, setTransactionState] = useState<TransactionState>({ txHash: null, step: 'form', error: null });
  const [isEstimatingFees, setIsEstimatingFees] = useState(false);
  const [estimatedFees, setEstimatedFees] = useState<any>(null);

  const allAssets: EnhancedSendAsset[] = useMemo(() => {
    return storeAssets
      .filter(a => (a.balance || 0) > 0)
      .map(asset => {
        const type = asset.chainType === 'stellar' ? 'stellar' : 'evm' as const;
        const chainId = asset.chainId || (type === 'stellar' ? 9000000 : 0);
        return {
          value: asset.id, symbol: asset.symbol, label: `${asset.symbol} (${asset.chainName})`, logo: asset.image,
          network: asset.chainName, chainId, addressType: type, walletType: type === 'stellar' ? WalletType.STELLAR : WalletType.EVM,
          tokenAddress: asset.address, decimals: asset.decimals || (type === 'stellar' ? 7 : 18),
          isNative: asset.isNative || false, type, networkKey: chainId,
          baseFee: type === 'stellar' ? 0.00001 : 0.001, balance: asset.balance || 0,
          blockExplorerUrl: (asset as any).blockExplorerUrl
        };
      });
  }, [storeAssets]);

  const assetParam = searchParams.get('asset');
  const chainIdParam = searchParams.get('chainId');

  const currentAsset = useMemo(() => {
    if (assetParam && chainIdParam) {
      return allAssets.find(a => {
        const aChainIdStr = String(a.chainId);
        const paramIdStr = chainIdParam === 'stellar' ? '9000000' : chainIdParam;
        return a.symbol === assetParam && aChainIdStr === paramIdStr;
      });
    }
    return undefined;
  }, [allAssets, assetParam, chainIdParam]);

  useEffect(() => {
    if (!currentAsset && allAssets.length > 0) {
      const first = allAssets[0];
      const tarChain = first.chainId === 9000000 ? 'stellar' : String(first.chainId);
      if (assetParam !== first.symbol || chainIdParam !== tarChain) {
        setSearchParams({ asset: first.symbol, chainId: tarChain }, { replace: true });
      }
    }
  }, [currentAsset, allAssets, assetParam, chainIdParam, setSearchParams]);

  const senderAddress = useMemo(() => currentAsset ? connectedWallets[currentAsset.walletType]?.address || null : null, [connectedWallets, currentAsset]);

  useEffect(() => {
    const fetchBalance = async () => {
      if (!currentAsset || !senderAddress) return;
      
      const storeItem = storeAssets.find(a => a.id === currentAsset.value);
      if (storeItem) setBalance(storeItem.balance || 0);

      setIsFetchingBalance(true);
      try {
        let balStr: string;
        if (currentAsset.type === 'evm') {
          const config = getEVMNetworkConfig(Number(currentAsset.networkKey));
          balStr = await rpcManager.fetchWithFallback(
            Number(currentAsset.networkKey),
            config.rpcUrls,
            async (provider) => fetchSingleTokenBalance(senderAddress, provider, currentAsset.tokenAddress || '', currentAsset.isNative, currentAsset.decimals)
          );
        } else {
          const key = currentAsset.isNative ? 'native' : `${currentAsset.symbol}:${currentAsset.tokenAddress}`;
          balStr = await getStellarBalance(key, senderAddress);
        }
        setBalance(parseFloat(balStr));
      } catch (e) {
        console.error('Balance error:', e);
      } finally {
        setIsFetchingBalance(false);
      }
    };
    fetchBalance();
  }, [currentAsset, senderAddress, storeAssets]);

  useEffect(() => {
    const estimate = async () => {
      if (!currentAsset || !senderAddress || !recipientAddress || !amount || parseFloat(amount) <= 0 || !validateAddress(recipientAddress, { addressType: currentAsset.addressType as any, network: currentAsset.network })) {
        setEstimatedFees(null); return;
      }
      setIsEstimatingFees(true);
      try {
        let fees;
        if (currentAsset.type === 'evm') {
          fees = await estimateEVMFees(Number(currentAsset.networkKey), senderAddress, recipientAddress, amount, currentAsset.isNative ? undefined : currentAsset.tokenAddress, currentAsset.decimals);
        } else {
          fees = await estimateStellarFees();
        }
        setEstimatedFees(fees);
      } catch (e: any) {
        setEstimatedFees({ totalCost: currentAsset.baseFee.toFixed(8), error: formatErrorMessage(e, 'Fee') });
      } finally { setIsEstimatingFees(false); }
    };
    const timer = setTimeout(estimate, 500);
    return () => clearTimeout(timer);
  }, [currentAsset, senderAddress, recipientAddress, amount, memo]);

  const handleConfirmTransaction = async () => {
    if (!currentAsset || !senderAddress) return;
    try {
      setTransactionState(p => ({ ...p, step: 'signing', error: null }));
      let req: TransactionRequest;
      if (currentAsset.type === 'evm') {
        let data: string | undefined = memo || undefined;
        let to = recipientAddress;
        let sendAmt = amount;
        if (!currentAsset.isNative && currentAsset.tokenAddress) {
          data = new ethers.Interface(SendErcAbi).encodeFunctionData('transfer', [recipientAddress, ethers.parseUnits(amount, currentAsset.decimals)]);
          to = currentAsset.tokenAddress; sendAmt = '0';
        }
        req = { type: 'evm', network: currentAsset.network, networkKey: Number(currentAsset.networkKey), from: senderAddress, to, amount: sendAmt, data };
      } else {
        const tx = await sendCryptoStellarBuild(senderAddress, recipientAddress, amount, memo ? { memo } : {}, { code: currentAsset.symbol, issuer: currentAsset.tokenAddress, isNative: currentAsset.isNative });
        req = { type: 'stellar', network: currentAsset.network, networkKey: String(currentAsset.networkKey), from: senderAddress, to: recipientAddress, amount, data: { xdr: tx.xdr, network: currentNetwork === 'testnet' ? 'TESTNET' : 'PUBLIC' } };
      }
      const res = await sendTransaction(req);
      if (res.status === 'success') {
        addLocalTransaction({ hash: res.hash || '', chainId: currentAsset.type === 'evm' ? Number(currentAsset.networkKey) : 9000000, type: 'send', timestamp: Date.now(), status: 'success', from: senderAddress, network: currentNetwork, description: `Send ${amount} ${currentAsset.symbol}` });
        setTransactionState(p => ({ ...p, txHash: res.hash || null, step: 'success' }));
        setTimeout(() => { setRecipientAddress(''); setAmount(''); setMemo(''); setTransactionState({ txHash: null, step: 'form', error: null }); }, 3000);
      } else throw new Error(res.error || 'Failed');
    } catch (e: any) { setTransactionState(p => ({ ...p, step: 'error', error: formatErrorMessage(e, 'Tx') })); }
  };

  const handleMaxClick = useCallback(() => {
    if (!currentAsset) return;
    const fee = estimatedFees?.totalCost ? parseFloat(estimatedFees.totalCost) : currentAsset.baseFee;
    const max = Math.max(0, balance - fee);
    setAmount(max.toFixed(currentAsset.decimals > 10 ? 8 : currentAsset.decimals));
  }, [currentAsset, estimatedFees, balance]);

  const copyToClipboard = async (text: string, _label?: string) => {
    try { await navigator.clipboard.writeText(text); } catch (e) { console.error('Copy error', e); }
  };

  return {
    recipientAddress, setRecipientAddress, amount, setAmount, memo, setMemo,
    balance, isFetchingBalance,
    transactionState, setTransactionState, isEstimatingFees, estimatedFees,
    currentAsset, senderAddress, isWalletConnected: !!senderAddress,
    handleMaxClick,
    handleReviewTransaction: () => setTransactionState(p => ({ ...p, step: 'review' })),
    handleConfirmTransaction,
    handleBackToForm: () => setTransactionState({ txHash: null, step: 'form', error: null }),
    handleRetryTransaction: () => setTransactionState({ txHash: null, step: 'form', error: null }),
    copyToClipboard,
    formError: (!currentAsset) ? 'Select asset' : (!senderAddress) ? 'Connect wallet' : (!validateAddress(recipientAddress, { addressType: currentAsset.addressType as any, network: currentAsset.network })) ? 'Invalid address' : (parseFloat(amount) > balance) ? 'Insufficient funds' : null,
    assets: allAssets, availableChains: [], onBack
  };
};
