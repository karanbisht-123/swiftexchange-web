import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SendErcAbi } from '../../../abi/SendErcAbi';
import { validateAddress } from '../../../validator/AddressValidator';
import { estimateEVMFees } from '../../evm/service/evmService';
import { addLocalTransaction } from '../../evm/service/localTransactionService';
import { checkTrustlineExists, estimateStellarFees, sendCryptoStellarBuild, getStellarBalance } from '../../steallr/service/stellarService';
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
import { parseSwapError } from '../../evm/utils/swapErrorHandler';
import BigNumber from 'bignumber.js';

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
  type: 'evm' | 'stellar' | 'dydx';
  networkKey: number | string;
  baseFee: number;
  balance: number;
  blockExplorerUrl?: string;
}



const formatErrorMessage = (error: any, _context: string): string => {
  return parseSwapError(error);
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
  const [balance, setBalance] = useState('0');
  const [isFetchingBalance, setIsFetchingBalance] = useState(false);
  const [transactionState, setTransactionState] = useState<TransactionState>({ txHash: null, step: 'form', error: null });
  const [isEstimatingFees, setIsEstimatingFees] = useState(false);
  const [estimatedFees, setEstimatedFees] = useState<any>(null);
  const [hasTrustline, setHasTrustline] = useState<boolean | null>(null);
  const [recipientHasTrustline, setRecipientHasTrustline] = useState<boolean | null>(null);
  const [isFetchingRecipientTrust, setIsFetchingRecipientTrust] = useState(false);

  const allAssets: EnhancedSendAsset[] = useMemo(() => {
    return storeAssets
      .filter(a => (a.balance || 0) > 0)
      .map(asset => {
        const type = asset.chainType === 'stellar' ? 'stellar' : (asset.chainType === 'dydx' ? 'dydx' : 'evm' as const);
        const chainId = asset.chainId || (type === 'stellar' ? 'pubnet' : 0);
        return {
          value: asset.id, symbol: asset.symbol, label: `${asset.symbol} (${asset.chainName})`, logo: asset.image,
          network: asset.chainName, chainId, addressType: type === 'dydx' ? 'cosmos' : type, walletType: type === 'stellar' ? WalletType.STELLAR : WalletType.EVM,
          tokenAddress: asset.address, decimals: asset.decimals || (type === 'stellar' ? 7 : 18),
          isNative: asset.isNative || false, type, networkKey: chainId,
          baseFee: type === 'stellar' ? 0.00001 : (type === 'dydx' ? 0.0001 : 0.001), balance: asset.balance || 0,
          blockExplorerUrl: asset.blockExplorerUrl
        };
      });
  }, [storeAssets]);

  const assetParam = searchParams.get('asset');
  const chainIdParam = searchParams.get('chainId');

  const currentAsset = useMemo(() => {
    if (assetParam && chainIdParam) {
      return allAssets.find(a => {
        const aChainIdStr = String(a.chainId);
        const paramIdStr = chainIdParam === 'stellar' ? 'pubnet' : chainIdParam;
        return a.symbol === assetParam && aChainIdStr === paramIdStr;
      });
    }
    return undefined;
  }, [allAssets, assetParam, chainIdParam]);

  useEffect(() => {
    if (!currentAsset && allAssets.length > 0) {
      const first = allAssets[0];
      const tarChain = first.chainId === 'pubnet' ? 'stellar' : String(first.chainId);
      if (assetParam !== first.symbol || chainIdParam !== tarChain) {
        setSearchParams({ asset: first.symbol, chainId: tarChain }, { replace: true });
      }
    }
  }, [currentAsset, allAssets, assetParam, chainIdParam, setSearchParams]);

  const senderAddress = useMemo(() => {
    if (!currentAsset) return null;
    if (currentAsset.type === 'dydx') {
      return (connectedWallets.evm as any)?.dydxAddress || (connectedWallets.cosmos as any)?.dydxAddress || localStorage.getItem('sx_dkm_addr');
    }
    return connectedWallets[currentAsset.walletType]?.address || null;
  }, [connectedWallets, currentAsset]);

  const fetchBalance = useCallback(async () => {
    if (!currentAsset || !senderAddress) return;

    const storeItem = storeAssets.find(a => a.id === currentAsset.value);
    if (storeItem) setBalance(storeItem.balance?.toString() || '0');

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
      } else if (currentAsset.type === 'stellar') {
        const key = currentAsset.isNative ? 'native' : `${currentAsset.symbol}:${currentAsset.tokenAddress}`;
        balStr = await getStellarBalance(key, senderAddress);
      } else {
        // dydx balance is already in storeAssets, but we can refresh via service if needed
        balStr = currentAsset.balance.toString();
      }
      setBalance(balStr);
    } catch (e) {
      console.error('Balance error:', e);
    } finally {
      setTimeout(() => setIsFetchingBalance(false), 500);
    }
  }, [currentAsset, senderAddress, storeAssets]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    const checkTrust = async () => {
      if (currentAsset?.type === 'stellar' && !currentAsset.isNative && senderAddress) {
        try {
          const exists = await checkTrustlineExists(senderAddress, currentAsset.symbol, currentAsset.tokenAddress || '');
          setHasTrustline(exists);
        } catch (e) {
          setHasTrustline(false);
        }
      } else {
        setHasTrustline(true);
      }
    };
    checkTrust();
  }, [currentAsset, senderAddress]);

  useEffect(() => {
    const checkRecipientTrust = async () => {
      if (currentAsset?.type === 'stellar' && !currentAsset.isNative && recipientAddress && validateAddress(recipientAddress, { addressType: 'stellar', network: currentAsset.network })) {
        setIsFetchingRecipientTrust(true);
        try {
          const exists = await checkTrustlineExists(recipientAddress, currentAsset.symbol, currentAsset.tokenAddress || '');
          setRecipientHasTrustline(exists);
        } catch (e) {
          setRecipientHasTrustline(false);
        } finally {
          setIsFetchingRecipientTrust(false);
        }
      } else {
        setRecipientHasTrustline(true);
        setIsFetchingRecipientTrust(false);
      }
    };
    const timer = setTimeout(checkRecipientTrust, 500);
    return () => clearTimeout(timer);
  }, [currentAsset, recipientAddress]);

  useEffect(() => {
    const estimate = async () => {
      if (!currentAsset || !senderAddress || !recipientAddress || !amount || parseFloat(amount) <= 0 || !validateAddress(recipientAddress, { addressType: currentAsset.addressType as any, network: currentAsset.network })) {
        setEstimatedFees(null); return;
      }
      setIsEstimatingFees(true);
      try {
        let fees;
        if (currentAsset.type === 'evm') {
          fees = await estimateEVMFees(Number(currentAsset.networkKey), senderAddress, recipientAddress, amount || '0.0001', currentAsset.isNative ? undefined : currentAsset.tokenAddress, currentAsset.decimals);
        } else if (currentAsset.type === 'stellar') {
          fees = await estimateStellarFees();
        } else {
          fees = { totalCost: '0.0001', error: null }; // dYdX fees are very low/fixed for now
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
    if (!currentAsset || !senderAddress) {
      console.warn('[useSendAsset] Cannot confirm transaction: missing asset or sender address');
      return;
    }

    console.log('[useSendAsset] handleConfirmTransaction initiated', {
      asset: currentAsset.symbol,
      network: currentAsset.network,
      recipient: recipientAddress,
      amount: amount
    });

    try {
      setTransactionState(p => ({ ...p, step: 'signing', error: null }));
      let req: TransactionRequest;

      if (currentAsset.type === 'evm') {
        console.log('[useSendAsset] Building EVM transaction request');
        let data: string | undefined = memo || undefined;
        let to = recipientAddress;
        let sendAmt = amount;

        if (!currentAsset.isNative && currentAsset.tokenAddress) {
          console.log('[useSendAsset] Preparing ERC20 transfer data');
          data = new ethers.Interface(SendErcAbi).encodeFunctionData('transfer', [recipientAddress, ethers.parseUnits(amount, currentAsset.decimals)]);
          to = currentAsset.tokenAddress;
          sendAmt = '0';
        }

        req = { type: 'evm', network: currentAsset.network, networkKey: Number(currentAsset.networkKey), from: senderAddress, to, amount: sendAmt, data };
        console.log('[useSendAsset] Sending transaction request to router:', req);
        const res = await sendTransaction(req);
        //  persist evm tx to localStorage so history shows up
        addLocalTransaction({
          hash: res.hash || 'unknown',
          chainId: currentAsset.chainId,
          type: 'send',
          timestamp: Date.now(),
          status: 'success',
          from: senderAddress,
          network: currentNetwork,
          description: `Send ${amount} ${currentAsset.symbol} on ${currentAsset.network}`
        });

        setTransactionState(p => ({ ...p, txHash: res.hash || null, step: 'success' }));
      } else if (currentAsset.type === 'stellar') {
        console.log('[useSendAsset] Building Stellar transaction request');

        const executeStellarWithRetry = async (retryCount = 0): Promise<any> => {
          try {
            const tx = await sendCryptoStellarBuild(senderAddress, recipientAddress, amount, memo ? { memo } : {}, {
              code: currentAsset.symbol,
              issuer: currentAsset.tokenAddress,
              isNative: currentAsset.isNative
            });

            req = {
              type: 'stellar',
              network: currentAsset.network,
              networkKey: currentNetwork === 'testnet' ? 'testnet' : 'pubnet',
              from: senderAddress,
              to: recipientAddress,
              amount,
              data: { xdr: tx.xdr, network: currentNetwork === 'testnet' ? 'TESTNET' : 'PUBNET' }
            };

            console.log(`[useSendAsset] Sending transaction request to router (attempt ${retryCount + 1}):`, req);
            const res = await sendTransaction(req);
            return res;
          } catch (err: any) {
            const errorStr = (err.message || JSON.stringify(err)).toLowerCase();
            const isSequenceError = errorStr.includes('tx_bad_seq') || errorStr.includes('sequence_mismatch') || errorStr.includes('bad sequence');

            if (retryCount < 1 && isSequenceError) {
              console.warn('[useSendAsset] Stellar sequence mismatch detected. Retrying with fresh account data...');
              await new Promise(resolve => setTimeout(resolve, 1500));
              return executeStellarWithRetry(retryCount + 1);
            }
            throw err;
          }
        };

        const res = await executeStellarWithRetry();

        if (res.status !== 'success') throw new Error(res.error || 'Failed');

        //  persist stellar tx to localStorage so history shows up
        addLocalTransaction({
          hash: res.hash || 'unknown',
          chainId: currentAsset.chainId,
          type: 'send',
          timestamp: Date.now(),
          status: 'success',
          from: senderAddress,
          network: currentNetwork,
          description: `Send ${amount} ${currentAsset.symbol} (Stellar)`
        });

        setTransactionState(p => ({ ...p, txHash: res.hash || null, step: 'success' }));
      } else {
        // dYdX direct handling via service
        console.log('[useSendAsset] Handling dYdX transaction via service');
        const { dydxWalletService } = await import('../../dydx/service/dydxWalletService');
        let result;
        if (currentAsset.symbol === 'USDC') {
          // USDC is collateral, needs withdraw
          result = await dydxWalletService.withdraw(amount, recipientAddress);
        } else {
          // Native DYDX
          result = await dydxWalletService.send(amount, recipientAddress);
        }

        if (!result.success) throw new Error(result.error || 'Transaction failed');

        addLocalTransaction({
          hash: result.transactionHash || 'unknown',
          chainId: currentAsset.chainId,
          type: 'send',
          timestamp: Date.now(),
          status: 'success',
          from: senderAddress,
          network: currentNetwork,
          description: `Send ${amount} ${currentAsset.symbol} (dYdX)`
        });

        setTransactionState(p => ({ ...p, txHash: result.transactionHash || 'unknown', step: 'success' }));
        setTimeout(() => { setRecipientAddress(''); setAmount(''); setMemo(''); setTransactionState({ txHash: null, step: 'form', error: null }); }, 3000);
      }
    } catch (e: any) {
      console.error('[useSendAsset] Transaction exception caught:', e);
      setTransactionState(p => ({ ...p, step: 'error', error: formatErrorMessage(e, 'Tx') }));
    }
  };

  const handleMaxClick = useCallback(() => {
    if (!currentAsset) return;

    const bnBalance = new BigNumber(balance);
    const fee = estimatedFees?.totalCost
      ? new BigNumber(estimatedFees.totalCost)
      : new BigNumber(currentAsset.baseFee);

    let maxAmount: BigNumber;

    if (currentAsset.isNative) {
      maxAmount = bnBalance.minus(fee);
    } else {
      maxAmount = bnBalance;
    }

    if (maxAmount.isLessThanOrEqualTo(0)) {
      setAmount('0');
      return;
    }

    const amountStr = maxAmount.toFixed(currentAsset.decimals, BigNumber.ROUND_DOWN);
    setAmount(amountStr.replace(/(\.[0-9]*[1-9])0+$/, "$1").replace(/\.0+$/, ""));
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
    handleRefreshBalances: fetchBalance,
    handleReviewTransaction: () => setTransactionState(p => ({ ...p, step: 'review' })),
    handleConfirmTransaction,
    handleBackToForm: () => setTransactionState({ txHash: null, step: 'form', error: null }),
    handleRetryTransaction: () => setTransactionState({ txHash: null, step: 'form', error: null }),
    copyToClipboard,
    formError: (!currentAsset) ? 'Select asset' : (!senderAddress) ? 'Connect wallet' : (recipientAddress && !validateAddress(recipientAddress, { addressType: currentAsset.addressType as any, network: currentAsset.network })) ? 'Invalid address' : (amount && amount !== '.' && new BigNumber(amount).isGreaterThan(balance) && hasTrustline) ? 'Insufficient funds' : null,
    assets: allAssets, availableChains: [], onBack,
    needsTrustline: hasTrustline === false,
    recipientNeedsTrustline: recipientHasTrustline === false,
    isFetchingRecipientTrust,
    buttonLabel: (hasTrustline === false) ? 'Add Trust & Send' : (transactionState.step === 'review' ? 'Send Now' : 'Continue to Review')
  };
};