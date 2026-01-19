import { AlertCircle, ArrowRight, CheckCircle, Clock, CreditCard, Loader2, RefreshCw, X } from 'lucide-react';
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { ERC20_ABI } from '../../../../abi/Erc20AbI';
import { ROUTES } from '../../../../constants/routes';
import { getConfigByChainId } from '../../../../config/swapConfigs';
import { getEVMChains } from '../../../walletconnect/config/chains';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { getBridgeQuote, prepareBridgeTransaction, type BridgeTransaction } from '../../service/evmSwapService';

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

type NetworkType = 'ETH' | 'BNB';
type TokenType = 'USDT' | 'USDC';
type FeeType = 'native' | 'stablecoin';

const FALLBACK_EVM_ADDRESS = '0x05cBb7CbEEE7C8f1234567890abcdef123456789';
const FALLBACK_STELLAR_ADDRESS = 'GCYNLQAXROO26U2ZBHUB5FDLFXMIISGOMVDBFFRK7Z3RGKA2VI5BVA6I';

interface TradeAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetName: string;
  selectedAsset?: Asset;
}

const ICONS = {
  ETH: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png',
  BNB: 'https://tokens.pancakeswap.finance/images/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c.png',
  USDT: 'https://coin-images.coingecko.com/coins/images/325/large/Tether.png',
  USDC: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
  STELLAR_USDC: 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png',
};

const NETWORKS: { id: NetworkType; name: string; chainId: number }[] = [
  { id: 'ETH', name: 'Ethereum', chainId: 1 },
  { id: 'BNB', name: 'BNB Chain', chainId: 56 },
];

const TOKENS: { id: TokenType; name: string }[] = [
  { id: 'USDT', name: 'Tether USD' },
  { id: 'USDC', name: 'USD Coin' },
];

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

const TradeAssetModal: FC<TradeAssetModalProps> = ({ isOpen, onClose, selectedAsset }) => {
  const navigate = useNavigate();
  const { connectedWallets, getProvider } = useWalletConnect();
  const currentNetwork = useWalletStore(state => state.network);
  const evmWallet = connectedWallets[WalletType.EVM];
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const evmAddress = evmWallet?.address || FALLBACK_EVM_ADDRESS;
  const stellarAddress = stellarWallet?.address || FALLBACK_STELLAR_ADDRESS;
  // const hasConnectedWallet = !!evmWallet?.address;

  const currentChainId = evmWallet?.chainId ? Number(evmWallet.chainId) : null;
  const provider = getProvider(WalletType.EVM);

  const evmChains = getEVMChains(currentNetwork);

  const initialNetwork = useMemo((): NetworkType => {
    if (selectedAsset?.chainId === 56) return 'BNB';
    if (selectedAsset?.chainId === 1) return 'ETH';
    if (currentChainId === 56) return 'BNB';
    return 'ETH';
  }, [selectedAsset?.chainId, currentChainId]);

  const initialToken = useMemo((): TokenType => {
    const symbol = selectedAsset?.symbol?.toUpperCase();
    if (symbol === 'USDC') return 'USDC';
    return 'USDT';
  }, [selectedAsset?.symbol]);

  const [selectedNetwork, setSelectedNetwork] = useState<NetworkType>(initialNetwork);
  const [selectedToken, setSelectedToken] = useState<TokenType>(initialToken);
  const [selectedFeeType, setSelectedFeeType] = useState<FeeType>('stablecoin');
  const [amount, setAmount] = useState<string>('');
  const [tokenBalance, setTokenBalance] = useState<string>('0');
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isChainSwitching, setIsChainSwitching] = useState(false);
  const [isPreparingBridge, setIsPreparingBridge] = useState(false);
  const [txStatus, setTxStatus] = useState<'idle' | 'preparing' | 'approving' | 'transferring' | 'success' | 'error'>('idle');
  const [quoteData, setQuoteData] = useState<QuoteData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const selectedChainId = useMemo(() => {
    return NETWORKS.find(n => n.id === selectedNetwork)?.chainId || 1;
  }, [selectedNetwork]);

  useEffect(() => {
    if (isOpen && selectedAsset) {
      if (selectedAsset.chainId === 56) {
        setSelectedNetwork('BNB');
      } else if (selectedAsset.chainId === 1) {
        setSelectedNetwork('ETH');
      }
      const symbol = selectedAsset.symbol?.toUpperCase();
      if (symbol === 'USDC') {
        setSelectedToken('USDC');
      } else if (symbol === 'USDT') {
        setSelectedToken('USDT');
      }
      setAmount('');
      setQuoteData(null);
      setError(null);
    }
  }, [isOpen, selectedAsset]);

  const handleChainSwitch = useCallback(async (newNetwork: NetworkType) => {
    const newChainId = NETWORKS.find(n => n.id === newNetwork)?.chainId || 1;
    if (currentChainId === newChainId) {
      setSelectedNetwork(newNetwork);
      return;
    }

    if (!provider) {
      setSelectedNetwork(newNetwork);
      return;
    }

    setIsChainSwitching(true);
    setError(null);

    try {
      console.log('[TradeModal] Switching to chain:', newChainId);

      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${newChainId.toString(16)}` }],
      });

      console.log('[TradeModal] Chain switch successful');
      setSelectedNetwork(newNetwork);
    } catch (switchError: any) {
      console.log('[TradeModal] Chain switch error:', switchError.code, switchError.message);

      if (switchError.code === 4902) {
        const networkConfig = evmChains.find(c => c.chainId === newChainId);
        if (networkConfig) {
          try {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: `0x${newChainId.toString(16)}`,
                chainName: networkConfig.name,
                nativeCurrency: networkConfig.nativeCurrency,
                rpcUrls: [networkConfig.rpcUrl],
                blockExplorerUrls: [networkConfig.blockExplorerUrl],
              }],
            });
            setSelectedNetwork(newNetwork);
          } catch (addError: any) {
            console.log('[TradeModal] User rejected adding chain:', addError.message);
            setError('Failed to add network');
          }
        }
      } else if (switchError.code === 4001) {
        console.log('[TradeModal] User rejected chain switch');
      } else {
        setError('Failed to switch network');
      }
    } finally {
      setIsChainSwitching(false);
    }
  }, [provider, currentChainId, evmChains]);

  const fetchBalance = useCallback(async () => {
    if (!evmAddress || !provider) {
      setTokenBalance('0');
      return;
    }

    setIsLoadingBalance(true);
    setError(null);

    try {
      const config = getConfigByChainId(selectedChainId);
      if (!config) {
        console.log('[TradeModal] No config for chainId:', selectedChainId);
        setTokenBalance('0');
        setIsLoadingBalance(false);
        return;
      }
      const chainConfig = evmChains.find(c => c.chainId === selectedChainId);
      if (!chainConfig) {
        setTokenBalance('0');
        setIsLoadingBalance(false);
        return;
      }

      const ethersProvider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
      const tokenAddress = selectedToken === 'USDT' ? config.usdt : config.usdc;

      console.log('[TradeModal] Fetching balance for', selectedToken, 'on chain', selectedChainId, 'address:', tokenAddress);

      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, ethersProvider);
      const [balance, decimals] = await Promise.all([
        contract.balanceOf(evmAddress),
        contract.decimals(),
      ]);

      const formatted = ethers.formatUnits(balance, decimals);
      console.log('[TradeModal] Balance:', formatted, selectedToken);
      setTokenBalance(formatted);
    } catch (err: any) {
      console.error('[TradeModal] Balance fetch failed:', err);
      setTokenBalance('0');
    } finally {
      setIsLoadingBalance(false);
    }
  }, [evmAddress, provider, selectedChainId, selectedToken, evmChains]);
  useEffect(() => {
    if (isOpen && evmAddress && !isChainSwitching) {
      fetchBalance();
    }
  }, [isOpen, fetchBalance, evmAddress, selectedNetwork, selectedToken, isChainSwitching]);

  const fetchQuote = useCallback(async (amountValue: string) => {
    const num = parseFloat(amountValue);
    if (isNaN(num) || num <= 0) {
      setQuoteData(null);
      return;
    }

    setIsLoadingQuote(true);
    setError(null);

    try {
      const response = await getBridgeQuote(amountValue, selectedNetwork, selectedToken);
      setQuoteData(response);
    } catch (err: any) {
      console.error('Quote fetch failed:', err);
      setError(err.message || 'Failed to fetch quote');
      setQuoteData(null);
    } finally {
      setIsLoadingQuote(false);
    }
  }, [selectedNetwork, selectedToken]);
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
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hasBalance = parseFloat(tokenBalance) > 0;
  const parsedAmount = parseFloat(amount) || 0;
  const hasInsufficientBalance = parsedAmount > parseFloat(tokenBalance);
  const isAmountTooSmall = parsedAmount > 0 && parsedAmount < 0.01;
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
      value = parts[0].replace(/^0+/, '') || '0';
      if (parts[1] !== undefined) value += '.' + parts[1];
    }

    if (parts[1] && parts[1].length > 6) {
      value = parts[0] + '.' + parts[1].slice(0, 6);
    }

    if (parseFloat(value) > 999999999) return;

    setAmount(value);
  };

  const handleMaxClick = () => {
    const maxBalance = parseFloat(tokenBalance);
    if (maxBalance > 0) {
      setAmount(maxBalance.toFixed(6).replace(/\.?0+$/, ''));
    }
  };

  const handleSwapNow = () => {
    onClose();
    navigate(ROUTES.TRADING_EVM_FIAT, {
      state: { selectedAsset, action: 'swap', network: selectedNetwork, token: selectedToken },
    });
  };

  const handleBuyNow = () => {
    onClose();
    navigate(ROUTES.TRADING_EVM_FIAT);
  };

  const handleProceed = async () => {
    if (!quoteData || !isValidAmount || !provider) return;

    setIsPreparingBridge(true);
    setTxStatus('preparing');
    setError(null);

    try {
      console.log('[TradeModal] Preparing bridge transaction');

      const bridgeResponse = await prepareBridgeTransaction({
        amount,
        feePayType: selectedFeeType,
        fromAddress: evmAddress,
        destinationAddress: stellarAddress,
        sourceToken: selectedToken,
        destinationToken: 'USDC',
        walletType: selectedNetwork,
      });

      console.log('[TradeModal] Bridge response:', bridgeResponse);

      const { needsApproval, transactions } = bridgeResponse;

      if (needsApproval && transactions.length >= 2) {
        const approveTx = transactions.find(tx => tx.type === 'approve');
        const transferTx = transactions.find(tx => tx.type === 'transfer');

        if (approveTx) {
          setTxStatus('approving');
          console.log('[TradeModal] Sending approval transaction');
          await sendTransaction(approveTx);
        }

        if (transferTx) {
          setTxStatus('transferring');
          console.log('[TradeModal] Sending transfer transaction');
          await sendTransaction(transferTx);
        }
      } else {
        const transferTx = transactions.find(tx => tx.type === 'transfer');
        if (transferTx) {
          setTxStatus('transferring');
          console.log('[TradeModal] Sending transfer transaction (no approval needed)');
          await sendTransaction(transferTx);
        }
      }

      setTxStatus('success');
      console.log('[TradeModal] Bridge completed successfully');

      setTimeout(() => {
        onClose();
        setTxStatus('idle');
      }, 2000);

    } catch (err: any) {
      console.error('[TradeModal] Bridge failed:', err);
      setTxStatus('error');
      setError(err.message || 'Transaction failed');
    } finally {
      setIsPreparingBridge(false);
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
      gas: `0x${parseInt(txMeta.gasLimit).toString(16)}`,
    };

    if (txMeta.feeData.maxFeePerGas && txMeta.feeData.maxPriorityFeePerGas) {
      txParams.maxFeePerGas = `0x${BigInt(txMeta.feeData.maxFeePerGas).toString(16)}`;
      txParams.maxPriorityFeePerGas = `0x${BigInt(txMeta.feeData.maxPriorityFeePerGas).toString(16)}`;
    } else if (txMeta.feeData.gasPrice) {
      txParams.gasPrice = `0x${BigInt(txMeta.feeData.gasPrice).toString(16)}`;
    }

    console.log('[TradeModal] Sending tx:', txParams);

    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [txParams],
    });

    console.log('[TradeModal] Tx hash:', txHash);

    await waitForTransaction(txHash);
    return txHash;
  };

  const waitForTransaction = async (txHash: string): Promise<void> => {
    const chainConfig = evmChains.find(c => c.chainId === selectedChainId);
    if (!chainConfig) throw new Error('Chain config not found');

    const rpcProvider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);

    let attempts = 0;
    const maxAttempts = 60;

    while (attempts < maxAttempts) {
      const receipt = await rpcProvider.getTransactionReceipt(txHash);
      if (receipt) {
        if (receipt.status === 0) throw new Error('Transaction reverted');
        console.log('[TradeModal] Tx confirmed:', txHash);
        return;
      }
      await new Promise(r => setTimeout(r, 2000));
      attempts++;
    }

    throw new Error('Transaction confirmation timeout');
  };

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    return minutes > 0 ? `~${minutes} min` : '< 1 min';
  };
  const usingFallbackEVM = !evmWallet?.address;
  const usingFallbackStellar = !stellarWallet?.address;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 animate-fadeIn">
      <div
        ref={modalRef}
        className="bg-secondary w-full md:max-w-md md:rounded-2xl rounded-t-3xl shadow-xl overflow-hidden animate-slide-up max-h-[90vh] md:max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-color shrink-0">
          <h2 className="heading-4">Bridge to Stellar</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-hover transition-colors">
            <X size={20} className="text-muted" />
          </button>
        </div>
        {isChainSwitching && (
          <div className="absolute inset-0 bg-secondary/90 z-20 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-brand mx-auto mb-2" />
              <p className="font-medium text-primary">Switching Network...</p>
              <p className="text-sm text-muted">Please confirm in your wallet</p>
            </div>
          </div>
        )}

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted mb-2 block font-medium">Source Token</label>
              <div className="flex gap-2">
                {TOKENS.map(token => (
                  <button
                    key={token.id}
                    onClick={() => setSelectedToken(token.id)}
                    disabled={isChainSwitching}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-semibold text-sm transition-all border ${selectedToken === token.id
                      ? 'btn-primary border-transparent'
                      : 'bg-tertiary text-secondary border-color hover:border-brand-primary'
                      }`}
                  >
                    <img src={ICONS[token.id]} alt={token.id} className="w-5 h-5 rounded-full" />
                    {token.id}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted mb-2 block font-medium">Network</label>
              <div className="flex gap-2">
                {NETWORKS.map(network => (
                  <button
                    key={network.id}
                    onClick={() => handleChainSwitch(network.id)}
                    disabled={isChainSwitching}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-semibold text-sm transition-all border ${selectedNetwork === network.id
                      ? 'btn-primary border-transparent'
                      : 'bg-tertiary text-secondary border-color hover:border-brand-primary'
                      }`}
                  >
                    <img src={ICONS[network.id]} alt={network.id} className="w-5 h-5 rounded-full" />
                    {network.id}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img src={ICONS[selectedToken]} alt={selectedToken} className="w-8 h-8 rounded-full" />
                <div>
                  <span className="text-sm text-muted">Available on {selectedNetwork}</span>
                  <div className="font-bold text-primary">
                    {isLoadingBalance ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      `${parseFloat(tokenBalance).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${selectedToken}`
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={fetchBalance}
                disabled={isChainSwitching}
                className="p-2 hover:bg-hover rounded-lg transition-colors"
              >
                <RefreshCw size={16} className={`text-muted ${isLoadingBalance ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* No Balance State */}
          {!hasBalance && !isLoadingBalance && !isChainSwitching && (
            <div className="card p-5 text-center border-warning bg-warning-bg">
              <AlertCircle size={32} className="mx-auto mb-3 text-warning" />
              <p className="font-semibold text-primary mb-1">No {selectedToken} Balance</p>
              <p className="text-muted text-sm mb-4">
                You don't have {selectedToken} on {selectedNetwork}. Swap or buy to get started.
              </p>
              <div className="flex gap-3">
                <button onClick={handleSwapNow} className="btn btn-primary flex-1 gap-2">
                  <RefreshCw size={16} />
                  Swap
                </button>
                <button onClick={handleBuyNow} className="btn btn-success flex-1 gap-2">
                  <CreditCard size={16} />
                  Buy
                </button>
              </div>
            </div>
          )}
          {hasBalance && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-muted font-medium">Amount</label>
                  <button onClick={handleMaxClick} className="text-xs text-brand font-semibold hover:opacity-80">
                    MAX
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={amount}
                    onChange={handleAmountChange}
                    placeholder="0.00"
                    className="input text-xl font-bold pr-20"
                    disabled={isChainSwitching}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <img src={ICONS[selectedToken]} alt={selectedToken} className="w-5 h-5 rounded-full" />
                    <span className="text-muted font-medium">{selectedToken}</span>
                  </div>
                </div>
                {hasInsufficientBalance && amount && (
                  <p className="text-danger text-xs mt-1">Insufficient balance</p>
                )}
                {isAmountTooSmall && (
                  <p className="text-danger text-xs mt-1">Minimum amount is 0.01</p>
                )}
              </div>
              <div className="card p-4 bg-tertiary">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src={ICONS.STELLAR_USDC} alt="USDC" className="w-10 h-10 rounded-full" />
                    <div>
                      <span className="text-xs text-muted block">You'll Receive on Stellar</span>
                      <span className="font-bold text-primary text-lg">
                        {isLoadingQuote ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : quoteData ? (
                          `~${parseFloat(quoteData.quotes.minimumAmountOut).toFixed(4)} USDC`
                        ) : amount && parseFloat(amount) > 0 ? (
                          '...'
                        ) : (
                          '0.00 USDC'
                        )}
                      </span>
                    </div>
                  </div>
                  <span className="badge badge-info">Stellar</span>
                </div>
              </div>
              {quoteData && !isLoadingQuote && (
                <div className="card p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Rate</span>
                    <span className="text-primary font-medium">
                      1 {selectedToken} ≈ {parseFloat(quoteData.quotes.conversionRate).toFixed(6)} USDC
                    </span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Slippage</span>
                    <span className="text-primary">{quoteData.quotes.slippageTolerance}%</span>
                  </div>

                  <div className="divider" />
                  <div>
                    <label className="text-xs text-muted mb-2 block font-medium">Pay Relayer Fee With</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedFeeType('native')}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${selectedFeeType === 'native'
                          ? 'bg-brand-primary text-white'
                          : 'bg-tertiary text-secondary hover:bg-hover'
                          }`}
                      >
                        <div className="flex items-center justify-center gap-2">
                          <img src={ICONS[selectedNetwork]} alt="" className="w-4 h-4 rounded-full" />
                          <span>{parseFloat(quoteData.quotes.fee.native.amount).toFixed(6)} {quoteData.quotes.fee.native.symbol}</span>
                        </div>
                      </button>
                      <button
                        onClick={() => setSelectedFeeType('stablecoin')}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${selectedFeeType === 'stablecoin'
                          ? 'bg-brand-primary text-white'
                          : 'bg-tertiary text-secondary hover:bg-hover'
                          }`}
                      >
                        <div className="flex items-center justify-center gap-2">
                          <img src={ICONS[selectedToken]} alt="" className="w-4 h-4 rounded-full" />
                          <span>{parseFloat(quoteData.quotes.fee.stablecoin.amount).toFixed(4)} {quoteData.quotes.fee.stablecoin.symbol}</span>
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-muted flex items-center gap-1">
                      <Clock size={14} />
                      Est. Time
                    </span>
                    <span className="text-primary font-medium">
                      {formatTime(quoteData.quotes.completionTime)}
                    </span>
                  </div>
                </div>
              )}

              {error && (
                <div className="card bg-danger-bg text-danger p-3 text-sm flex items-center gap-2">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}
              {(usingFallbackEVM || usingFallbackStellar) && (
                <div className="card bg-warning-bg text-warning p-3 text-sm flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Using Test Addresses</p>
                    <p className="text-xs mt-1 opacity-80">
                      {usingFallbackEVM && 'EVM wallet not connected. '}
                      {usingFallbackStellar && 'Stellar wallet not connected. '}
                      Using fallback addresses for testing.
                    </p>
                  </div>
                </div>
              )}

              <button
                onClick={handleProceed}
                disabled={!quoteData || !isValidAmount || isLoadingQuote || isChainSwitching || isPreparingBridge || txStatus === 'success'}
                className={`btn w-full btn-lg gap-2 ${txStatus === 'success' ? 'btn-success' : 'btn-primary'}`}
              >
                {txStatus === 'success' ? (
                  <>
                    <CheckCircle size={18} />
                    Bridge Complete!
                  </>
                ) : txStatus === 'approving' ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Approving Token...
                  </>
                ) : txStatus === 'transferring' ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Bridging to Stellar...
                  </>
                ) : txStatus === 'preparing' ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Preparing...
                  </>
                ) : isLoadingQuote ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Getting Quote...
                  </>
                ) : (
                  <>
                    <ArrowRight size={18} />
                    Bridge to Stellar
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TradeAssetModal;
