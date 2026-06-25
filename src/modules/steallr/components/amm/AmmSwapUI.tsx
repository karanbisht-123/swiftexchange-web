import { AlertCircle, CheckCircle, RefreshCw, Settings, ChevronDown, ArrowUpDown, Clock } from 'lucide-react';
import { Suspense, lazy, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { SUCCESS_MESSAGES, UI_STRINGS } from '../../constants/ammSwapConstants';
import { useAmmSwap } from '../../hook/useAmmSwap';
import { useAmmSwapStore } from '../../store/ammSwapStore';
const StellarTradingChart = lazy(() => import('../chart/StellarTradingChart'));
import { SettingsPanel, SwapDetails } from './AmmSwapSubComponents';
import { XlmReserveButton } from './XlmReserveInfo';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { useTransactionModalStore } from '../../../../store/transactionModalStore';
import StellarAssetSelectorModal from '../modals/StellarAssetSelectorModal';
import { getChainById } from '../../../evm/utils/Chainregistry';
import { getTokenIcon } from '../../../evm/utils/ChainUrlHelpers';
import { portfolioUtils } from '../../../walletconnect/utils/portfolioUtils';

const AmmSwapUI = () => {
  const [showSettings, setShowSettings] = useState(false);
  const [swapStatus, setSwapStatus] = useState<'pending' | 'success' | null>(null);
  const [selectingAssetFor, setSelectingAssetFor] = useState<'from' | 'to' | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const { connectedWallets, getProvider, openModal } = useWalletConnect();
  const currentNetwork = useWalletStore(state => state.network);
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const stellarAddress = stellarWallet?.address || '';

  const {
    fromToken,
    toToken,
    fromAmount,
    toAmount,
    quote,
    isLoading,
    error,
    slippageTolerance,
    availableTokens,
    setFromToken,
    setToToken,
    setFromAmount,
    setSlippageTolerance,
    swapTokens,
    refreshQuote,
    buildTransaction,
    executeSwapWithWalletConnect,
    reset,
    subentryCount,
  } = useAmmSwap({
    userAddress: stellarAddress,
  });


  const {
    setDefaultSlippage,
    setSelectedChartPair,
    preSelectedToken,
    setPreSelectedToken,
  } = useAmmSwapStore();

  const isMainnet = currentNetwork === 'mainnet';
  const stellarChainId = isMainnet ? 'pubnet' : 'testnet';
  const chainConfig = getChainById(stellarChainId);

  useEffect(() => {
    if (preSelectedToken && availableTokens.length > 0) {
      const tokenToSelect = availableTokens.find(
        t =>
          t.code === preSelectedToken.code &&
          (!preSelectedToken.issuer || t.issuer === preSelectedToken.issuer)
      );
      if (tokenToSelect) {
        setFromToken(tokenToSelect);
        const xlm = availableTokens.find(t => t.code === 'XLM');
        if (xlm && tokenToSelect.code !== 'XLM') {
          setToToken(xlm);
        }
      }
      setPreSelectedToken(null);
    }
  }, [preSelectedToken, availableTokens, setFromToken, setToToken, setPreSelectedToken]);

  useEffect(() => {
    if (availableTokens.length === 0) return;

    const sellAsset = searchParams.get('sellAsset');
    const buyAsset = searchParams.get('buyAsset');

    if (sellAsset && sellAsset !== fromToken?.code) {
      const token = availableTokens.find(t => t.code === sellAsset);
      if (token) setFromToken(token);
    }

    if (buyAsset && buyAsset !== toToken?.code) {
      const token = availableTokens.find(t => t.code === buyAsset);
      if (token) setToToken(token);
    }
  }, [availableTokens, searchParams, fromToken?.code, toToken?.code]);

  useEffect(() => {
    if (fromToken || toToken) {
      const newParams = new URLSearchParams(searchParams);
      let needsUpdate = false;
      if (fromToken && newParams.get('sellAsset') !== fromToken.code) {
        newParams.set('sellAsset', fromToken.code);
        needsUpdate = true;
      }
      if (toToken && newParams.get('buyAsset') !== toToken.code) {
        newParams.set('buyAsset', toToken.code);
        needsUpdate = true;
      }
      if (needsUpdate) {
        setSearchParams(newParams, { replace: true });
      }
    }
  }, [fromToken?.code, toToken?.code]);

  useEffect(() => {
    if (fromToken && toToken) {
      setSelectedChartPair({
        base: fromToken.code,
        counter: toToken.code,
        baseIssuer: fromToken.issuer,
        counterIssuer: toToken.issuer,
      });
    }
  }, [fromToken, toToken, setSelectedChartPair]);

  const xlmToken = availableTokens.find(t => t.code === 'XLM');
  const xlmBalance = xlmToken?.balance || '0';

  const handleSlippageChange = (slippage: number) => {
    setSlippageTolerance(slippage);
    setDefaultSlippage(slippage);
  };

  const handleSwap = async () => {
    if (!fromToken || !toToken) {
      setSwapStatus(null);
      return;
    }

    if (!stellarWallet) {
      alert('Please connect your Stellar wallet first');
      return;
    }

    setSwapStatus('pending');
    try {
      const tx = await buildTransaction();
      const provider = getProvider(WalletType.STELLAR);

      if (!provider) {
        throw new Error('Stellar wallet provider not available');
      }

      const txHash = await executeSwapWithWalletConnect(tx, provider);

      useTransactionModalStore.getState().openModal({
        status: 'success',
        type: 'Swap',
        hash: txHash,
        isStellar: true,
      });

      setSwapStatus('success');
      setTimeout(() => {
        setSwapStatus(null);
        reset();
      }, 3000);
    } catch (err: any) {
      setSwapStatus(null);
      useTransactionModalStore.getState().openModal({
        status: 'error',
        type: 'Swap',
        error: err?.message || 'Transaction failed',
        isStellar: true,
      });
      console.error('Swap failed:', err);
    }
  };

  const canSwap = fromAmount && parseFloat(fromAmount) > 0 && !isLoading && quote && stellarWallet;

  const renderSwapForm = () => (
    <div className="mx-auto space-y-6  w-full max-w-lg">
      <div className="flex items-center justify-between mb-2">
        <h4 className="heading-4">Swap</h4>
        <div className="flex items-center gap-2 relative">
          <XlmReserveButton xlmBalance={xlmBalance} trustlineCount={subentryCount} />
          <button
            onClick={refreshQuote}
            disabled={!quote || isLoading}
            className="btn btn-ghost btn-sm"
          >
            <RefreshCw className={`w-4 h-4 text-text-muted ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowSettings(!showSettings)} className="btn btn-ghost btn-sm">
            <Settings className="w-4 h-4 text-text-muted" />
          </button>
          <SettingsPanel
            slippage={slippageTolerance}
            onSlippageChange={handleSlippageChange}
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
          />
        </div>
      </div>

      {/* Pay Card */}
      <div className="bg-tertiary rounded-2xl p-4 lg:p-6 relative overflow-hidden flex flex-col border border-color">
        <div className="flex justify-between items-center mb-4">
          <label className="text-xs font-black uppercase tracking-[0.15em] text-muted opacity-90">You Pay</label>
          <button
            onClick={() => {
              const balance = parseFloat(fromToken?.balance || '0');
              const reserve = fromToken?.code === 'XLM' ? (1 + subentryCount * 0.5) : 0;
              const maxAmount = Math.max(0, balance - reserve);
              setFromAmount(maxAmount.toFixed(7));
            }}
            className="text-[10px] font-black text-brand hover:scale-110 active:scale-95 transition-all px-3 py-1 bg-brand/10 border border-brand/20 rounded-full"
          >
            MAX
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectingAssetFor('from')}
            className="flex items-center gap-2 bg-secondary rounded-2xl px-3 py-2.5 hover:bg-hover active:scale-[0.98] transition-all relative group min-w-0"
            style={{ width: 'clamp(130px, 35vw, 160px)' }}
          >
            <div className="relative min-w-[36px]">
              {(() => {
                const icon = fromToken?.icon || getTokenIcon(fromToken?.code || '', chainConfig, fromToken?.issuer);
                return (
                  <img
                    key={fromToken?.code ? `${fromToken.code}-${fromToken.issuer || 'native'}` : 'placeholder'}
                    src={icon || `https://ui-avatars.com/api/?name=${fromToken?.code || 'S'}&background=random`}
                    className="w-9 h-9 rounded-full bg-tertiary object-cover"
                    alt=""
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${fromToken?.code || 'S'}&background=random`;
                    }}
                  />
                );
              })()}
              <img
                src={chainConfig?.nativeCurrency.logoURI}
                className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-secondary bg-secondary"
                alt=""
              />
            </div>
            <div className="flex flex-col items-start pr-1 min-w-0 overflow-hidden text-left">
              <span className="font-bold text-[13px] leading-tight truncate w-full">{fromToken?.code || 'Select'}</span>
              <span className="text-[8px] text-muted font-bold tracking-tight truncate w-full uppercase">Stellar</span>
            </div>
            <ChevronDown size={13} className="text-muted group-hover:text-primary transition-all ml-auto flex-shrink-0" />
          </button>

          <div className="flex-1 min-w-0 relative">
            <input
              type="text"
              inputMode="decimal"
              value={fromAmount}
              onChange={e => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                  setFromAmount(val);
                }
              }}
              placeholder="0.00"
              className="peer w-full bg-transparent border-none text-right text-3xl font-black focus:ring-0 p-0 placeholder:text-muted/10 truncate transition-all outline-none"
              disabled={isLoading}
            />
            <div className="absolute left-[-12px] top-1/2 -translate-y-1/2 w-[2px] h-8 bg-brand opacity-0 transition-opacity peer-focus:opacity-100" />
          </div>
        </div>

        <div className="mt-4 flex justify-between items-center text-[10px] font-bold">
          <div className="flex items-center gap-2 text-muted">
            <span>Spendable Balance:</span>
            <span className="text-primary font-black">
              {fromToken?.balance
                ? portfolioUtils.formatBalance(
                  fromToken.code === 'XLM'
                    ? Math.max(0, parseFloat(fromToken.balance) - (1 + subentryCount * 0.5)).toString()
                    : fromToken.balance
                )
                : '0.0000'} {fromToken?.code}
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-center -my-8 relative z-10">
        <button
          onClick={swapTokens}
          className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center hover:scale-110 active:scale-90 transition-all duration-300 text-brand group backdrop-blur-md border border-color"
        >
          <ArrowUpDown size={18} className="group-hover:rotate-180 transition-transform duration-500" />
        </button>
      </div>

      <div className="bg-tertiary rounded-2xl p-4 lg:p-6 relative overflow-hidden flex flex-col border border-color">
        <div className="flex justify-between items-center mb-4">
          <label className="text-xs font-black uppercase tracking-[0.15em] text-muted opacity-90">You Receive</label>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectingAssetFor('to')}
            className="flex items-center gap-2 bg-secondary rounded-2xl px-3 py-2.5 hover:bg-hover active:scale-[0.98] transition-all relative group min-w-0"
            style={{ width: 'clamp(130px, 35vw, 160px)' }}
          >
            <div className="relative min-w-[36px]">
              {(() => {
                const icon = toToken?.icon || getTokenIcon(toToken?.code || '', chainConfig, toToken?.issuer);
                return (
                  <img
                    key={toToken?.code ? `${toToken.code}-${toToken.issuer || 'native'}` : 'placeholder'}
                    src={icon || `https://ui-avatars.com/api/?name=${toToken?.code || 'S'}&background=random`}
                    className="w-9 h-9 rounded-full bg-tertiary object-cover"
                    alt=""
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${toToken?.code || 'S'}&background=random`;
                    }}
                  />
                );
              })()}
              <img
                src={chainConfig?.nativeCurrency.logoURI}
                className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-secondary bg-secondary"
                alt=""
              />
            </div>
            <div className="flex flex-col items-start pr-1 min-w-0 overflow-hidden text-left">
              <span className="font-bold text-[13px] leading-tight truncate w-full">{toToken?.code || 'Select'}</span>
              <span className="text-[8px] text-muted font-bold tracking-tight truncate w-full uppercase">Stellar</span>
            </div>
            <ChevronDown size={13} className="text-muted group-hover:text-primary transition-all ml-auto flex-shrink-0" />
          </button>

          <div className="flex-1 text-right min-w-0">
            <div className={`font-black truncate text-primary text-3xl tabular-nums`}>
              {isLoading ? (
                <div className="w-20 h-8 bg-white/5 animate-pulse rounded-md ml-auto" />
              ) : (
                toAmount || '0.00'
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-between items-center text-[10px] font-bold">
          <div className="flex items-center gap-2 text-muted">
            <span>Spendable Balance:</span>
            <span className="text-primary font-black">
              {toToken?.balance
                ? portfolioUtils.formatBalance(
                  toToken.code === 'XLM'
                    ? Math.max(0, parseFloat(toToken.balance) - (1 + subentryCount * 0.5)).toString()
                    : toToken.balance
                )
                : '0.0000'} {toToken?.code}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl animate-fade-in mt-4">
          <AlertCircle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs font-bold text-red-500 uppercase tracking-widest">{error}</p>
        </div>
      )}

      <SwapDetails quote={quote} />

      <button
        onClick={handleSwap}
        disabled={!canSwap || swapStatus === 'pending'}
        className={`w-full py-4 sm:py-5 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-[0.2em] transition-all duration-500 mt-6 ${canSwap && swapStatus !== 'pending'
          ? 'btn btn-primary'
          : 'bg-tertiary text-muted opacity-50 cursor-not-allowed border border-divider'
          }`}
      >
        {swapStatus === 'pending' ? (
          <span className="flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin" />
            SWAPPING...
          </span>
        ) : swapStatus === 'success' ? (
          <span className="flex items-center justify-center gap-2">
            <CheckCircle className="w-5 h-5" />
            {SUCCESS_MESSAGES.SWAP_SUCCESS}
          </span>
        ) : !fromAmount ? (
          UI_STRINGS.ENTER_AMOUNT
        ) : !canSwap ? (
          'INSUFFICIENT BALANCE'
        ) : !toToken?.hasTrustline ? (
          `Add Trustline & Swap`
        ) : (
          UI_STRINGS.SWAP_BUTTON
        )}
      </button>

      {quote && (
        <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-muted uppercase tracking-[0.1em] mt-4">
          <Clock size={12} />
          {UI_STRINGS.QUOTE_EXPIRY}
        </div>
      )}
    </div>
  );

  if (!stellarWallet) {
    return (
      <div className="bg-secondary h-full p-4 lg:p-6 rounded-xl flex items-center justify-center">
        <div className="w-full max-w-lg text-center space-y-4">
          <AlertCircle className="w-16 h-16 text-warning mx-auto" />
          <h4 className="heading-4">Stellar Wallet Not Connected</h4>
          <p className="text-muted">Please connect your Stellar wallet to start swapping tokens</p>
          <button onClick={openModal} className="btn btn-primary btn-lg w-full font-semibold mt-4">
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col lg:flex-row gap-1  lg:gap-4 h-full lg:p-0 overflow-y-auto lg:overflow-visible">
      <div className="w-full h-[300px] bg-secondary lg:h-auto lg:flex-1 lg:rounded-xl overflow-hidden shrink-0 border border-color">
        <Suspense fallback={
          <div className="w-full h-full flex items-center justify-center bg-secondary">
            <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin"></div>
          </div>
        }>
          <StellarTradingChart />
        </Suspense>
      </div>
      <div className="w-full lg:w-[450px] bg-secondary p-2 lg:p-6 lg:rounded-xl shrink-0 border border-color">
        {renderSwapForm()}
      </div>

      <StellarAssetSelectorModal
        isOpen={selectingAssetFor !== null}
        onClose={() => setSelectingAssetFor(null)}
        tokens={availableTokens}
        selectedToken={selectingAssetFor === 'from' ? fromToken : toToken}
        onSelect={(token) => {
          if (selectingAssetFor === 'from') {
            setFromToken(token);
          } else {
            setToToken(token);
          }
        }}
        title={`Select ${selectingAssetFor === 'from' ? 'Pay' : 'Receive'} Asset`}
      />
    </div>
  );
};

export default AmmSwapUI;
