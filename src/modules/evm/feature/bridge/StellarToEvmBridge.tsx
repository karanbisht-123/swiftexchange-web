import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

const FEE_METHOD_MAP: Record<FeePayType, FeePaymentMethod> = {
  native: FeePaymentMethod.WITH_NATIVE_CURRENCY,
  stablecoin: FeePaymentMethod.WITH_STABLECOIN,
};

const fmt = (v: string | number, dp = 4): string => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return isNaN(n) ? '0.00' : n.toFixed(dp);
};

const shortAddr = (addr: string): string => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '—');

const fmtTime = (ms: number): string => {
  if (!ms || ms <= 0) return 'Unknown';
  const secs = Math.round(ms / 1_000);
  if (secs < 60) return `~${secs}s`;
  const mins = Math.round(ms / 60_000);
  return mins === 1 ? '~1 min' : `~${mins} min`;
};

let xlmPriceUsd = 0;
const fetchXlmPrice = async (): Promise<number> => {
  if (xlmPriceUsd > 0) return xlmPriceUsd;
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd');
    const d = await r.json();
    xlmPriceUsd = d?.stellar?.usd ?? 0;
  } catch {
    xlmPriceUsd = 0;
  }
  return xlmPriceUsd;
};

const toUsd = (amount: string, price: number): string => {
  const n = parseFloat(amount);
  if (!n || !price) return '';
  return `≈ $${(n * price).toFixed(3)}`;
};

const isWalletConnectProvider = (p: any): boolean =>
  !!(p?.client && p?.session && typeof p.client.request === 'function');

const Divider = () => <div className="h-px bg-color w-full" />

const InfoRow = ({
  icon,
  label,
  value,
  valueClass = '',
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  valueClass?: string;
}) => (
  <div className="flex items-center justify-between text-sm">
    <span className="text-muted font-medium flex items-center gap-1.5">
      {icon}
      {label}
    </span>
    <span className={`font-semibold text-primary text-right ${valueClass}`}>{value}</span>
  </div>
);

const PillGroup = <T extends string>({
  label,
  items,
  active,
  disabled: globalDisabled,
  disabledIds,
  onChange,
  renderItem,
}: {
  label: string;
  items: { id: T;[k: string]: any }[];
  active: T;
  disabled?: boolean;
  disabledIds?: T[];
  onChange: (id: T) => void;
  renderItem: (item: { id: T;[k: string]: any }, isActive: boolean) => React.ReactNode;
}) => (
  <div className="flex-1 min-w-0">
    <p className="text-[10px] text-muted font-semibold uppercase tracking-widest mb-1.5 px-0.5">
      {label}
    </p>
    <div className="flex gap-1.5">
      {items.map(item => {
        const isActive = item.id === active;
        const isDisabled = globalDisabled || disabledIds?.includes(item.id);
        return (
          <button
            key={item.id}
            onClick={() => !isDisabled && onChange(item.id)}
            disabled={isDisabled}
            className={`
              relative flex-1 flex items-center justify-center gap-1.5
              py-2 px-2 rounded-xl border text-xs font-semibold transition-all duration-150
              ${isActive
                ? 'btn-primary border-transparent'
                : isDisabled
                  ? 'bg-tertiary text-muted border-color opacity-40 cursor-not-allowed'
                  : 'bg-tertiary text-secondary border-color hover:border-brand-primary/40'
              }
            `}
          >
            {renderItem(item, isActive)}
            {isActive && <span className="absolute top-1 right-1 w-1 h-1 rounded-full bg-white/60" />}
          </button>
        );
      })}
    </div>
  </div>
);

const StellarToEvmBridge: React.FC = () => {
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
  const [xlmPrice, setXlmPrice] = useState(0);

  const [amount, setAmount] = useState('');
  const [quoteData, setQuoteData] = useState<QuoteResult | null>(null);
  const [isLoadingTokens, setLoadingTkns] = useState(true);
  const [isLoadingQuote, setLoadingQuote] = useState(false);

  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const currentChainConfig = useMemo(() => {
    return evmChains.find(c =>
      (selectedNetwork === 'BNB' && c.slug === 'bsc') ||
      (selectedNetwork === 'ETH' && c.slug === 'eth')
    );
  }, [evmChains, selectedNetwork]);

  useEffect(() => {
    fetchXlmPrice().then(setXlmPrice);
  }, []);

  useEffect(() => {
    resetAllbridgeSdk();
    setTokens([]);
    setSourceToken(null);
    setDestToken(null);
    setQuoteData(null);
    setError(null);
    setLoadingTkns(true);
    getSupportedTokens()
      .then(supported => {
        setTokens(supported);
        const src = supported.find((t: any) => t.chainSymbol === ChainSymbol.SRB && t.symbol === 'USDC');
        if (!src) setError('Stellar USDC not found in Allbridge token list.');
        setSourceToken(src ?? null);
      })
      .catch(() => setError('Failed to load tokens. Please refresh.'))
      .finally(() => setLoadingTkns(false));
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
    const dest = tokens.find((t: any) => t.chainSymbol === chainSym && t.symbol === selectedDestToken);
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
      setTimeout(() => {
        setTxStatus('idle');
        setAmount('');
        setQuoteData(null);
        setTxHash(null);
      }, 10000);
    } catch (err: any) {
      setTxStatus('error');
      setError(err.message || 'Transaction failed or was rejected.');
    }
  };

  const parsedAmount = parseFloat(amount) || 0;
  const parsedBalance = parseFloat(usdcBalance) || 0;
  const isTooSmall = parsedAmount > 0 && parsedAmount < 0.01;
  const isInsufficient = parsedAmount > 0 && parsedAmount > parsedBalance;
  const isValidAmount = parsedAmount >= 0.01 && !isInsufficient;
  const canProceed = !!quoteData && isValidAmount && !isLoadingQuote && txStatus !== 'preparing' && txStatus !== 'signing' && txStatus !== 'success';

  const feeOptions = quoteData?.feeOptions;
  const stablecoinUnavailable = !!feeOptions && !feeOptions.stablecoin;
  const nativeFeeUsd = feeOptions ? toUsd(feeOptions.native.float, xlmPrice) : '';
  const stablecoinFeeUsd = feeOptions?.stablecoin ? `≈ $${parseFloat(feeOptions.stablecoin.float).toFixed(3)}` : '';

  return (
    <div className="flex flex-col gap-3 p-4 overflow-y-auto flex-1 animate-fadeIn">
      <div className="flex gap-3">
        <PillGroup
          label="Network"
          items={[
            { id: 'BNB', name: 'BNB Chain', chainSymbol: ChainSymbol.BSC },
            { id: 'ETH', name: 'Ethereum', chainSymbol: ChainSymbol.ETH },
          ]}
          active={selectedNetwork}
          disabled={isLoadingTokens || txStatus === 'preparing' || txStatus === 'signing'}
          onChange={id => {
            setNetwork(id as NetworkType);
            setError(null);
          }}
          renderItem={(item, isActive) => {
            const itemConfig = evmChains.find(c =>
              (item.id === 'BNB' && c.slug === 'bsc') ||
              (item.id === 'ETH' && c.slug === 'eth')
            );
            return (
              <>
                <img src={getIconUrl(item.id, itemConfig)} alt={item.id} className="w-4 h-4 rounded-full shrink-0" />
                <span className={isActive ? '' : 'text-secondary'}>{item.id}</span>
              </>
            );
          }}
        />
        <PillGroup
          label="Receive Token"
          items={[
            { id: 'USDC', label: 'USD Coin' },
            { id: 'USDT', label: 'Tether USD' },
          ]}
          active={selectedDestToken}
          disabled={isLoadingTokens || txStatus === 'preparing' || txStatus === 'signing'}
          disabledIds={[
            { id: 'USDC', label: 'USD Coin' },
            { id: 'USDT', label: 'Tether USD' },
          ].filter(dt => !tokens.some(t => t.chainSymbol === (selectedNetwork === 'BNB' ? ChainSymbol.BSC : ChainSymbol.ETH) && t.symbol === dt.id)).map(dt => dt.id)}
          onChange={id => {
            setDestSym(id as DestTokenType);
            setError(null);
          }}
          renderItem={(item, isActive) => (
            <>
              <img src={getIconUrl(item.id, currentChainConfig)} alt={item.id} className="w-4 h-4 rounded-full shrink-0" />
              <span className={isActive ? '' : 'text-secondary'}>{item.id}</span>
            </>
          )}
        />
      </div>

      {isLoadingTokens && (
        <div className="card p-5 flex items-center justify-center gap-3 text-muted rounded-2xl">
          <Loader2 size={18} className="animate-spin text-brand" />
          <span className="text-sm">Loading bridge tokens…</span>
        </div>
      )}

      {!isLoadingTokens && (
        <>
          <div className="card p-4 bg-tertiary rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted font-semibold uppercase tracking-wide">You Send</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted">
                  {isLoadingBalance ? (
                    <Loader2 size={10} className="animate-spin inline" />
                  ) : (
                    <span className="text-primary font-semibold">
                      {parseFloat(usdcBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USDC
                    </span>
                  )}
                </span>
                <button onClick={fetchBalance} disabled={isLoadingBalance} className="p-0.5 hover:bg-hover rounded transition-colors">
                  <RefreshCw size={11} className={`text-muted ${isLoadingBalance ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={handleAmountChange}
                placeholder="0.00"
                disabled={txStatus === 'preparing' || txStatus === 'signing'}
                className="input flex-1 text-2xl font-bold bg-transparent border-none shadow-none focus:ring-0 p-0 min-w-0"
              />
              <div className="flex items-center gap-1.5 bg-secondary border border-color py-1.5 px-2.5 rounded-xl shrink-0">
                <img src={getIconUrl('USDC')} alt="USDC" className="w-5 h-5 rounded-full" />
                <div className="leading-tight">
                  <div className="text-xs font-bold text-primary">USDC</div>
                  <div className="text-[9px] text-muted flex items-center gap-0.5">
                    <img src={getIconUrl('STELLAR')} alt="" className="w-2.5 h-2.5 rounded-full" />
                    Stellar
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <div className="flex items-center gap-2">
                {parsedAmount > 0 && !isTooSmall && !isInsufficient && (
                  <span className="text-[11px] text-muted">≈ ${fmt(parsedAmount, 2)} USD</span>
                )}
                {isTooSmall && <span className="text-danger text-[11px] flex items-center gap-1 font-medium"><AlertCircle size={11} /> Min 0.01</span>}
                {isInsufficient && <span className="text-danger text-[11px] flex items-center gap-1 font-medium"><AlertCircle size={11} /> Insufficient balance</span>}
              </div>
              {parsedBalance > 0 && (
                <button onClick={handleMax} className="text-[11px] text-brand-accent hover:text-brand-primary transition-colors font-bold px-1.5 py-0.5 rounded bg-brand-primary/10">
                  MAX
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-brand-primary/25 to-transparent" />
            <div className="flex items-center gap-1.5 bg-brand-primary/10 border border-brand-primary/20 px-2.5 py-1 rounded-full">
              <img src={getIconUrl('STELLAR')} alt="" className="w-3.5 h-3.5 rounded-full" />
              <ArrowRight size={10} className="text-brand-primary" />
              <span className="text-[10px] font-semibold text-brand-primary">Allbridge</span>
              <ArrowRight size={10} className="text-brand-primary" />
              <img src={getIconUrl(selectedNetwork, currentChainConfig)} alt="" className="w-3.5 h-3.5 rounded-full" />
            </div>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-brand-primary/25 to-transparent" />
          </div>

          <div className="card p-4 border border-brand-primary/25 bg-gradient-to-br from-brand-primary/5 to-brand-primary/10 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-primary">You Receive</span>
              <div className="flex items-center gap-1 bg-brand-primary/15 border border-brand-primary/25 px-2 py-0.5 rounded-lg">
                <img src={getIconUrl(selectedNetwork, currentChainConfig)} alt={selectedNetwork} className="w-3 h-3 rounded-full" />
                <span className="text-[10px] font-semibold text-brand-primary">
                  {selectedNetwork === 'BNB' ? 'BNB Chain' : 'Ethereum'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <div className="text-2xl font-bold text-primary leading-none">
                  {isLoadingQuote ? (
                    <div className="flex items-center gap-2">
                      <Loader2 size={18} className="animate-spin text-brand" />
                      <span className="text-base text-muted">Calculating…</span>
                    </div>
                  ) : quoteData ? (
                    `${fmt(quoteData.amountToBeReceived)} ${selectedDestToken}`
                  ) : parsedAmount > 0 ? (
                    <span className="text-muted text-xl">…</span>
                  ) : (
                    <span className="text-muted">0.00 {selectedDestToken}</span>
                  )}
                </div>
                {quoteData && !isLoadingQuote && (
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[11px] text-muted flex items-center gap-1">
                      <TrendingUp size={10} />1 USDC ≈ {quoteData.exchangeRate} {selectedDestToken}
                    </span>
                    <span className="text-[11px] text-muted">≈ ${fmt(quoteData.amountToBeReceived, 2)} USD</span>
                  </div>
                )}
              </div>
              <img src={getIconUrl(selectedDestToken, currentChainConfig)} alt={selectedDestToken} className="w-9 h-9 rounded-full shrink-0" />
            </div>
          </div>

          {quoteData && !isLoadingQuote && (
            <div className="card p-3.5 rounded-2xl space-y-2.5">
              <InfoRow icon={<Clock size={13} />} label="Estimated Time" value={fmtTime(quoteData.transferTimeMs)} valueClass="text-brand-primary" />
              <InfoRow icon={<TrendingUp size={13} />} label="Rate" value={`1 USDC ≈ ${quoteData.exchangeRate} ${selectedDestToken}`} />

              <Divider />
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted font-semibold uppercase tracking-widest">Pay Relayer Fee</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFeePayType('native')}
                    className={`flex items-center justify-between gap-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${feePayType === 'native' ? 'btn-primary border-transparent' : 'bg-tertiary text-secondary border-color hover:border-brand-primary/40'
                      }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <img src={getIconUrl('XLM')} alt="XLM" className="w-4 h-4 rounded-full" />
                    </div>
                    <div className="text-right leading-tight ml-1">
                      <div className="font-bold tabular-nums">{feeOptions!.native.float}</div>
                      {nativeFeeUsd && <div className={`text-[9px] font-normal ${feePayType === 'native' ? 'opacity-70' : 'text-muted'}`}>{nativeFeeUsd}</div>}
                    </div>
                  </button>

                  <button
                    onClick={() => !stablecoinUnavailable && setFeePayType('stablecoin')}
                    disabled={stablecoinUnavailable}
                    className={`flex items-center justify-between gap-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${feePayType === 'stablecoin'
                      ? 'btn-primary border-transparent'
                      : stablecoinUnavailable
                        ? 'bg-tertiary text-muted border-color opacity-40 cursor-not-allowed'
                        : 'bg-tertiary text-secondary border-color hover:border-brand-primary/40'
                      }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <img src={getIconUrl('USDC')} alt="USDC" className="w-4 h-4 rounded-full" />
                    </div>
                    <div className="text-right leading-tight ml-1">
                      {stablecoinUnavailable ? (
                        <div className="font-bold text-[10px]">N/A</div>
                      ) : (
                        <>
                          <div className="font-bold tabular-nums">{feeOptions!.stablecoin!.float}</div>
                          {stablecoinFeeUsd && <div className={`text-[9px] font-normal ${feePayType === 'stablecoin' ? 'opacity-70' : 'text-muted'}`}>{stablecoinFeeUsd}</div>}
                        </>
                      )}
                    </div>
                  </button>
                </div>
              </div>

              <Divider />

              <InfoRow label="From" value={<span className="font-mono text-xs" title={stellarAddress}>{shortAddr(stellarAddress)}</span>} />
              <InfoRow label="To" value={<span className="font-mono text-xs" title={evmAddress}>{shortAddr(evmAddress)}</span>} />
            </div>
          )}

          {error && txStatus !== 'success' && (
            <div className="card bg-danger-bg border border-danger/20 p-3.5 rounded-2xl flex items-start gap-2.5">
              <AlertCircle size={15} className="text-danger shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-danger text-xs font-semibold">Error</p>
                <p className="text-danger/80 text-[11px] mt-0.5 break-words">{error}</p>
              </div>
              {txStatus === 'error' && (
                <button onClick={() => { setError(null); setTxStatus('idle'); }} className="shrink-0 p-1 hover:bg-danger/10 rounded-lg">
                  <RefreshCw size={12} className="text-danger" />
                </button>
              )}
            </div>
          )}

          {txStatus === 'success' && txHash && (
            <div className="card bg-success-bg border border-success/25 p-3.5 rounded-2xl space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-success/15 flex items-center justify-center shrink-0">
                  <CheckCircle size={16} className="text-success" />
                </div>
                <div>
                  <p className="text-success font-bold text-sm">Bridge Submitted!</p>
                  <p className="text-success/70 text-xs">
                    {selectedDestToken} arrives on {selectedNetwork === 'BNB' ? 'BNB Chain' : 'Ethereum'} in {fmtTime(quoteData?.transferTimeMs ?? 0)}
                  </p>
                </div>
              </div>
              <a href={`${STELLAR_EXPLORER}${txHash}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between w-full bg-success/10 hover:bg-success/15 border border-success/20 px-3 py-2 rounded-xl transition-colors group">
                <span className="font-mono text-xs text-success truncate max-w-[200px]">{txHash}</span>
                <ExternalLink size={12} className="text-success shrink-0 ml-2 group-hover:translate-x-0.5 transition-transform" />
              </a>
            </div>
          )}

          {!stellarAddress ? (
            <div className="card p-4 rounded-2xl border border-warning/30 bg-warning-bg text-center">
              <div className="w-10 h-10 rounded-xl bg-warning/15 flex items-center justify-center mx-auto mb-2.5">
                <Wallet size={20} className="text-warning" />
              </div>
              <p className="font-bold text-primary text-sm mb-1">Stellar Wallet Required</p>
              <p className="text-muted text-xs mb-3">Connect Freighter, Lobstr or another Stellar wallet.</p>
              <button onClick={() => openModal()} className="btn btn-primary w-full py-2.5 rounded-xl font-semibold text-sm">
                Connect Stellar Wallet
              </button>
            </div>
          ) : !evmAddress ? (
            <div className="card p-4 rounded-2xl border border-warning/30 bg-warning-bg text-center">
              <div className="w-10 h-10 rounded-xl bg-warning/15 flex items-center justify-center mx-auto mb-2.5">
                <Wallet size={20} className="text-warning" />
              </div>
              <p className="font-bold text-primary text-sm mb-1">EVM Wallet Required</p>
              <p className="text-muted text-xs mb-3">
                Connect a {selectedNetwork === 'BNB' ? 'BNB Chain' : 'Ethereum'} wallet to receive {selectedDestToken}.
              </p>
              <button onClick={() => openModal()} className="btn btn-primary w-full py-2.5 rounded-xl font-semibold text-sm">
                Connect EVM Wallet
              </button>
            </div>
          ) : (
            <StellarActiveGuard onSkip={() => { }}>
              <button
                onClick={handleProceed}
                disabled={!canProceed}
                className={`btn w-full gap-2 py-3.5 text-sm font-bold rounded-2xl transition-all ${txStatus === 'success' ? 'btn-success' : 'btn-primary disabled:opacity-50 disabled:cursor-not-allowed'}`}
              >
                {txStatus === 'preparing' ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Preparing Transaction…
                  </>
                ) : txStatus === 'signing' ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Sign in Wallet…
                  </>
                ) : txStatus === 'success' ? (
                  <>
                    <CheckCircle size={18} /> Bridged Successfully!
                  </>
                ) : isLoadingQuote ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Getting Quote…
                  </>
                ) : !isValidAmount || !quoteData ? (
                  <>Enter Amount to Continue</>
                ) : (
                  <>
                    Bridge to {selectedNetwork === 'BNB' ? 'BNB Chain' : 'Ethereum'} <ArrowRight size={18} />
                  </>
                )}
              </button>

              {canProceed && quoteData && (
                <p className="text-center text-[11px] text-muted mt-1.5">
                  Fee:{' '}
                  <span className="font-semibold text-primary">
                    {feePayType === 'native'
                      ? `${feeOptions!.native.float} XLM ${nativeFeeUsd}`
                      : `${feeOptions!.stablecoin?.float} USDC ${stablecoinFeeUsd}`}
                  </span>{' '}
                  · Sign once in your Stellar wallet
                </p>
              )}
            </StellarActiveGuard>
          )}
        </>
      )}
    </div>
  );
};

export default StellarToEvmBridge;