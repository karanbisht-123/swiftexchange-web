import {
  AlertCircle,
  ArrowUpDown,
  ChevronDown,
  Clock,
  RefreshCw,
  Settings,
  Plus,
  Minus,
  X
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAssetSelectorModal } from '../../../commonfeature/components/useAssetSelectorModal';
import { ethers } from 'ethers';
import { ERC20_ABI } from '../../../../abi/Erc20AbI';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import TransactionButton from '../../../commonfeature/components/TransactionButton';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { prepareBridgeTransaction, getBridgeQuote as getEvmBridgeQuote } from '../../service/evmSwapService';
import {
  getBridgeQuote as getStellarBridgeQuote,
  getSupportedTokens,
  prepareStellarToEvmRawTransaction,
  getStellarUsdcBalance,
  STELLAR_NETWORK_PASSPHRASE
} from '../../../steallr/service/allbridgeService';
import { getChainById, getExplorerUrl } from '../../utils/Chainregistry';
import { EvmTransactionSuccessModal } from '../../components/EvmTransactionSuccessModal';
import { portfolioUtils } from '../../../walletconnect/utils/portfolioUtils';
import * as ChainUrlHelpers from '../../utils/ChainUrlHelpers';
import { ChainSymbol, FeePaymentMethod, Messenger } from '@allbridge/bridge-core-sdk';
import { Tooltip } from '../../../../components/common/Tooltip';

const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0, 3.0, 5.0];
const STELLAR_CHAIN_ID = 9000000;

const isStellar = (id: any) => id === 'stellar' || Number(id) === STELLAR_CHAIN_ID || Number(id) === 9000001;

const Bridge: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { openAssetSelector } = useAssetSelectorModal();
  const currentNetwork = useWalletStore(state => state.network) as 'mainnet' | 'testnet';
  const { connectedWallets, getProvider } = useWalletConnect();

  const evmWallet = connectedWallets[WalletType.EVM];
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const evmAddress = evmWallet?.address;
  const stellarAddress = stellarWallet?.address;

  const [fromChainId, setFromChainId] = useState<number | 'stellar'>(() => {
    const raw = searchParams.get('fromChain');
    if (!raw) return 1;
    return isNaN(Number(raw)) ? (raw as any) : Number(raw);
  });

  const [toChainId, setToChainId] = useState<number | 'stellar'>(() => {
    const raw = searchParams.get('toChain');
    if (!raw) return STELLAR_CHAIN_ID;
    return isNaN(Number(raw)) ? (raw as any) : Number(raw);
  });

  const [fromToken, setFromToken] = useState(searchParams.get('fromToken') || 'USDT');
  const [toToken, setToToken] = useState(searchParams.get('toToken') || 'USDC');
  const [amount, setAmount] = useState('');

  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [quoteData, setQuoteData] = useState<any>(null);
  const [feePayType, setFeePayType] = useState<'native' | 'stablecoin'>('stablecoin');
  const [txStatus, setTxStatus] = useState<'idle' | 'preparing' | 'signing' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState('0');
  const [isInputFocused, setIsInputFocused] = useState(false);

  const [slippageTolerance, setSlippageTolerance] = useState(0.5);
  const [isSlippageModalOpen, setIsSlippageModalOpen] = useState(false);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('fromChain', String(fromChainId));
    params.set('toChain', String(toChainId));
    params.set('fromToken', fromToken);
    params.set('toToken', toToken);
    setSearchParams(params, { replace: true });
  }, [fromChainId, toChainId, fromToken, toToken]);

  const fromChainConfig = useMemo(() =>
    isStellar(fromChainId) ? getChainById(STELLAR_CHAIN_ID) : getChainById(Number(fromChainId)),
    [fromChainId]);

  const toChainConfig = useMemo(() =>
    isStellar(toChainId) ? getChainById(STELLAR_CHAIN_ID) : getChainById(Number(toChainId)),
    [toChainId]);

  const displayQuote = useMemo(() => {
    if (!quoteData) return null;
    
    if (isStellar(fromChainId)) {
      if (!quoteData.feeOptions) return null;
      return {
        receiveAmount: quoteData.amountToBeReceived,
        exchangeRate: quoteData.exchangeRate,
        time: quoteData.transferTimeMs ? Math.max(1, Math.round(quoteData.transferTimeMs / 60000)) : 5,
        fees: {
          native: {
            amount: quoteData.feeOptions.native.float,
            symbol: fromChainConfig?.nativeCurrency.symbol || 'XLM'
          },
          stablecoin: quoteData.feeOptions.stablecoin ? {
            amount: quoteData.feeOptions.stablecoin.float,
            symbol: 'USDC'
          } : null
        }
      };
    } else {
      if (!quoteData) return null;
      const rawTime = quoteData.completionTime;
      const formattedTime = rawTime > 1000 ? Math.max(1, Math.round(rawTime / 60000)) : (rawTime || 5);

      return {
        receiveAmount: quoteData.minimumAmountOut || quoteData.receiveAmount || '0',
        exchangeRate: quoteData.conversionRate || '0',
        time: formattedTime,
        fees: {
          native: quoteData.fee?.native || null,
          stablecoin: quoteData.fee?.stablecoin || null
        }
      };
    }
  }, [quoteData, fromChainId, toChainId, fromChainConfig]);

  const nativeFeeChainIcon = useMemo(() => {
    return fromChainConfig?.logoURI || fromChainConfig?.imageUrl || '';
  }, [fromChainConfig]);

  const stablecoinFeeTokenIcon = useMemo(() => {
    if (!displayQuote?.fees?.stablecoin) return '';
    const sym = displayQuote.fees.stablecoin.symbol;
    const fromTokenEntry = fromChainConfig?.bridgeSupportTokens?.find((t: any) => t.symbol === sym);
    if (fromTokenEntry?.logoURI) return fromTokenEntry.logoURI;
    const toTokenEntry = toChainConfig?.bridgeSupportTokens?.find((t: any) => t.symbol === sym);
    if (toTokenEntry?.logoURI) return toTokenEntry.logoURI;
    return ChainUrlHelpers.getTokenIcon(sym, fromChainConfig);
  }, [displayQuote, fromChainConfig, toChainConfig]);

  const fetchBalance = useCallback(async () => {
    if (!fromChainConfig) return;
    try {
      if (isStellar(fromChainId)) {
        if (stellarAddress) {
          const bal = await getStellarUsdcBalance(stellarAddress, currentNetwork);
          setTokenBalance(bal);
        }
      } else if (evmAddress) {
        const token = fromChainConfig.bridgeSupportTokens?.find((t: any) => t.symbol === fromToken);
        const address = token?.address;
        const provider = getProvider(WalletType.EVM);
        if (address && provider) {
          const contract = new ethers.Contract(address, ERC20_ABI, provider);
          const [b, d] = await Promise.all([contract.balanceOf(evmAddress), contract.decimals()]);
          setTokenBalance(ethers.formatUnits(b, d));
        }
      }
    } catch (err) {
      setTokenBalance('0');
    }
  }, [fromChainConfig, fromChainId, evmAddress, stellarAddress, fromToken, currentNetwork]);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  const handleRefreshBalance = async () => {
    setIsRefreshing(true);
    await fetchBalance();
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const fetchQuote = useCallback(async (val: string) => {
    if (!val || parseFloat(val) <= 0) {
      setQuoteData(null);
      return;
    }
    setIsLoadingQuote(true);
    try {
      if (isStellar(fromChainId)) {
        const tokens = await getSupportedTokens();
        const srcChainSym = ChainSymbol.SRB;
        const dstChainSym = isStellar(toChainId) ? ChainSymbol.SRB : toChainConfig?.nativeCurrency.symbol as ChainSymbol;

        const src = tokens.find(t => t.chainSymbol === srcChainSym && t.symbol === fromToken);
        const dst = tokens.find(t => t.chainSymbol === dstChainSym && t.symbol === toToken);

        if (src && dst) {
          const q = await getStellarBridgeQuote({ amount: val, sourceToken: src, destinationToken: dst, slippageTolerance });
          setQuoteData(q);
        }
      } else {
        const numId = Number(fromChainId);
        const destId = Number(toChainId);
        if (!isNaN(numId) && !isNaN(destId)) {
          const q = await getEvmBridgeQuote(numId, destId, val, fromToken, toToken);
          setQuoteData(q);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch quote');
      setTxStatus('error');
    } finally {
      setIsLoadingQuote(false);
    }
  }, [fromChainId, toChainId, fromToken, toToken, fromChainConfig, toChainConfig, slippageTolerance]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchQuote(amount), 800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [amount, fetchQuote]);

  const handleProceed = async () => {
    if (isStellar(fromChainId)) {
      await handleStellarSourceBridge();
    } else {
      await handleEvmSourceBridge();
    }
  };

  const handleEvmSourceBridge = async () => {
    const destAddr = isStellar(toChainId) ? stellarAddress : evmAddress;
    if (!evmAddress || !destAddr) return;
    const numId = Number(fromChainId);
    const destId = Number(toChainId);
    if (isNaN(numId) || isNaN(destId)) return;

    setTxStatus('preparing');
    try {
      const bridgeResponse = await prepareBridgeTransaction({
        fromChainId: numId,
        toChainId: destId,
        amount,
        feePayType,
        fromAddress: evmAddress,
        destinationAddress: destAddr,
        sourceToken: fromToken,
        destinationToken: toToken,
        slippageTolerance
      });

      const provider = getProvider(WalletType.EVM) as any;
      for (const tx of bridgeResponse.transactions) {
        setTxStatus(tx.type === 'approve' ? 'preparing' : 'signing');
        const hash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: tx.transaction.from,
            to: tx.transaction.to,
            value: `0x${BigInt(tx.transaction.value).toString(16)}`,
            data: tx.transaction.data,
          }]
        });
        if (tx.type === 'transfer') setTxHash(hash);
      }
      setTxStatus('success');
    } catch (err: any) {
      setError(err.message || 'Bridge failed');
      setTxStatus('error');
    }
  };

  const handleStellarSourceBridge = async () => {
    if (!stellarAddress || !evmAddress || !quoteData) return;
    setTxStatus('preparing');
    try {
      const xdr = await prepareStellarToEvmRawTransaction({
        amount,
        sourceToken: quoteData.sourceToken,
        destinationToken: quoteData.destinationToken,
        fromAccountAddress: stellarAddress,
        toAccountAddress: evmAddress,
        feePaymentMethod: feePayType === 'native' ? FeePaymentMethod.WITH_NATIVE_CURRENCY : FeePaymentMethod.WITH_STABLECOIN,
        messenger: Messenger.ALLBRIDGE,
        slippageTolerance
      });
      setTxStatus('signing');
      const provider = getProvider(WalletType.STELLAR) as any;
      const signParams = { xdr, networkPassphrase: STELLAR_NETWORK_PASSPHRASE[currentNetwork], network: currentNetwork === 'mainnet' ? 'pubnet' : 'TESTNET' };
      const result = await provider.request({ method: 'stellar_signAndSubmitXDR', params: signParams });
      setTxHash(result.hash);
      setTxStatus('success');
    } catch (err: any) {
      setError(err.message || 'Bridge failed');
      setTxStatus('error');
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-8 overflow-y-auto flex-1 mx-auto">
      {txHash && fromChainConfig && (
        <EvmTransactionSuccessModal
          txHash={txHash}
          explorerUrl={getExplorerUrl(isStellar(fromChainId) ? STELLAR_CHAIN_ID : Number(fromChainId), 'tx', txHash)}
          title="Bridge Initiated!"
          subtitle={`Your assets are traveling from ${fromChainConfig.name} to ${toChainConfig?.name}`}
          onDone={() => { setTxHash(null); setTxStatus('idle'); setAmount(''); }}
        />
      )}

      {error && txStatus === 'error' && (
        <div className="bg-red-500/10 rounded-2xl p-3 sm:p-4 flex items-start sm:items-center gap-2 sm:gap-3 text-red-500 text-xs sm:text-sm font-bold animate-shake">
          <AlertCircle size={16} className="mt-0.5 sm:mt-0 flex-shrink-0" />
          <p className="flex-1 leading-snug">{error}</p>
          <button
            onClick={() => setTxStatus('idle')}
            className="p-1 sm:p-1.5 hover:bg-white/5 rounded-lg transition-colors flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="bg-tertiary rounded-2xl p-4 lg:p-6 shadow-sm relative group/card overflow-hidden">
        <div className={`absolute left-0 top-0 bottom-0 w-1 bg-brand transition-all duration-300 ${isInputFocused ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-50'}`} />

        <div className="flex justify-between items-center mb-4 sm:mb-6">
          <label className="text-xs font-black uppercase tracking-[0.15em] text-muted opacity-90">Source Network</label>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={() => openAssetSelector('BRIDGE', { defaultNetwork: isStellar(fromChainId) ? STELLAR_CHAIN_ID : Number(fromChainId), onSelect: (a) => { setFromToken(a.symbol); setFromChainId(Number(a.chainId)); } })}
            className="flex items-center gap-2 bg-secondary rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-hover active:scale-[0.98] transition-all relative group flex-[0_0_auto] min-w-0"
            style={{ width: 'clamp(130px, 35vw, 160px)' }}
          >
            <div className="relative min-w-[36px] sm:min-w-[40px]">
              <img
                src={fromChainConfig?.bridgeSupportTokens?.find((t: any) => t.symbol === fromToken)?.logoURI || ChainUrlHelpers.getTokenIcon(fromToken, fromChainConfig)}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-tertiary object-cover shadow-sm" alt=""
              />
              <img
                src={isStellar(fromChainId) ? "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/stellar/info/logo.png" : fromChainConfig?.logoURI}
                className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full border-2 border-secondary bg-secondary"
                alt=""
              />
            </div>
            <div className="flex flex-col items-start pr-1 min-w-0 overflow-hidden">
              <span className="font-bold text-[13px] sm:text-[15px] leading-tight truncate w-full">{fromToken}</span>
              <span className="text-[8px] sm:text-[9px] text-muted font-bold tracking-tight truncate w-full uppercase">{fromChainConfig?.name?.split(' ')[0]}</span>
            </div>
            <ChevronDown size={13} className="text-muted group-hover:text-primary transition-all ml-auto flex-shrink-0" />
          </button>

          <div className="flex-1 min-w-0">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              className="w-full bg-transparent border-none text-right text-3xl sm:text-4xl font-black focus:ring-0 p-0 placeholder:text-muted/10 truncate transition-all outline-none"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            />
          </div>
        </div>

        <div className="mt-4 sm:mt-6 flex flex-wrap justify-between items-center gap-2 text-[10px] sm:text-[11px] font-bold">
          <div className="flex items-center gap-1.5 sm:gap-2 text-muted">
            <button
              onClick={handleRefreshBalance}
              disabled={isRefreshing}
              className={`p-1 sm:p-1.5 hover:bg-white/5 rounded-full rotate-0 active:rotate-180 transition-all duration-500 ${isRefreshing ? 'animate-spin text-brand' : ''}`}
            >
              <RefreshCw size={12} />
            </button>
            <span>Balance:</span>
            <span className="text-primary font-black">{portfolioUtils.formatBalance(tokenBalance)} {fromToken}</span>
          </div>
          {parseFloat(amount) > parseFloat(tokenBalance) && (
            <span className="text-red-500 bg-red-500/10 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full font-black flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-[11px] transition-all">
              <span className="filter drop-shadow-[0_0_2px_rgba(239,68,68,0.5)]">☹️</span>
              <span className="hidden xs:inline">Insufficient Balance</span>
              <span className="xs:hidden">Insufficient</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex justify-center -my-8 relative z-10">
        <button
          onClick={() => { 
            setQuoteData(null);
            setError(null);
            const tmpC = fromChainId; 
            setFromChainId(toChainId); 
            setToChainId(tmpC); 
            const tmpT = fromToken; 
            setFromToken(toToken); 
            setToToken(tmpT); 
          }}
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-secondary flex items-center justify-center shadow-lg hover:scale-110 active:scale-90 transition-all duration-300 text-brand group backdrop-blur-md"
        >
          <ArrowUpDown size={18} />
        </button>
      </div>

      <div className="bg-tertiary rounded-2xl p-4 lg:p-6 shadow-sm relative overflow-hidden flex flex-col">
        <div className="flex flex-col gap-4 sm:gap-5">
          <label className="text-xs font-black uppercase tracking-[0.15em] text-muted opacity-90">Destination Network</label>
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => openAssetSelector('BRIDGE', { defaultNetwork: isStellar(toChainId) ? STELLAR_CHAIN_ID : Number(toChainId), onSelect: (a) => { setToToken(a.symbol); setToChainId(Number(a.chainId)); } })}
              className="flex items-center gap-2 bg-secondary rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-hover active:scale-[0.98] transition-all relative group flex-[0_0_auto] min-w-0"
              style={{ width: 'clamp(130px, 35vw, 160px)' }}
            >
              <div className="relative min-w-[36px] sm:min-w-[40px]">
                <img
                  src={toChainConfig?.bridgeSupportTokens?.find((t: any) => t.symbol === toToken)?.logoURI || ChainUrlHelpers.getTokenIcon(toToken, toChainConfig)}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-tertiary object-cover shadow-sm" alt=""
                />
                <img
                  src={isStellar(toChainId) ? "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/stellar/info/logo.png" : toChainConfig?.logoURI}
                  className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full border-2 border-secondary bg-secondary"
                  alt=""
                />
              </div>
              <div className="flex flex-col items-start pr-1 min-w-0 overflow-hidden">
                <span className="font-bold text-[13px] sm:text-[15px] leading-tight truncate w-full">{toToken}</span>
                <span className="text-[8px] sm:text-[9px] text-muted font-bold tracking-tight truncate w-full uppercase">{toChainConfig?.name?.split(' ')[0]}</span>
              </div>
              <ChevronDown size={13} className="text-muted group-hover:text-primary transition-all ml-auto flex-shrink-0" />
            </button>

            <div className="flex-1 text-right">
              <div className="text-3xl sm:text-4xl font-black truncate text-primary/40">
                {isLoadingQuote ? (
                  <div className="flex justify-end"><div className="w-16 sm:w-20 h-8 sm:h-10 bg-white/5 animate-pulse rounded-full" /></div>
                ) : (displayQuote ? <span className="text-primary">{portfolioUtils.formatBalance(displayQuote.receiveAmount)}</span> : '0.00')}
              </div>
              {displayQuote && (
                <div className="text-[9px] sm:text-[10px] text-green-500 font-extrabold uppercase tracking-widest mt-1 opacity-80 flex items-center justify-end gap-1.5">
                  <div className="w-1 h-1 rounded-full bg-green-500" />
                  ~ Estimated
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`grid transition-all duration-500 ease-in-out ${displayQuote ? 'grid-rows-[1fr] opacity-100 mt-6' : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'}`}>
          <div className="overflow-hidden">
            <div className="pt-5 sm:pt-6 border-t border-dotted border-white/10 space-y-4 sm:space-y-6">
              <div className="flex justify-between items-center text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-muted">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-secondary rounded-lg flex-shrink-0">
                    <Clock size={11} /> {displayQuote?.time} min
                  </span>
                  <button
                    onClick={() => setIsSlippageModalOpen(true)}
                    className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-secondary rounded-lg flex-shrink-0 hover:bg-white/5 transition-all text-muted hover:text-primary active:scale-95"
                  >
                    <Settings size={11} /> {slippageTolerance}% SLP
                  </button>
                </div>
                <span className="truncate ml-3 sm:ml-4 text-xs font-black uppercase tracking-[0.15em] text-muted opacity-90">
                  1 {fromToken} ≈ {portfolioUtils.formatBalance(displayQuote?.exchangeRate)} {toToken}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black uppercase tracking-[0.15em] text-muted opacity-90 whitespace-nowrap flex-shrink-0">
                  🔥 Relay Fee
                </span>
                <div
                  className="flex gap-2 overflow-x-auto pb-1 flex-1 justify-end scroll-smooth"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  <button
                    onClick={() => setFeePayType('native')}
                    className={`
                      flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3
                      rounded-2xl border transition-all duration-300
                      whitespace-nowrap flex-shrink-0
                      ${feePayType === 'native'
                        ? 'bg-brand/10 border-brand/40 shadow-inner scale-[1.02]'
                        : 'bg-secondary/50 border-white/5 grayscale opacity-50 hover:grayscale-0 hover:opacity-100'}
                    `}
                    style={{ width: 'clamp(120px, 30vw, 155px)' }}
                  >
                    {nativeFeeChainIcon ? (
                      <img
                        src={nativeFeeChainIcon}
                        className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-tertiary shadow-sm flex-shrink-0"
                        alt={fromChainConfig?.nativeCurrency?.symbol}
                      />
                    ) : (
                      <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white/10 flex-shrink-0" />
                    )}
                    <div className="flex flex-col items-start min-w-0 overflow-hidden">
                      <span className="text-[10px] sm:text-[11px] font-black text-primary truncate w-full">
                        {displayQuote?.fees?.native?.amount 
                          ? `${parseFloat(displayQuote.fees.native.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${displayQuote.fees.native.symbol}`
                          : '0.00'
                        }
                      </span>
                    </div>
                  </button>

                  <button
                    onClick={() => setFeePayType('stablecoin')}
                    className={`
                      flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3
                      rounded-2xl border transition-all duration-300
                      whitespace-nowrap flex-shrink-0
                      ${feePayType === 'stablecoin'
                        ? 'bg-brand/10 border-brand/40 shadow-inner scale-[1.02]'
                        : 'bg-secondary/50 border-white/5 grayscale opacity-50 hover:grayscale-0 hover:opacity-100'}
                    `}
                    style={{ width: 'clamp(100px, 26vw, 130px)' }}
                  >
                    {stablecoinFeeTokenIcon ? (
                      <img
                        src={stablecoinFeeTokenIcon}
                        className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-tertiary shadow-sm flex-shrink-0"
                        alt={displayQuote?.fees?.stablecoin?.symbol}
                      />
                    ) : (
                      <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white/10 flex-shrink-0" />
                    )}
                    <div className="flex flex-col items-start min-w-0 overflow-hidden">
                      <span className="text-[10px] sm:text-[11px] font-black text-primary truncate w-full">
                        {displayQuote?.fees?.stablecoin
                          ? `${parseFloat(displayQuote.fees.stablecoin.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${displayQuote.fees.stablecoin.symbol}`
                          : 'N/A'}
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <TransactionButton
        label={!fromChainId || !toChainId ? 'Initialize Bridge' : `Bridge to ${toChainConfig?.name || 'Network'}`}
        isLoading={['preparing', 'signing'].includes(txStatus) || isLoadingQuote}
        isDisabled={!amount || parseFloat(amount) <= 0 || !displayQuote || parseFloat(amount) > parseFloat(tokenBalance)}
        onClick={handleProceed}
      />

      <div className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center transition-opacity duration-300 ${isSlippageModalOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className={`absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300 ${isSlippageModalOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setIsSlippageModalOpen(false)} />
        <div className={`relative w-full max-w-md bg-secondary border border-color shadow-2xl rounded-t-[2.5rem] sm:rounded-3xl p-8 pt-6 transform transition-all duration-300 ease-out ${isSlippageModalOpen ? 'translate-y-0 scale-100' : 'translate-y-full sm:translate-y-10 sm:scale-95'}`}>
          <div className="w-12 h-1.5 bg-tertiary rounded-full mx-auto mb-6 sm:hidden" />
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-black text-primary uppercase tracking-tight">Slippage Settings</h3>
              <Tooltip content="Slippage tolerance is the maximum price change you're willing to accept. If the price moves more than this, your transaction will fail to protect your funds.">
                <AlertCircle size={14} className="text-muted" />
              </Tooltip>
            </div>
            <button onClick={() => setIsSlippageModalOpen(false)} className="w-10 h-10 rounded-2xl bg-tertiary flex items-center justify-center hover:bg-tertiary/80 transition-all border border-color">
              <X className="w-5 h-5 text-muted" />
            </button>
          </div>

          <div className="space-y-8">
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-4">Manual Adjustment</span>
              <div className="flex items-center gap-6">
                <button onClick={() => setSlippageTolerance(prev => Math.max(0, parseFloat((prev - 0.1).toFixed(1))))} className="w-14 h-14 rounded-2xl bg-tertiary border border-color flex items-center justify-center hover:bg-brand/10 hover:border-brand/40 group transition-all active:scale-90">
                  <Minus className="w-6 h-6 text-muted group-hover:text-brand" />
                </button>
                <div className="relative group">
                  <input type="number" value={slippageTolerance} onChange={e => { const val = parseFloat(e.target.value); setSlippageTolerance(isNaN(val) ? 0 : val); }} className="w-32 bg-transparent text-center text-5xl font-black text-primary focus:outline-none tabular-nums" />
                  <span className="absolute -right-6 top-1/2 -translate-y-1/2 text-2xl font-black text-muted/30">%</span>
                </div>
                <button onClick={() => setSlippageTolerance(prev => parseFloat((prev + 0.1).toFixed(1)))} className="w-14 h-14 rounded-2xl bg-tertiary border border-color flex items-center justify-center hover:bg-brand/10 hover:border-brand/40 group transition-all active:scale-90">
                  <Plus className="w-6 h-6 text-muted group-hover:text-brand" />
                </button>
              </div>
            </div>

            <div>
              <span className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-4 block text-center">Presets</span>
              <div className="grid grid-cols-5 gap-2">
                {SLIPPAGE_PRESETS.map(preset => (
                  <button key={preset} onClick={() => setSlippageTolerance(preset)} className={`py-3 rounded-xl text-xs font-black transition-all border ${slippageTolerance === preset ? 'bg-brand border-brand text-white shadow-lg shadow-brand/20 scale-105' : 'bg-tertiary border-color text-muted hover:border-brand/40 hover:text-primary'}`}>
                    {preset}%
                  </button>
                ))}
              </div>
            </div>

            {slippageTolerance > 5 && (
              <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-2xl flex items-start gap-4 animate-slide-up">
                <AlertCircle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-orange-200">High Price Impact Warning</p>
                  <p className="text-[10px] text-orange-200/70 font-medium leading-relaxed">Setting slippage above 5% is risky and may result in partial loss of funds due to unfavorable execution price.</p>
                </div>
              </div>
            )}

            <button onClick={() => setIsSlippageModalOpen(false)} className="w-full py-4 btn-primary text-white font-black uppercase tracking-widest rounded-2xl hover:bg-brand/90 transition-all shadow-xl shadow-brand/20 active:scale-95 mt-4">
              Apply Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Bridge;