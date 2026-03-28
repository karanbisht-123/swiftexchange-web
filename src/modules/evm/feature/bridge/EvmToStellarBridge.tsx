import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Clock,
  CreditCard,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { ERC20_ABI } from '../../../../abi/Erc20AbI';
import { ROUTES } from '../../../../constants/routes';
import StellarActiveGuard from '../../../walletconnect/components/StellarActiveGuard';
import {
  getChainById,
  getChainsForNetwork,
  type ChainConfig,
  type WellKnownTokens,
} from '../../utils/Chainregistry';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import {
  type BridgeTransaction,
  getBridgeQuote,
  prepareBridgeTransaction,
} from '../../service/evmSwapService';
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
    const asset = chainConfig.assets.find(a => a.address.toLowerCase() === tokenAddress.toLowerCase());
    if (asset?.logoURI) return asset.logoURI;
  }

  return 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png';
};

const STELLAR_USDC_ICON = 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png';

const EvmToStellarBridge: React.FC<EvmToStellarBridgeProps> = ({ selectedAsset }) => {
  const navigate = useNavigate();

  const { connectedWallets, getProvider, openModal } = useWalletConnect();
  const currentNetwork = useWalletStore(state => state.network);

  const evmWallet = connectedWallets[WalletType.EVM];
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const evmAddress = evmWallet?.address;
  const stellarAddress = stellarWallet?.address;
  const currentChainId = evmWallet?.chainId ? Number(evmWallet.chainId) : null;
  const provider = getProvider(WalletType.EVM);

  const evmChains: ChainConfig[] = getChainsForNetwork(currentNetwork);

  const supportedNetworks = useMemo(() =>
    evmChains
      .filter(chain => chain.available)
      .map(chain => ({
        id: chain.slug === 'eth' ? 'ETH' : chain.slug.toUpperCase(),
        chainId: chain.chainId,
        name: chain.name,
        symbol: chain.nativeCurrency.symbol,
        icon: chain.nativeCurrency.logoURI,
      })),
    [evmChains]
  );

  const [selectedNetworkId, setSelectedNetworkId] = useState<string>(
    supportedNetworks[0]?.id || 'ETH'
  );
  const [selectedToken, setSelectedToken] = useState<TokenType>('USDT');
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

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const currentChainConfig = useMemo(() => {
    return evmChains.find(c => c.chainId === supportedNetworks.find(n => n.id === selectedNetworkId)?.chainId);
  }, [evmChains, supportedNetworks, selectedNetworkId]);

  const selectedChainId = currentChainConfig?.chainId || 1;

  useEffect(() => {
    if (!selectedAsset) return;

    const assetChainId = selectedAsset.chainId;
    const matchingNetwork = supportedNetworks.find(n => n.chainId === assetChainId);

    if (matchingNetwork) {
      setSelectedNetworkId(matchingNetwork.id);
    }

    const symbol = selectedAsset.symbol?.toUpperCase();
    if (symbol === 'USDC' || symbol === 'USDT') {
      setSelectedToken(symbol as TokenType);
    }

    setAmount('');
    setQuoteData(null);
    setError(null);
  }, [selectedAsset, supportedNetworks]);

  const handleChainSwitch = useCallback(async (newNetworkId: string) => {
    const networkConfig = supportedNetworks.find(n => n.id === newNetworkId);
    if (!networkConfig || !provider) return;

    const newChainId = networkConfig.chainId;

    if (currentChainId === newChainId) {
      setSelectedNetworkId(newNetworkId);
      return;
    }

    setIsChainSwitching(true);
    setError(null);

    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${newChainId.toString(16)}` }],
      });
      setSelectedNetworkId(newNetworkId);
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        const chainConfig = evmChains.find(c => c.chainId === newChainId);
        if (chainConfig) {
          try {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: `0x${newChainId.toString(16)}`,
                chainName: chainConfig.name,
                nativeCurrency: chainConfig.nativeCurrency,
                rpcUrls: [chainConfig.rpcUrl, ...(chainConfig.fallbackRpcUrls || [])],
                blockExplorerUrls: [chainConfig.blockExplorerUrl],
              }],
            });
            setSelectedNetworkId(newNetworkId);
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
  }, [provider, currentChainId, evmChains, supportedNetworks]);

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
        async (p) => {
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
  }, [fetchBalance, evmAddress, selectedNetworkId, selectedToken, isChainSwitching]);

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
  const hasBalance = parseFloat(tokenBalance) > 0;
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
      value = (parts[0].replace(/^0+/, '') || '0') + (parts[1] !== undefined ? '.' + parts[1] : '');
    }
    if (parts[1] && parts[1].length > 6) value = parts[0] + '.' + parts[1].slice(0, 6);
    if (parseFloat(value) > 999_999_999) return;

    setAmount(value);
  };

  const handleMaxClick = () => {
    const max = parseFloat(tokenBalance);
    if (max > 0) setAmount(max.toFixed(6).replace(/\.?0+$/, ''));
  };

  const handleSwapNow = () =>
    navigate(ROUTES.TRADING_EVM_SWAP, {
      state: { selectedAsset, action: 'swap', network: selectedNetworkId, token: selectedToken },
    });

  const handleBuyNow = () => navigate(ROUTES.TRADING_EVM_FIAT);

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

    const txHash = await provider.request({ method: 'eth_sendTransaction', params: [txParams] });
    await waitForTransaction(txHash);
    return txHash;
  };

  const waitForTransaction = async (txHash: string): Promise<void> => {
    const chainConfig = evmChains.find((c) => c.chainId === selectedChainId);
    if (!chainConfig) throw new Error('Chain config not found');

    const urls = [chainConfig.rpcUrl, ...(chainConfig.fallbackRpcUrls || [])];

    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const receipt = await rpcManager.fetchWithFallback(selectedChainId, urls, (p) =>
          p.getTransactionReceipt(txHash)
        );
        if (receipt) {
          if (receipt.status === 0) throw new Error('Transaction reverted');
          return;
        }
      } catch (err) {
        console.warn('[EvmToStellarBridge] Error fetching receipt', err);
      }
      await new Promise((r) => setTimeout(r, 2000));
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
      const approveTx = transactions.find((tx) => tx.type === 'approve');
      const transferTx = transactions.find((tx) => tx.type === 'transfer');

      if (needsApproval && approveTx) {
        setTxStatus('approving');
        await sendTransaction(approveTx);
      }

      if (transferTx) {
        setTxStatus('transferring');
        await sendTransaction(transferTx);
      }

      setTxStatus('success');
      setTimeout(() => {
        setTxStatus('idle');
        navigate(ROUTES.DASHBOARD);
      }, 2000);
    } catch (err: any) {
      setTxStatus('error');
      setError(err.message || 'Transaction failed');
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

      <div className="p-5 space-y-5 overflow-y-auto flex-1">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-xs text-muted mb-2 block font-medium uppercase tracking-wide">
              Source Token
            </label>
            <div className="grid grid-cols-2 gap-2">
              {['USDT', 'USDC'].map((id) => (
                <button
                  key={id}
                  onClick={() => setSelectedToken(id as TokenType)}
                  disabled={isChainSwitching}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-semibold text-sm transition-all border ${selectedToken === id
                      ? 'btn-primary border-transparent'
                      : 'bg-tertiary text-secondary border-color hover:border-brand-primary'
                    }`}
                >
                  <img src={getIconUrl(id, currentChainConfig)} alt={id} className="w-5 h-5 rounded-full" />
                  {id}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1">
            <label className="text-xs text-muted mb-2 block font-medium uppercase tracking-wide">
              Network
            </label>
            <div className="grid grid-cols-2 gap-2">
              {supportedNetworks.map((net) => (
                <button
                  key={net.id}
                  onClick={() => handleChainSwitch(net.id)}
                  disabled={isChainSwitching}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-semibold text-sm transition-all border ${selectedNetworkId === net.id
                      ? 'btn-primary border-transparent'
                      : 'bg-tertiary text-secondary border-color hover:border-brand-primary'
                    }`}
                >
                  <img src={net.icon} alt={net.symbol} className="w-5 h-5 rounded-full" />
                  {net.symbol}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <img src={getIconUrl(selectedToken, currentChainConfig)} alt={selectedToken} className="w-10 h-10 rounded-full" />
              <div>
                <span className="text-sm text-muted">Available on {currentChainConfig?.name}</span>
                <div className="font-bold text-lg text-primary">
                  {isLoadingBalance ? (
                    <Loader2 size={18} className="animate-spin inline mt-1" />
                  ) : (
                    `${parseFloat(tokenBalance).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${selectedToken}`
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={fetchBalance}
              disabled={isChainSwitching}
              className="p-2 hover:bg-hover rounded-xl transition-colors border border-transparent hover:border-color"
            >
              <RefreshCw size={18} className={`text-muted ${isLoadingBalance ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex gap-3 mt-2">
            <button onClick={handleSwapNow} disabled={isChainSwitching} className="flex-1 btn btn-sm btn-secondary gap-2 rounded-xl">
              <RefreshCw size={14} /> Swap
            </button>
            <button onClick={handleBuyNow} disabled={isChainSwitching} className="flex-1 btn btn-sm btn-success gap-2 rounded-xl">
              <CreditCard size={14} /> Buy
            </button>
          </div>
        </div>

        {!evmAddress && (
          <div className="card p-6 text-center border-warning bg-warning-bg">
            <AlertCircle size={36} className="mx-auto mb-3 text-warning" />
            <p className="font-semibold text-primary mb-2 text-lg">Wallet Not Connected</p>
            <p className="text-muted text-sm mb-5">
              Please connect your EVM wallet to start bridging tokens to Stellar.
            </p>
            <button onClick={() => openModal()} className="btn btn-primary w-full gap-2 rounded-xl py-3">
              <CreditCard size={18} /> Connect Wallet
            </button>
          </div>
        )}

        {!hasBalance && !isLoadingBalance && !isChainSwitching && evmAddress && (
          <div className="card p-6 text-center border-warning bg-warning-bg">
            <AlertCircle size={36} className="mx-auto mb-3 text-warning" />
            <p className="font-semibold text-primary mb-2 text-lg">No {selectedToken} Balance</p>
            <p className="text-muted text-sm mb-5">
              You don't have {selectedToken} on {currentChainConfig?.name}. Swap or buy to get started.
            </p>
            <div className="flex gap-3">
              <button onClick={handleSwapNow} className="btn btn-primary flex-1 gap-2 rounded-xl py-3">
                <RefreshCw size={18} /> Swap
              </button>
              <button onClick={handleBuyNow} className="btn btn-success flex-1 gap-2 rounded-xl py-3">
                <CreditCard size={18} /> Buy
              </button>
            </div>
          </div>
        )}

        {hasBalance && (
          <div className="space-y-5 animate-slide-up">
            <div className="card p-5 bg-tertiary">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-muted font-medium">Amount to Bridge</label>
                <button onClick={handleMaxClick} className="text-xs btn-primary py-1 px-3 rounded-md font-semibold hover:opacity-90">
                  MAX
                </button>
              </div>
              <div className="relative mt-2">
                <input
                  type="text"
                  value={amount}
                  onChange={handleAmountChange}
                  placeholder="0.00"
                  className="input text-3xl font-bold pr-24 py-3 bg-transparent border-none shadow-none focus:ring-0 w-full"
                  disabled={isChainSwitching}
                />
                <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2 bg-secondary py-1.5 px-3 rounded-xl border border-color">
                  <img src={getIconUrl(selectedToken, currentChainConfig)} alt={selectedToken} className="w-6 h-6 rounded-full" />
                  <span className="text-primary font-bold">{selectedToken}</span>
                </div>
              </div>
              {hasInsufficientBalance && amount && (
                <p className="text-danger text-sm mt-2 flex items-center gap-1">
                  <AlertCircle size={14} /> Insufficient balance
                </p>
              )}
              {isAmountTooSmall && (
                <p className="text-danger text-sm mt-2 flex items-center gap-1">
                  <AlertCircle size={14} /> Minimum amount is 0.01
                </p>
              )}
            </div>

            <div className="card p-5 border-brand-primary/20 bg-brand-primary/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src={STELLAR_USDC_ICON} alt="USDC" className="w-10 h-10 rounded-full" />
                  <div>
                    <span className="text-xs font-semibold text-brand-primary block uppercase tracking-wide">
                      You Receive on Stellar
                    </span>
                    <span className="font-bold text-primary text-2xl mt-0.5 block">
                      {isLoadingQuote ? (
                        <Loader2 size={24} className="animate-spin" />
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
                <span className="badge bg-brand text-white font-bold px-3 py-1">Stellar</span>
              </div>
            </div>

            {quoteData && !isLoadingQuote && (
              <div className="card p-5 space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted font-medium">Rate</span>
                  <span className="text-primary font-bold">
                    1 {selectedToken} ≈ {parseFloat(quoteData.quotes.conversionRate).toFixed(4)} USDC
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted font-medium">Slippage Tolerance</span>
                  <span className="text-primary font-bold">{quoteData.quotes.slippageTolerance}%</span>
                </div>
                <div className="divider my-2" />
                <div>
                  <label className="text-xs text-muted mb-3 block font-medium uppercase tracking-wide">
                    Pay Relayer Fee With
                  </label>
                  <div className="flex gap-3">
                    {(['native', 'stablecoin'] as FeeType[]).map((feeType) => (
                      <button
                        key={feeType}
                        onClick={() => setSelectedFeeType(feeType)}
                        className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all border ${selectedFeeType === feeType
                            ? 'btn-primary border-transparent'
                            : 'bg-tertiary text-secondary border-color hover:border-brand'
                          }`}
                      >
                        <div className="flex items-center justify-center gap-2">
                          <img
                            src={feeType === 'native' ? currentChainConfig?.nativeCurrency.logoURI : getIconUrl(selectedToken, currentChainConfig)}
                            alt=""
                            className="w-5 h-5 rounded-full"
                          />
                          <span>
                            {feeType === 'native'
                              ? `${parseFloat(quoteData.quotes.fee.native.amount).toFixed(5)} ${quoteData.quotes.fee.native.symbol}`
                              : `${parseFloat(quoteData.quotes.fee.stablecoin.amount).toFixed(3)} ${quoteData.quotes.fee.stablecoin.symbol}`}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between text-sm bg-tertiary p-3 rounded-lg mt-2">
                  <span className="text-muted flex items-center gap-1.5 font-medium">
                    <Clock size={16} /> Estimated Time
                  </span>
                  <span className="text-primary font-bold">{formatTime(quoteData.quotes.completionTime)}</span>
                </div>
              </div>
            )}

            {error && (
              <div className="card bg-danger-bg text-danger p-4 text-sm flex items-center gap-2 font-medium">
                <AlertCircle size={18} /> {error}
              </div>
            )}

            <StellarActiveGuard onSkip={() => { }}>
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
                className={`btn w-full btn-lg gap-2 py-4 text-lg rounded-xl mt-2 ${txStatus === 'success' ? 'btn-success' : 'btn-primary'}`}
              >
                {txStatus === 'success' ? (
                  <>
                    <CheckCircle size={22} /> Bridge Complete!
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
                    <Loader2 size={22} className="animate-spin" /> Getting Best Quote...
                  </>
                ) : (
                  <>
                    Bridge to Stellar <ArrowRight size={22} />
                  </>
                )}
              </button>
            </StellarActiveGuard>
          </div>
        )}
      </div>
    </>
  );
};

export default EvmToStellarBridge;