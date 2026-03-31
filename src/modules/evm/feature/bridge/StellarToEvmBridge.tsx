import {
  AlertCircle,
  ArrowRight,
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

import { ChainSymbol, FeePaymentMethod, Messenger } from '@allbridge/bridge-core-sdk';

import {
  type FeePayType,
  type QuoteResult,
  STELLAR_NETWORK_PASSPHRASE,
  getBridgeQuote,
  getStellarUsdcBalance,
  getSupportedTokens,
  prepareStellarToEvmRawTransaction,
  resetAllbridgeSdk,
} from '../../../steallr/service/allbridgeService';
import StellarActiveGuard from '../../../walletconnect/components/StellarActiveGuard';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { getChainsForNetwork } from '../../utils/Chainregistry';
import { ROUTES } from '../../../../constants/routes';

const getIconUrl = (symbol: string, chainConfig?: any): string => {
  if (symbol === 'STELLAR' || symbol === 'XLM') {
    return 'https://coin-images.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png';
  }

  if (!chainConfig) {
    return 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png';
  }

  if (symbol === chainConfig.nativeCurrency?.symbol) {
    return chainConfig.nativeCurrency.logoURI;
  }

  const tokenAddress = chainConfig.tokens?.[symbol];
  if (tokenAddress) {
    const asset = chainConfig.assets?.find((a: any) =>
      a.address.toLowerCase() === tokenAddress.toLowerCase()
    );
    if (asset?.logoURI) return asset.logoURI;
  }

  return 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png';
};

type NetworkType = 'ETH' | 'BNB';
type DestTokenType = 'USDC' | 'USDT';
type TxStatus = 'idle' | 'preparing' | 'signing' | 'success' | 'error';

const STELLAR_EXPLORER = 'https://stellar.expert/explorer/public/tx/';
const STELLAR_USDC_ICON = 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png';

const FEE_METHOD_MAP: Record<FeePayType, FeePaymentMethod> = {
  native: FeePaymentMethod.WITH_NATIVE_CURRENCY,
  stablecoin: FeePaymentMethod.WITH_STABLECOIN,
};

const fmt = (v: string | number, dp = 4): string => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return isNaN(n) ? '0.00' : n.toFixed(dp);
};

const formatTime = (ms: number): string => {
  const minutes = Math.floor(ms / 60000);
  return minutes > 0 ? `~${minutes} min` : '< 1 min';
};

const StellarToEvmBridge: React.FC = () => {
  const navigate = useNavigate();
  const currentNetwork = useWalletStore((s: any) => s.network) as 'mainnet' | 'testnet';
  const isMainnet = currentNetwork === 'mainnet';

  const evmChains = getChainsForNetwork(currentNetwork);

  const { connectedWallets, getProvider, openModal } = useWalletConnect();
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const evmWallet = connectedWallets[WalletType.EVM];
  const stellarAddress = stellarWallet?.address ?? '';
  const evmAddress = evmWallet?.address ?? '';

  const [tokens, setTokens] = useState<any[]>([]);
  const [sourceToken, setSourceToken] = useState<any>(null);
  const [destinationToken, setDestToken] = useState<any>(null);

  const [selectedNetwork, setNetwork] = useState<NetworkType>('BNB');
  const [selectedDestToken, setDestSym] = useState<DestTokenType>('USDC');
  const [feePayType, setFeePayType] = useState<FeePayType>('native');

  const [usdcBalance, setUsdcBalance] = useState('0');
  const [isLoadingBalance, setLoadingBal] = useState(false);

  const [amount, setAmount] = useState('');
  const [quoteData, setQuoteData] = useState<QuoteResult | null>(null);
  const [isLoadingQuote, setLoadingQuote] = useState(false);

  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const currentChainConfig = useMemo(() => {
    return evmChains.find(c =>
      (selectedNetwork === 'BNB' && (c.slug === 'bsc' || c.slug === 'bnb')) ||
      (selectedNetwork === 'ETH' && c.slug === 'eth')
    );
  }, [evmChains, selectedNetwork]);

  const parseError = (err: string | null) => {
    if (!err) return null;

    if (err.toLowerCase().includes('underfunded') || err.toLowerCase().includes('insufficient')) {
      return {
        type: 'insufficient_balance',
        asset: 'XLM/USDC',
        message: 'Your Stellar account has insufficient funds to cover the bridge amount or fees.',
      };
    }

    return {
      type: 'general',
      message: err,
    };
  };

  const parsedError = parseError(error);

  useEffect(() => {
    if (parsedError && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [parsedError]);

  useEffect(() => {
    resetAllbridgeSdk();
    setTokens([]);
    setSourceToken(null);
    setDestToken(null);
    setQuoteData(null);
    setError(null);
    getSupportedTokens()
      .then(supported => {
        setTokens(supported);
        const src = supported.find((t: any) => t.chainSymbol === ChainSymbol.SRB && t.symbol === 'USDC');
        if (!src) setError('Stellar USDC not found in Allbridge token list.');
        setSourceToken(src ?? null);
      })
      .catch(() => setError('Failed to load tokens. Please refresh.'))
  }, [currentNetwork]);

  const fetchBalance = useCallback(async () => {
    if (!stellarAddress) {
      setUsdcBalance('0');
      return;
    }
    setLoadingBal(true);
    try {
      const bal = await getStellarUsdcBalance(stellarAddress, currentNetwork);
      setUsdcBalance(bal);
    } finally {
      setLoadingBal(false);
    }
  }, [stellarAddress, currentNetwork]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    if (!tokens.length) return;
    const chainSym = selectedNetwork === 'BNB' ? ChainSymbol.BSC : ChainSymbol.ETH;
    const dest = tokens.find((t: any) => t.chainSymbol === chainSym && (t.symbol === selectedDestToken));
    setDestToken(dest ?? null);
    setQuoteData(null);
  }, [selectedNetwork, selectedDestToken, tokens]);

  const fetchQuote = useCallback(
    async (val: string) => {
      const n = parseFloat(val);
      if (isNaN(n) || n <= 0 || !sourceToken || !destinationToken) {
        setQuoteData(null);
        return;
      }
      setLoadingQuote(true);
      setError(null);
      try {
        const q = await getBridgeQuote({ amount: val, sourceToken, destinationToken });
        setQuoteData(q);
        if (!q.feeOptions.stablecoin) setFeePayType('native');
      } catch (err: any) {
        setError(err.message || 'Failed to fetch quote.');
        setQuoteData(null);
      } finally {
        setLoadingQuote(false);
      }
    },
    [sourceToken, destinationToken]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (amount && parseFloat(amount) > 0) {
      debounceRef.current = setTimeout(() => fetchQuote(amount), 800);
    } else {
      setQuoteData(null);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [amount, fetchQuote]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value;
    if (v === '') {
      setAmount('');
      return;
    }
    if (!/^[0-9.]*$/.test(v)) return;
    const parts = v.split('.');
    if (parts.length > 2) return;
    if (parts[0].length > 1 && parts[0].startsWith('0') && !v.startsWith('0.'))
      v = (parts[0].replace(/^0+/, '') || '0') + (parts[1] !== undefined ? '.' + parts[1] : '');
    if (parts[1] && parts[1].length > 7) v = parts[0] + '.' + parts[1].slice(0, 7);
    if (parseFloat(v) > 999_999_999) return;
    setAmount(v);
  };

  const handleMax = () => {
    const bal = parseFloat(usdcBalance);
    if (bal > 0) setAmount(bal.toFixed(7).replace(/\.?0+$/, ''));
  };

  const signAndSubmitXdr = async (xdr: string): Promise<string> => {
    const provider = getProvider(WalletType.STELLAR);
    const networkPassphrase = STELLAR_NETWORK_PASSPHRASE[currentNetwork];
    const network = networkPassphrase.includes('Public Global Stellar Network') ? 'pubnet' : 'TESTNET';
    const horizonBase = isMainnet ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';
    const signParams = { xdr, networkPassphrase, network };

    const submitToHorizon = async (signedXdr: string): Promise<string> => {
      const broadcastUrl = `${horizonBase}/transactions`;
      const body = new URLSearchParams({ tx: signedXdr });
      const res = await fetch(broadcastUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const json = await res.json();
      if (!res.ok) {
        const c = json?.extras?.result_codes;
        throw new Error(c ? `Bridge failed: ${c.transaction} — ${c.operations?.join(', ') ?? ''}` : (json?.title ?? 'Horizon submission failed'));
      }
      return json.hash as string;
    };

    if (stellarWallet?.walletId === 'freighter' && typeof (window as any).freighterApi !== 'undefined') {
      const r = await (window as any).freighterApi.signTransaction(xdr, { networkPassphrase });
      const signedXdr = typeof r === 'string' ? r : r?.signedTxXdr;
      if (!signedXdr) throw new Error('Freighter did not return a signed transaction.');
      return submitToHorizon(signedXdr);
    }

    if (!provider) throw new Error('No Stellar provider. Please reconnect your wallet.');

    if (isWalletConnectProvider(provider)) {
      const topic = provider.session?.topic;
      const chainCAIP = `stellar:${network}`;
      if (!topic) throw new Error('No active WalletConnect session for Stellar wallet.');
      const wcRequest = {
        topic,
        chainId: chainCAIP,
        request: { method: 'stellar_signAndSubmitXDR', params: signParams },
      };
      const result = await provider.client.request(wcRequest);
      if (result?.status === 'success' || result?.hash) return result.hash ?? 'stellar_submitted';
      if (result?.signedXDR) return submitToHorizon(result.signedXDR);
      if (typeof result === 'string') return result;
      throw new Error('Unexpected WalletConnect response.');
    }

    const directRequest = { method: 'stellar_signAndSubmitXDR', params: signParams };
    const result = await provider.request(directRequest);
    if (result?.hash) return result.hash;
    if (result?.signedXDR) return submitToHorizon(result.signedXDR);
    if (typeof result === 'string') return result;
    throw new Error('Wallet did not return a transaction hash.');
  };

  const handleProceed = async () => {
    if (!stellarAddress || !evmAddress || !quoteData || !sourceToken || !destinationToken) return;
    setTxStatus('preparing');
    setError(null);
    setTxHash(null);
    try {
      const rawXdr = await prepareStellarToEvmRawTransaction({
        amount,
        sourceToken,
        destinationToken,
        fromAccountAddress: stellarAddress,
        toAccountAddress: evmAddress,
        feePaymentMethod: FEE_METHOD_MAP[feePayType],
        messenger: Messenger.ALLBRIDGE,
      });
      setTxStatus('signing');
      const hash = await signAndSubmitXdr(rawXdr);
      setTxHash(hash);
      setTxStatus('success');
      fetchBalance();
    } catch (err: any) {
      setTxStatus('error');
      setError(err.message || 'Transaction failed or was rejected.');
    }
  };

  const parsedAmount = parseFloat(amount) || 0;
  const parsedBalance = parseFloat(usdcBalance) || 0;
  const isInsufficient = parsedAmount > 0 && parsedAmount > parsedBalance;
  const isValidAmount = parsedAmount >= 0.01 && !isInsufficient;
  const canProceed = !!quoteData && isValidAmount && !isLoadingQuote && txStatus !== 'preparing' && txStatus !== 'signing' && txStatus !== 'success';

  const isWalletConnectProvider = (p: any): boolean =>
    !!(p?.client && p?.session && typeof p.client.request === 'function');

  const supportedDestNetworks = useMemo(() => [
    { id: 'BNB' as NetworkType, name: 'BNB Chain', icon: evmChains.find(c => c.slug === 'bsc')?.nativeCurrency.logoURI || '' },
    { id: 'ETH' as NetworkType, name: 'Ethereum', icon: evmChains.find(c => c.slug === 'eth')?.nativeCurrency.logoURI || '' },
  ], [evmChains]);

  return (
    <>
      <div className="p-5 space-y-4 overflow-y-auto flex-1">
        {txHash && (
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
                  Bridge Submitted!
                </h3>
                <p className="text-secondary text-center mb-1 text-sm">
                  Assets traveling from Stellar
                </p>
                <p className="text-center text-xs font-medium text-green-600 mb-6 font-mono uppercase tracking-widest">
                  to {selectedNetwork === 'BNB' ? 'BNB Chain' : 'Ethereum'}
                </p>

                <div className="bg-tertiary rounded-lg p-3 mb-6 border border-color">
                  <p className="text-xs text-muted mb-1 text-center font-semibold">Transaction Hash</p>
                  <p className="font-mono text-xs text-center text-primary break-all">
                    {txHash.slice(0, 12)}...{txHash.slice(-10)}
                  </p>
                </div>

                <div className="space-y-3">
                  <a
                    href={`${STELLAR_EXPLORER}${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary w-full flex items-center justify-center gap-2 text-base py-3 rounded-2xl shadow-lg"
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

        <div className="card p-4 relative">
          <div className="flex flex-wrap items-center justify-start gap-4 px-2">
            {supportedDestNetworks.map((net) => {
              const isSelected = selectedNetwork === net.id;
              return (
                <div key={net.id} className="flex flex-col items-center gap-2">
                  <button
                    onClick={() => setNetwork(net.id)}
                    disabled={txStatus === 'preparing' || txStatus === 'signing'}
                    title={`Switch to ${net.name}`}
                    className={`w-14 h-14 rounded-full transition-all duration-300 border flex items-center justify-center ${isSelected
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
                  <span className={`text-[10px] font-bold uppercase tracking-tight ${isSelected ? 'text-brand' : 'text-secondary-light opacity-70'}`}>
                    {net.id}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className=" relative p-0 bg-transparent border-0 shadow-none space-y-1">
          {/* You Pay Section */}
          <div className="bg-tertiary rounded-2xl p-4 border border-color">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold text-primary">You Pay (Stellar)</label>
              <button
                onClick={handleMax}
                className="text-xs font-bold text-brand hover:text-brand-hover transition-colors px-2.5 py-1 rounded-md bg-brand/5 hover:bg-brand/10"
              >
                MAX
              </button>
            </div>

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
                <div className="flex items-center gap-2 bg-secondary border border-color rounded-full px-4 py-1.5 min-w-[100px] justify-center shadow-sm">
                  <span className="font-bold text-lg text-primary">USDC</span>
                </div>
              </div>

              <input
                type="text"
                inputMode="decimal"
                className={`input flex-1 text-right text-2xl font-bold bg-transparent border-none p-0 focus:ring-0 min-w-0 ${isInsufficient ? 'text-red-500' : ''}`}
                placeholder="0.00"
                value={amount}
                onChange={handleAmountChange}
                disabled={txStatus === 'preparing' || txStatus === 'signing'}
              />
            </div>

            <div className="flex justify-between items-center text-xs">
              <span className="text-muted font-medium">
                Balance: {isLoadingBalance ? <Loader2 className="w-3 h-3 animate-spin inline ml-1" /> : <span className="text-primary font-bold">{parseFloat(usdcBalance).toFixed(4)}</span>}
              </span>
              {isInsufficient && (
                <span className="text-red-500 font-bold animate-pulse flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Insufficient Balance
                </span>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="relative h-3  my-2 z-10 flex justify-center items-center">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="w-10 h-10 rounded-xl bg-secondary border border-color flex items-center justify-center shadow-md">
                <ArrowUpDown className="w-5 h-5 text-muted" strokeWidth={2.5} />
              </div>
            </div>
          </div>

          {/* You Receive Section */}
          <div className="bg-tertiary rounded-2xl p-4 border border-color">
            <label className="block text-sm font-bold text-primary mb-3">You Receive on {selectedNetwork}</label>

            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2 shrink-0">
                <div className="relative">
                  <img
                    src={getIconUrl(selectedDestToken, currentChainConfig)}
                    alt={selectedDestToken}
                    className="w-10 h-10 rounded-full shrink-0 bg-white shadow-sm"
                  />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-secondary border border-color flex items-center justify-center overflow-hidden">
                    <img src={currentChainConfig?.nativeCurrency.logoURI} alt="" className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="relative group">
                  <select
                    value={selectedDestToken}
                    onChange={(e) => setDestSym(e.target.value as DestTokenType)}
                    disabled={txStatus === 'preparing' || txStatus === 'signing'}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full h-full"
                  >
                    <option value="USDC">USDC</option>
                    <option value="USDT">USDT</option>
                  </select>
                  <button className="flex items-center gap-2 bg-secondary/80 hover:bg-secondary border border-color hover:border-brand/50 rounded-full px-3 py-1.5 transition-all min-w-[100px] justify-between shadow-sm">
                    <span className="font-bold text-lg text-primary">{selectedDestToken}</span>
                    <ChevronDown className="w-4 h-4 text-muted group-hover:text-primary transition-colors" />
                  </button>
                </div>
              </div>

              <div className="flex-1 text-right text-2xl font-bold min-w-0">
                {isLoadingQuote ? (
                  <Loader2 className="w-5 h-5 animate-spin ml-auto text-muted" />
                ) : (
                  <span className="text-primary truncate block">
                    {quoteData ? fmt(quoteData.amountToBeReceived) : '0.00'}
                  </span>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-brand/5 rounded-md text-brand font-bold">
                <Clock className="w-3 h-3" />
                <span>{quoteData ? formatTime(quoteData.transferTimeMs) : '...'}</span>
              </div>
              <span className="badge bg-brand/10 text-brand font-bold px-2 py-0.5 text-[10px] rounded-md border border-brand/20">
                {selectedNetwork === 'BNB' ? 'BNB Chain' : 'Ethereum'}
              </span>
            </div>
          </div>
        </div>

        {quoteData && !isLoadingQuote && (
          <div className="card p-5 space-y-3 rounded-2xl border-color/40 shadow-sm animate-slide-up">
            <div className="flex justify-between items-center text-sm">
              <span className="text-secondary font-medium">Exchange Rate</span>
              <div className="bg-brand/5 px-2 py-1 rounded text-brand font-bold text-xs">
                1 USDC ≈ {quoteData.exchangeRate} {selectedDestToken}
              </div>
            </div>

            <div className="flex justify-between items-center text-sm">
              <span className="text-secondary font-medium">Minimum Received</span>
              <span className="text-primary font-bold">{fmt(quoteData.amountToBeReceived)} {selectedDestToken}</span>
            </div>

            <div className="flex justify-between items-center text-sm">
              <span className="text-secondary font-medium">Network Fee</span>
              <span className="text-primary font-bold">Standard Stellar Fee</span>
            </div>

            <div className="divider opacity-30 my-1" />

            <div>
              <label className="text-[10px] text-muted mb-2 block font-bold uppercase tracking-widest flex items-center gap-2 opacity-70">
                <TrendingUp className="w-3 h-3" />
                Relayer Fee
              </label>
              <div className="flex gap-2">
                {(['native', 'stablecoin'] as FeePayType[]).map((feeType) => {
                  const isSelected = feePayType === feeType;
                  const feeOptions = quoteData.feeOptions;
                  const isStablecoinOption = feeType === 'stablecoin';
                  const isAvailable = isStablecoinOption ? !!feeOptions.stablecoin : true;

                  if (isStablecoinOption && !isAvailable) return null;

                  return (
                    <button
                      key={feeType}
                      onClick={() => setFeePayType(feeType)}
                      className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all border flex flex-col items-center gap-1.5 ${isSelected
                        ? 'bg-brand/10 border-brand text-brand shadow-sm'
                        : 'bg-secondary/50 text-secondary border-color hover:border-brand/30'
                        }`}
                    >
                      <img
                        src={feeType === 'native' ? 'https://coin-images.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png' : STELLAR_USDC_ICON}
                        alt=""
                        className="w-4 h-4 rounded-full bg-white ring-1 ring-black/5"
                      />
                      <span>
                        {feeType === 'native'
                          ? `${feeOptions.native.float} XLM`
                          : `${feeOptions.stablecoin?.float} USDC`}
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
            <div className={`relative overflow-hidden rounded-2xl border-2 shadow-lg transition-all ${parsedError.type === 'insufficient_balance'
              ? 'bg-orange-500/10 border-orange-500/20'
              : 'bg-red-500/10 border-red-500/20'
              }`}>
              <div className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`p-2.5 rounded-xl shrink-0 ${parsedError.type === 'insufficient_balance'
                    ? 'bg-orange-500/20 text-orange-600'
                    : 'bg-red-500/20 text-red-600'
                    }`}>
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-lg font-bold mb-1 ${parsedError.type === 'insufficient_balance' ? 'text-orange-900' : 'text-red-900'
                      }`}>
                      {parsedError.type === 'insufficient_balance' ? 'Balance Required' : 'Bridge Error'}
                    </h4>
                    <p className={`text-sm leading-relaxed ${parsedError.type === 'insufficient_balance' ? 'text-orange-800/80' : 'text-red-800/80'
                      }`}>
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
                        <CreditCard size={20} />
                        Buy with Fiat
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
          {!stellarAddress ? (
            <button onClick={() => openModal()} className="btn btn-primary w-full py-4 text-lg rounded-2xl shadow-xl shadow-brand/10 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2">
              <CreditCard size={22} /> Connect Stellar Wallet
            </button>
          ) : !evmAddress ? (
            <button onClick={() => openModal()} className="btn btn-primary w-full py-4 text-lg rounded-2xl shadow-xl shadow-brand/10 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2">
              <CreditCard size={22} /> Connect EVM Wallet
            </button>
          ) : (
            <StellarActiveGuard onSkip={() => { }}>
              <button
                onClick={handleProceed}
                disabled={!canProceed}
                className={`btn w-full btn-lg gap-2 py-4 text-lg rounded-2xl shadow-xl shadow-brand/10 hover:scale-[1.02] active:scale-[0.98] transition-all ${txStatus === 'success' ? 'btn-success' : 'btn-primary disabled:opacity-50 disabled:grayscale'}`}
              >
                {txStatus === 'success' ? (
                  <>
                    <CheckCircle size={22} /> Bridge Complete!
                  </>
                ) : txStatus === 'signing' ? (
                  <>
                    <Loader2 size={22} className="animate-spin" /> Signing Transaction...
                  </>
                ) : txStatus === 'preparing' ? (
                  <>
                    <Loader2 size={22} className="animate-spin" /> Preparing Bridge...
                  </>
                ) : isLoadingQuote ? (
                  <>
                    <Loader2 size={22} className="animate-spin" /> Getting Quote...
                  </>
                ) : (
                  <>
                    Bridge to {selectedNetwork} <ArrowRight size={22} />
                  </>
                )}
              </button>
            </StellarActiveGuard>
          )}
        </div>
      </div>
    </>
  );
};

export default StellarToEvmBridge;