import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  ExternalLink,
  Loader2,
  TrendingUp,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ethers } from 'ethers';

import { ERC20_ABI } from '../../../../abi/Erc20AbI';
import { ROUTES } from '../../../../constants/routes';
import StellarActiveGuard from '../../../walletconnect/components/StellarActiveGuard';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import {
  type BridgeTransaction,
  getBridgeQuote,
  prepareBridgeTransaction,
} from '../../service/evmSwapService';
import { addLocalTransaction } from '../../service/localTransactionService';
import {
  type ChainConfig,
  type WellKnownTokens,
  getChainById,
  getChainsForNetwork,
} from '../../utils/Chainregistry';
import { rpcManager } from '../../utils/rpcProvider';

interface Asset {
  id: string;
  symbol: string;
  name: string;
  image: string;
  balance: number;
  current_price: number;
  contractAddress?: string;
  chainId?: number;
}

type TokenType = 'USDT' | 'USDC';
type FeeType = 'native' | 'stablecoin';
type TxStatus = 'idle' | 'preparing' | 'approving' | 'transferring' | 'success' | 'error';

interface QuoteData {
  quotes: {
    conversionRate: string;
    minimumAmountOut: string;
    slippageTolerance: string;
    fee: {
      native: { amount: string; symbol: string };
      stablecoin: { amount: string; symbol: string };
    };
    completionTime: number;
  };
}

interface EvmToStellarBridgeProps {
  selectedAsset?: Asset;
}

const getIconUrl = (symbol: string, chainConfig?: ChainConfig): string => {
  if (!chainConfig) return 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png';

  if (symbol === chainConfig.nativeCurrency.symbol) {
    return chainConfig.nativeCurrency.logoURI;
  }

  const tokenAddress = chainConfig.tokens[symbol as keyof WellKnownTokens];
  if (tokenAddress) {
    const asset = chainConfig.assets.find(
      a => a.address.toLowerCase() === tokenAddress.toLowerCase()
    );
    if (asset?.logoURI) return asset.logoURI;
  }

  return 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png';
};

const STELLAR_USDC_ICON = 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png';

const EvmToStellarBridge: React.FC<EvmToStellarBridgeProps> = ({ selectedAsset }) => {
  const navigate = useNavigate();

  const { connectedWallets, getProvider } = useWalletConnect();
  const currentNetwork = useWalletStore(state => state.network);

  const evmWallet = connectedWallets[WalletType.EVM];
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const evmAddress = evmWallet?.address;
  const stellarAddress = stellarWallet?.address;
  const provider = getProvider(WalletType.EVM);

  const evmChains = useMemo(() => getChainsForNetwork(currentNetwork), [currentNetwork]);

  const supportedNetworks = useMemo(
    () =>
      evmChains
        .filter(chain => chain.available)
        .map(chain => ({
          id:
            chain.slug === 'eth' ? 'ETH' : chain.slug === 'bsc' ? 'BNB' : chain.slug.toUpperCase(),
          chainId: chain.chainId,
          name: chain.name,
          symbol: chain.nativeCurrency.symbol,
          icon: chain.nativeCurrency.logoURI,
        })),
    [evmChains]
  );

  const initialChainId = useMemo(() => {
    if (selectedAsset?.chainId) return selectedAsset.chainId;
    const ethChain = evmChains.find(c => c.slug === 'eth');
    if (ethChain) return ethChain.chainId;
    const bscChain = evmChains.find(c => c.slug === 'bsc');
    if (bscChain) return bscChain.chainId;
    return supportedNetworks[0]?.chainId || 1;
  }, [selectedAsset, evmChains, supportedNetworks]);

  const [selectedChainId, setSelectedChainId] = useState<number>(initialChainId);

  const currentChainConfig = useMemo(() => {
    return evmChains.find(c => c.chainId === selectedChainId);
  }, [evmChains, selectedChainId]);

  const selectedNetworkId = useMemo(() => {
    if (!currentChainConfig) return 'ETH';
    if (currentChainConfig.slug === 'eth') return 'ETH';
    if (currentChainConfig.slug === 'bsc') return 'BNB';
    return currentChainConfig.slug.toUpperCase();
  }, [currentChainConfig]);

  const [selectedToken, setSelectedToken] = useState<TokenType>(() => {
    if (selectedAsset?.symbol) {
      const sym = selectedAsset.symbol.toUpperCase();
      if (sym === 'USDC' || sym === 'USDT') return sym as TokenType;
    }
    return 'USDT';
  });
  const [selectedFeeType, setSelectedFeeType] = useState<FeeType>('stablecoin');
  const [amount, setAmount] = useState('');
  const [tokenBalance, setTokenBalance] = useState('0');
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isChainSwitching, setIsChainSwitching] = useState(false);
  const [isPreparingBridge, setIsPreparingBridge] = useState(false);
  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [quoteData, setQuoteData] = useState<QuoteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const errorRef = useRef<HTMLDivElement>(null);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const initializedAssetIdRef = useRef<string | null>(null);

  const parseError = (err: string | null) => {
    if (!err) return null;

    const balanceMatch = err.match(
      /Insufficient (\w+) balance\. Have: ([\d.]+).*, Need: ~?([\d.]+)/i
    );
    if (balanceMatch) {
      return {
        type: 'insufficient_balance',
        asset: balanceMatch[1],
        have: balanceMatch[2],
        need: balanceMatch[3],
        message: `You need more ${balanceMatch[1]} to cover the bridge fee and gas.`,
      };
    }

    const gasMatch = err.match(/You do not have enough (\w+) to cover the gas fees/i);
    if (gasMatch) {
      return {
        type: 'insufficient_balance',
        asset: gasMatch[1],
        message: `You do not have enough ${gasMatch[1]} to cover the network gas fees for this transaction.`,
      };
    }

    return {
      type: 'general',
      message: err,
    };
  };

  const parsedError = parseError(error);

  const currentChainIdFromWallet = evmWallet?.chainId ? Number(evmWallet.chainId) : null;

  useEffect(() => {
    if (!selectedAsset || initializedAssetIdRef.current === selectedAsset.id) return;

    initializedAssetIdRef.current = selectedAsset.id;
    const assetChainId = selectedAsset.chainId;

    if (assetChainId) {
      setSelectedChainId(assetChainId);
    }

    const symbol = selectedAsset.symbol?.toUpperCase();
    if (symbol === 'USDC' || symbol === 'USDT') {
      setSelectedToken(symbol as TokenType);
    }

    setAmount('');
    setQuoteData(null);
    setError(null);
  }, [selectedAsset, supportedNetworks]);

  const handleChainSwitch = useCallback(
    async (newChainId: number) => {
      if (!provider) return;

      if (currentChainIdFromWallet === newChainId) {
        setSelectedChainId(newChainId);
        return;
      }

      setIsChainSwitching(true);
      setError(null);

      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${newChainId.toString(16)}` }],
        });
        setSelectedChainId(newChainId);
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          const chainConfig = evmChains.find(c => c.chainId === newChainId);
          if (chainConfig) {
            try {
              await provider.request({
                method: 'wallet_addEthereumChain',
                params: [
                  {
                    chainId: `0x${newChainId.toString(16)}`,
                    chainName: chainConfig.name,
                    nativeCurrency: chainConfig.nativeCurrency,
                    rpcUrls: [chainConfig.rpcUrl, ...(chainConfig.fallbackRpcUrls || [])],
                    blockExplorerUrls: [chainConfig.blockExplorerUrl],
                  },
                ],
              });
              setSelectedChainId(newChainId);
            } catch {
              setError('Failed to add network');
            }
          }
        } else if (switchError.code !== 4001) {
          setError('Failed to switch network');
        }
      } finally {
        setIsChainSwitching(false);
      }
    },
    [provider, currentChainIdFromWallet, evmChains]
  );

  useEffect(() => {
    if (parsedError && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [parsedError]);

  const fetchBalance = useCallback(async () => {
    if (!evmAddress || !provider || !currentChainConfig) {
      setTokenBalance('0');
      return;
    }

    setIsLoadingBalance(true);
    setError(null);

    try {
      const chain = getChainById(selectedChainId);
      if (!chain) return;

      const tokenAddress = selectedToken === 'USDT' ? chain.tokens.USDT : chain.tokens.USDC;
      if (!tokenAddress) {
        setTokenBalance('0');
        return;
      }

      const urls = [currentChainConfig.rpcUrl, ...(currentChainConfig.fallbackRpcUrls || [])];

      const { balance, decimals } = await rpcManager.fetchWithFallback(
        selectedChainId,
        urls,
        async p => {
          const contract = new ethers.Contract(tokenAddress, ERC20_ABI, p);
          const [b, d] = await Promise.all([contract.balanceOf(evmAddress), contract.decimals()]);
          return { balance: b, decimals: d };
        }
      );

      setTokenBalance(ethers.formatUnits(balance, decimals));
    } catch (err: any) {
      console.error('[EvmToStellarBridge] Balance fetch failed:', err);
      setTokenBalance('0');
    } finally {
      setIsLoadingBalance(false);
    }
  }, [evmAddress, provider, selectedChainId, selectedToken, currentChainConfig]);

  useEffect(() => {
    if (evmAddress && !isChainSwitching) fetchBalance();
  }, [fetchBalance, evmAddress, selectedChainId, selectedToken, isChainSwitching]);

  const fetchQuote = useCallback(
    async (amountValue: string) => {
      const num = parseFloat(amountValue);
      if (isNaN(num) || num <= 0) {
        setQuoteData(null);
        return;
      }

      setIsLoadingQuote(true);
      setError(null);

      try {
        const response = await getBridgeQuote(amountValue, selectedNetworkId, selectedToken);
        setQuoteData(response);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch quote');
        setQuoteData(null);
      } finally {
        setIsLoadingQuote(false);
      }
    },
    [selectedNetworkId, selectedToken]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (amount && parseFloat(amount) > 0 && !isChainSwitching) {
      debounceRef.current = setTimeout(() => fetchQuote(amount), 800);
    } else {
      setQuoteData(null);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [amount, fetchQuote, isChainSwitching]);

  const parsedAmount = parseFloat(amount) || 0;
  const hasInsufficientBalance = parsedAmount > parseFloat(tokenBalance);
  const isValidAmount = parsedAmount >= 0.01 && !hasInsufficientBalance;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (value === '') {
      setAmount('');
      return;
    }
    if (!/^[0-9.]*$/.test(value)) return;

    const parts = value.split('.');
    if (parts.length > 2) return;
    if (parts[0].length > 1 && parts[0].startsWith('0') && !value.startsWith('0.')) {
      value = (parts[0].replace(/^0+/, '') || '0') + (parts[1] !== undefined ? '.' + parts[1] : '');
    }
    if (parts[1] && parts[1].length > 6) value = parts[0] + '.' + parts[1].slice(0, 6);
    if (parseFloat(value) > 999_999_999) return;

    setAmount(value);
  };

  const handleMaxClick = async () => {
    if (!evmAddress || !provider || !currentChainConfig) return;

    try {
      const chain = getChainById(selectedChainId);
      if (!chain) return;

      const isNative = selectedToken === currentChainConfig.nativeCurrency.symbol;
      const tokenAddress = selectedToken === 'USDT' ? chain.tokens.USDT : chain.tokens.USDC;
      const urls = [currentChainConfig.rpcUrl, ...(currentChainConfig.fallbackRpcUrls || [])];

      if (isNative) {
        const balance = await rpcManager.fetchWithFallback(selectedChainId, urls, p =>
          p.getBalance(evmAddress)
        );
        const gasBuffer = ethers.parseEther('0.01');
        if (balance > gasBuffer) {
          const maxAmount = balance - gasBuffer;
          setAmount(ethers.formatEther(maxAmount));
        } else {
          setAmount('0');
        }
      } else if (tokenAddress) {
        const { balance, decimals } = await rpcManager.fetchWithFallback(
          selectedChainId,
          urls,
          async p => {
            const contract = new ethers.Contract(tokenAddress, ERC20_ABI, p);
            const [b, d] = await Promise.all([contract.balanceOf(evmAddress), contract.decimals()]);
            return { balance: b, decimals: d };
          }
        );
        setAmount(ethers.formatUnits(balance, decimals));
      }
    } catch (err) {
      console.error('Failed to get max balance:', err);
    }
  };

  const sendTransaction = async (bridgeTx: BridgeTransaction): Promise<string> => {
    if (!provider) throw new Error('Wallet not connected');

    const { transaction, txMeta } = bridgeTx;
    const txParams: any = {
      from: transaction.from,
      to: transaction.to,
      value: `0x${BigInt(transaction.value).toString(16)}`,
      data: transaction.data,
      gasLimit: `0x${parseInt(txMeta.gasLimit).toString(16)}`,
    };

    if (txMeta.feeData.maxFeePerGas && txMeta.feeData.maxPriorityFeePerGas) {
      txParams.maxFeePerGas = `0x${BigInt(txMeta.feeData.maxFeePerGas).toString(16)}`;
      txParams.maxPriorityFeePerGas = `0x${BigInt(txMeta.feeData.maxPriorityFeePerGas).toString(16)}`;
    } else if (txMeta.feeData.gasPrice) {
      txParams.gasPrice = `0x${BigInt(txMeta.feeData.gasPrice).toString(16)}`;
    }

    const txHash = await provider.request({ method: 'eth_sendTransaction', params: [txParams] });
    await waitForTransaction(txHash);
    return txHash;
  };

  const waitForTransaction = async (txHash: string): Promise<void> => {
    const chainConfig = evmChains.find(c => c.chainId === selectedChainId);
    if (!chainConfig) throw new Error('Chain config not found');

    const urls = [chainConfig.rpcUrl, ...(chainConfig.fallbackRpcUrls || [])];

    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const receipt = await rpcManager.fetchWithFallback(selectedChainId, urls, p =>
          p.getTransactionReceipt(txHash)
        );
        if (receipt) {
          if (receipt.status === 0) throw new Error('Transaction reverted');
          return;
        }
      } catch (err) {
        console.warn('[EvmToStellarBridge] Error fetching receipt', err);
      }
      await new Promise(r => setTimeout(r, 2000));
    }

    throw new Error('Transaction confirmation timeout');
  };

  const handleProceed = async () => {
    if (!quoteData || !isValidAmount || !provider || !stellarAddress || !evmAddress) return;

    setIsPreparingBridge(true);
    setTxStatus('preparing');
    setError(null);

    try {
      const bridgeResponse = await prepareBridgeTransaction({
        amount,
        feePayType: selectedFeeType,
        fromAddress: evmAddress,
        destinationAddress: stellarAddress,
        sourceToken: selectedToken,
        destinationToken: 'USDC',
        walletType: selectedNetworkId,
      });

      const { needsApproval, transactions } = bridgeResponse;
      const approveTx = transactions.find(tx => tx.type === 'approve');
      const transferTx = transactions.find(tx => tx.type === 'transfer');

      if (needsApproval && approveTx) {
        setTxStatus('approving');
        await sendTransaction(approveTx);
      }

      if (transferTx) {
        setTxStatus('transferring');
        const hash = await sendTransaction(transferTx);
        setTxHash(hash);

        addLocalTransaction({
          hash,
          chainId: selectedChainId,
          type: 'bridge',
          timestamp: Date.now(),
          description: `Bridge ${amount} ${selectedToken} (EVM) → USDC (Stellar)`,
          status: 'pending',
        });
      }

      setTxStatus('success');
    } catch (err: any) {
      setTxStatus('error');
      const errorMsg = err.message || 'Transaction failed';
      setError(errorMsg);

      addLocalTransaction({
        hash: `failed-${Date.now()}`,
        chainId: selectedChainId,
        type: 'bridge',
        timestamp: Date.now(),
        description: `Bridge ${amount} ${selectedToken} (EVM) → USDC (Stellar)`,
        status: 'failed',
      });
    } finally {
      setIsPreparingBridge(false);
    }
  };

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    return minutes > 0 ? `~${minutes} min` : '< 1 min';
  };

  return (
    <>
      {isChainSwitching && (
        <div className="absolute inset-0 bg-secondary/90 z-20 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand mx-auto mb-2" />
            <p className="font-medium text-primary">Switching Network...</p>
            <p className="text-sm text-muted">Please confirm in your wallet</p>
          </div>
        </div>
      )}

      <div className="p-5 space-y-4 overflow-y-auto flex-1">
        {txHash && currentChainConfig && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fade-in">
            <div className="card max-w-md w-full animate-slide-up rounded-t-3xl sm:rounded-2xl border-t-4 border-green-500 shadow-2xl m-0 sm:m-4">
              <div className="flex items-center justify-center pt-8 pb-4">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-lg">
                    <CheckCircle2 className="w-12 h-12 text-white" strokeWidth={2.5} />
                  </div>
                  <div className="absolute -inset-2 bg-green-400/20 rounded-full blur-xl animate-pulse"></div>
                </div>
              </div>

              <div className="px-6 pb-6">
                <h3 className="text-2xl font-bold text-center mb-2 text-primary">
                  Bridge Initiated!
                </h3>
                <p className="text-secondary text-center mb-1 text-sm">
                  Your assets are being transferred
                </p>
                <p className="text-center text-xs font-medium text-green-600 mb-6 font-mono">
                  to Stellar Network
                </p>

                <div className="bg-tertiary rounded-lg p-3 mb-6 border border-color">
                  <p className="text-xs text-muted mb-1 text-center">Transaction Hash</p>
                  <p className="font-mono text-xs text-center text-primary break-all">
                    {txHash.slice(0, 10)}...{txHash.slice(-8)}
                  </p>
                </div>

                <div className="space-y-3">
                  <a
                    href={`${currentChainConfig.blockExplorerUrl}/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary w-full flex items-center justify-center gap-2 text-base py-3"
                  >
                    View on Explorer
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => {
                      setTxHash(null);
                      setTxStatus('idle');
                      setAmount('');
                      navigate(ROUTES.DASHBOARD);
                    }}
                    className="w-full py-3 text-secondary hover:text-primary font-bold transition-colors"
                  >
                    Back to Dashboard
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="card py-4 relative">
          <div className="flex flex-wrap items-center justify-start gap-4 px-2">
            {supportedNetworks.map(net => {
              const isSelected = selectedChainId === net.chainId;
              return (
                <div key={net.chainId} className="flex flex-col items-center gap-2">
                  <button
                    onClick={() => handleChainSwitch(net.chainId)}
                    disabled={isChainSwitching}
                    title={`Switch to ${net.name}`}
                    className={`w-14 h-14 rounded-full transition-all duration-300 border flex items-center justify-center ${
                      isSelected
                        ? 'bg-brand/10 border-brand shadow-lg scale-110'
                        : 'bg-secondary border-color hover:border-brand/40 hover:bg-tertiary'
                    }`}
                  >
                    <img
                      src={net.icon}
                      alt={net.name}
                      className={`w-9 h-9 rounded-full bg-white shadow-sm ring-1 ${isSelected ? 'ring-brand' : 'ring-transparent'}`}
                    />
                  </button>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-tight ${isSelected ? 'text-brand' : 'text-secondary-light opacity-70'}`}
                  >
                    {net.id}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative p-0 bg-transparent border-0 shadow-none space-y-1">
          {/* You Pay Section */}
          <div className="bg-tertiary rounded-2xl p-4 border border-color">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold text-primary">You Pay</label>
              <button
                onClick={handleMaxClick}
                className="text-xs font-bold text-brand hover:text-brand-hover transition-colors px-2.5 py-1 rounded-md bg-brand/5 hover:bg-brand/10"
                disabled={isChainSwitching}
              >
                MAX
              </button>
            </div>

            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2 shrink-0">
                <div className="relative">
                  <img
                    src={getIconUrl(selectedToken, currentChainConfig)}
                    alt={selectedToken}
                    className="w-10 h-10 rounded-full shrink-0 bg-white shadow-sm"
                  />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-secondary border border-color flex items-center justify-center overflow-hidden">
                    <img
                      src={currentChainConfig?.nativeCurrency.logoURI}
                      alt=""
                      className="w-3.5 h-3.5"
                    />
                  </div>
                </div>
                <div className="relative group">
                  <select
                    value={selectedToken}
                    onChange={e => setSelectedToken(e.target.value as TokenType)}
                    disabled={isChainSwitching}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full h-full"
                  >
                    <option value="USDT">USDT</option>
                    <option value="USDC">USDC</option>
                  </select>
                  <button className="flex items-center gap-2 bg-secondary/80 hover:bg-secondary border border-color hover:border-brand/50 rounded-full px-3 py-1.5 transition-all min-w-[100px] justify-between">
                    <span className="font-bold text-lg text-primary">{selectedToken}</span>
                    <ChevronDown className="w-4 h-4 text-muted group-hover:text-primary transition-colors" />
                  </button>
                </div>
              </div>

              <input
                type="text"
                inputMode="decimal"
                className={`input flex-1 text-right text-2xl font-bold bg-transparent border-none p-0 focus:ring-0 min-w-0 ${hasInsufficientBalance ? 'text-red-500' : ''}`}
                placeholder="0.00"
                value={amount}
                onChange={handleAmountChange}
                disabled={isChainSwitching}
              />
            </div>

            <div className="flex justify-between items-center text-xs">
              <span className="text-muted font-medium">
                Balance:{' '}
                {isLoadingBalance ? (
                  <Loader2 className="w-3 h-3 animate-spin inline ml-1" />
                ) : (
                  <span className="text-primary font-bold">
                    {parseFloat(tokenBalance).toFixed(4)}
                  </span>
                )}
              </span>
              {hasInsufficientBalance && (
                <button
                  onClick={() => errorRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  className="text-red-500 font-bold animate-pulse flex items-center gap-1 hover:underline"
                >
                  <AlertCircle className="w-3 h-3" />
                  Insufficient Balance
                </button>
              )}
            </div>
          </div>

          {(parseFloat(tokenBalance) === 0 || hasInsufficientBalance) && !isPreparingBridge && (
            <div className="animate-in fade-in -mt-4 slide-in-from-top-1 duration-500 mb-2 ">
              <div className="bg-gradient-to-br from-brand/5 via-tertiary to-blue-500/5  rounded-2xl rounded-t-none p-4 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-brand/10 transition-colors" />
                <div className="relative z-10 flex items-center justify-between gap-4">
                  <div className="flex flex-col py-2">
                    <h4 className="text-sm font-bold text-primary">Refill {selectedToken}</h4>
                    <p className="text-[10px] text-muted font-medium uppercase tracking-wider opacity-70">
                      To bridge to Stellar
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0 mt-2">
                    <button
                      onClick={() => navigate(ROUTES.TRADING_EVM_FIAT)}
                      className="flex items-center justify-center gap-2 py-3 px-3 rounded-lg  border border-color hover:border-brand/40 hover:bg-tertiary transition-all text-[11px] font-bold "
                    >
                      <CreditCard className="w-3.5 h-3.5 text-emerald-500 group-hover/btn:scale-110 transition-transform" />
                      Top Up
                    </button>
                    <button
                      onClick={() => navigate(ROUTES.TRADING_EVM_SWAP)}
                      className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg btn btn-primary  hover:border-brand/40 hover:bg-tertiary transition-all text-white font-bold  "
                    >
                      <ArrowUpDown className="w-3.5 h-3.5 text-white group-hover/btn:scale-110 transition-transform" />
                      Swap
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="relative h-3 my-2 z-10 flex justify-center items-center">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="w-10 h-10 rounded-xl bg-secondary border border-color flex items-center justify-center shadow-md">
                <ArrowUpDown className="w-5 h-5 text-muted" strokeWidth={2.5} />
              </div>
            </div>
          </div>

          <div className="bg-tertiary rounded-2xl p-4 border border-color">
            <label className="block text-sm font-bold text-primary mb-3">
              You Receive (Stellar)
            </label>

            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2 shrink-0">
                <div className="relative">
                  <img
                    src={STELLAR_USDC_ICON}
                    alt="USDC"
                    className="w-10 h-10 rounded-full shrink-0 bg-white shadow-sm"
                  />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#08020d] border border-white/10 flex items-center justify-center overflow-hidden">
                    <img src="https://stellar.org/favicon.ico" alt="Stellar" className="w-3 h-3" />
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-secondary/50 border border-color/50 rounded-full px-4 py-1.5 min-w-[100px] justify-center opacity-80 cursor-default">
                  <span className="font-bold text-lg text-primary">USDC</span>
                </div>
              </div>

              <div className="flex-1 text-right text-2xl font-bold min-w-0">
                {isLoadingQuote ? (
                  <Loader2 className="w-5 h-5 animate-spin ml-auto text-muted" />
                ) : (
                  <span className="text-primary truncate block">
                    {quoteData ? parseFloat(quoteData.quotes.minimumAmountOut).toFixed(4) : '0.00'}
                  </span>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-brand/5 rounded-md text-brand font-bold">
                <Clock className="w-3 h-3" />
                <span>{quoteData ? formatTime(quoteData.quotes.completionTime) : '...'}</span>
              </div>
              <span className="badge bg-brand/10 text-brand font-bold px-2 py-0.5 text-[10px] rounded-md border border-brand/20">
                STELLAR NETWORK
              </span>
            </div>
          </div>
        </div>

        {quoteData && !isLoadingQuote && (
          <div className="card p-5 space-y-3 rounded-2xl border-color/40 shadow-sm animate-slide-up">
            <div className="flex justify-between items-center text-sm">
              <span className="text-secondary font-medium">Exchange Rate</span>
              <div className="bg-brand/5 px-2 py-1 rounded text-brand font-bold text-xs">
                1 {selectedToken} ≈ {parseFloat(quoteData.quotes.conversionRate).toFixed(4)} USDC
              </div>
            </div>

            <div className="flex justify-between items-center text-sm">
              <span className="text-secondary font-medium">Minimum Received</span>
              <span className="text-primary font-bold">
                {parseFloat(quoteData.quotes.minimumAmountOut).toFixed(4)} USDC
              </span>
            </div>

            <div className="flex justify-between items-center text-sm">
              <span className="text-secondary font-medium">Slippage Tolerance</span>
              <span className="text-primary font-bold">{quoteData.quotes.slippageTolerance}%</span>
            </div>

            <div className="divider opacity-30 my-1" />

            <div>
              <label className="text-[10px] text-muted mb-2 block font-bold uppercase tracking-widest flex items-center gap-2 opacity-70">
                <TrendingUp className="w-3 h-3" />
                Relayer Fee
              </label>
              <div className="flex gap-2">
                {(['native', 'stablecoin'] as FeeType[]).map(feeType => {
                  const isSelected = selectedFeeType === feeType;
                  return (
                    <button
                      key={feeType}
                      onClick={() => setSelectedFeeType(feeType)}
                      className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all border flex flex-col items-center gap-1.5 ${
                        isSelected
                          ? 'bg-brand/10 border-brand text-brand shadow-sm'
                          : 'bg-secondary/50 text-secondary border-color hover:border-brand/30'
                      }`}
                    >
                      <img
                        src={
                          feeType === 'native'
                            ? currentChainConfig?.nativeCurrency.logoURI
                            : getIconUrl(selectedToken, currentChainConfig)
                        }
                        alt=""
                        className="w-4 h-4 rounded-full bg-white ring-1 ring-black/5"
                      />
                      <span>
                        {feeType === 'native'
                          ? `${parseFloat(quoteData.quotes.fee.native.amount).toFixed(5)} ${quoteData.quotes.fee.native.symbol}`
                          : `${parseFloat(quoteData.quotes.fee.stablecoin.amount).toFixed(3)} ${quoteData.quotes.fee.stablecoin.symbol}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {parsedError && (
          <div ref={errorRef} className="mt-4 animate-slide-up">
            <div
              className={`relative overflow-hidden rounded-2xl border-2 shadow-lg transition-all ${
                parsedError.type === 'insufficient_balance'
                  ? 'bg-orange-500/10 border-orange-500/20'
                  : 'bg-red-500/10 border-red-500/20'
              }`}
            >
              <div className="p-5">
                <div className="flex items-start gap-4">
                  <div
                    className={`p-2.5 rounded-xl shrink-0 ${
                      parsedError.type === 'insufficient_balance'
                        ? 'bg-orange-500/20 text-orange-600'
                        : 'bg-red-500/20 text-red-600'
                    }`}
                  >
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4
                      className={`text-lg font-bold mb-1 ${
                        parsedError.type === 'insufficient_balance'
                          ? 'text-orange-900'
                          : 'text-red-900'
                      }`}
                    >
                      {parsedError.type === 'insufficient_balance'
                        ? 'Balance Required'
                        : 'Transaction Error'}
                    </h4>
                    <p
                      className={`text-sm leading-relaxed ${
                        parsedError.type === 'insufficient_balance'
                          ? 'text-orange-800/80'
                          : 'text-red-800/80'
                      }`}
                    >
                      {parsedError.message}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  {parsedError.type === 'insufficient_balance' ? (
                    <>
                      <button
                        onClick={() => navigate(ROUTES.TRADING_EVM_FIAT)}
                        className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-3"
                      >
                        <CreditCard className="w-5 h-5" />
                        Buy {parsedError.asset} with Fiat
                      </button>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => navigate(ROUTES.TRADING_EVM_SWAP)}
                          className="bg-white/10 hover:bg-white/20 text-orange-900 font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 border border-orange-500/20"
                        >
                          <ArrowUpDown className="w-4 h-4" />
                          Swap
                        </button>
                        <button
                          onClick={() => setError(null)}
                          className="bg-orange-900/10 hover:bg-orange-900/20 text-orange-900 font-bold py-3 px-4 rounded-xl transition-all"
                        >
                          Dismiss
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      onClick={() => setError(null)}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-md transition-all active:scale-95"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="pt-2">
          <StellarActiveGuard onSkip={() => {}}>
            <button
              onClick={handleProceed}
              disabled={
                !quoteData ||
                !isValidAmount ||
                isLoadingQuote ||
                isChainSwitching ||
                isPreparingBridge ||
                txStatus === 'success'
              }
              className={`btn w-full btn-lg gap-2 py-4 text-lg rounded-2xl shadow-xl shadow-brand/10 hover:scale-[1.02] active:scale-[0.98] transition-all ${txStatus === 'success' ? 'btn-success' : 'btn-primary disabled:opacity-50 disabled:grayscale'}`}
            >
              <div className="flex items-center justify-center gap-2 relative z-10">
                {txStatus === 'success' ? (
                  <>
                    <CheckCircle size={22} className="animate-in zoom-in duration-300" /> Bridge
                    Complete!
                  </>
                ) : txStatus === 'approving' ? (
                  <>
                    <Loader2 size={22} className="animate-spin" /> Approving Token...
                  </>
                ) : txStatus === 'transferring' ? (
                  <>
                    <Loader2 size={22} className="animate-spin" /> Bridging to Stellar...
                  </>
                ) : txStatus === 'preparing' ? (
                  <>
                    <Loader2 size={22} className="animate-spin" /> Preparing Transaction...
                  </>
                ) : isLoadingQuote ? (
                  <>
                    <Loader2 size={22} className="animate-spin" /> Getting Quote...
                  </>
                ) : (
                  <>Bridge to Stellar</>
                )}
              </div>
              {isValidAmount && txStatus !== 'success' && (
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:animate-shimmer" />
              )}
            </button>
          </StellarActiveGuard>
        </div>
      </div>
    </>
  );
};

export default EvmToStellarBridge;
