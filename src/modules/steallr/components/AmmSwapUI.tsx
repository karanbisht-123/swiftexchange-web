import { AlertCircle, ArrowDownUp, CheckCircle, Clock, RefreshCw, Settings } from 'lucide-react';
import { useState } from 'react';

import { useWalletStore } from '../../wallet/store.ts/walletStore';
import { ERROR_MESSAGES, SUCCESS_MESSAGES, UI_STRINGS } from '../constants/ammSwapConstants';
import { useAmmSwap } from '../hook/useAmmSwap';
import { useAmmSwapStore } from '../store/ammSwapStore';
import { SettingsPanel, SwapDetails, TokenSelector } from './AmmSwapSubComponents';

const AmmSwapUI = () => {
  const [showSettings, setShowSettings] = useState(false);
  const [swapStatus, setSwapStatus] = useState<'pending' | 'success' | null>(null);

  const { walletAddresses, getPrivateKey } = useWalletStore();
  const stellarAddress = walletAddresses[1] || '';

  const {
    fromToken,
    toToken,
    fromAmount,
    toAmount,
    quote,
    isLoading,
    error,
    slippageTolerance,
    popularTokens,
    setFromToken,
    setToToken,
    setFromAmount,
    setSlippageTolerance,
    swapTokens,
    refreshQuote,
    buildTransaction,
    executeSwap,
    reset,
  } = useAmmSwap({
    networkKey: 'testnet',
    userAddress: stellarAddress,
  });

  const { addTransaction, defaultSlippage, setDefaultSlippage } = useAmmSwapStore();

  console.log(defaultSlippage);
  const handleSlippageChange = (slippage: number) => {
    setSlippageTolerance(slippage);
    setDefaultSlippage(slippage);
  };

  const handleSwap = async () => {
    if (!fromToken || !toToken) {
      setSwapStatus(null);
      return;
    }

    setSwapStatus('pending');
    try {
      const tx = await buildTransaction();
      const privateKey = (await getPrivateKey('stellar')) || '';
      if (!privateKey) {
        throw new Error('No private key available');
      }
      const txHash = await executeSwap(privateKey);
      addTransaction({
        ...tx,
        status: 'success',
        txHash,
        timestamp: Date.now(),
      });
      setSwapStatus('success');
      setTimeout(() => {
        setSwapStatus(null);
        reset();
      }, 3000);
    } catch (err) {
      setSwapStatus(null);
      // const message =
      //   err instanceof Error ? err.message : ERROR_MESSAGES.SWAP_FAILED;
      addTransaction({
        id: Date.now().toString(),
        fromToken,
        toToken,
        fromAmount,
        toAmount,
        status: 'failed',
        timestamp: Date.now(),
      });
    }
  };

  const canSwap = fromAmount && parseFloat(fromAmount) > 0 && !isLoading && quote;

  return (
    <div className=" bg-secondary h-full border lg:border-none p-4 lg:p-6 rounded-xl flex items-center justify-center">
      <div className=" w-full max-w-lg">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h4 className="heading-4">Swap</h4>
            <div className="flex items-center gap-2 relative">
              <button
                onClick={refreshQuote}
                disabled={!quote || isLoading}
                className="btn btn-ghost btn-sm"
              >
                <RefreshCw
                  className={`w-4 h-4 text-text-muted ${isLoading ? 'animate-spin' : ''}`}
                />
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="btn btn-ghost btn-sm"
              >
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

          <div className="card card-glass p-4 space-y-2">
            <div className="flex items-center justify-between text-small text-muted">
              <span>From</span>
              <span>
                Balance: {fromToken?.balance ? parseFloat(fromToken.balance).toFixed(2) : '0.00'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={fromAmount}
                onChange={e => setFromAmount(e.target.value)}
                placeholder="0.0"
                className="input input-primary flex-1 text-2xl font-semibold"
              />
              <TokenSelector
                selectedToken={fromToken || { code: 'Select', balance: '0' }}
                onSelect={setFromToken}
                tokens={popularTokens}
                label="From"
              />
            </div>
            {fromToken?.balance && (
              <button
                onClick={() => setFromAmount(fromToken.balance)}
                className="text-xs text-brand-accent hover:text-brand-primary transition-colors"
              >
                MAX
              </button>
            )}
          </div>

          <div className="flex justify-center  relative z-10">
            <button
              onClick={swapTokens}
              className="btn btn-glass p-3 rounded-xl hover:scale-110 transition-all duration-300 border-2 border-border-accent"
            >
              <ArrowDownUp className="w-5 h-5 text-text-inverse" />
            </button>
          </div>

          <div className="card card-glass p-4 space-y-2">
            <div className="flex items-center justify-between text-small text-muted">
              <span>To</span>
              <span>
                Balance: {toToken?.balance ? parseFloat(toToken.balance).toFixed(2) : '0.00'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={toAmount}
                readOnly
                placeholder="0.0"
                className="input input-primary flex-1 text-2xl font-semibold"
              />
              <TokenSelector
                selectedToken={toToken || { code: 'Select', balance: '0' }}
                onSelect={setToToken}
                tokens={popularTokens}
                label="To"
              />
            </div>
            {isLoading && (
              <div className="text-xs text-muted flex items-center gap-2">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Fetching best price...
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-danger-light border border-danger rounded-lg animate-fade-in">
              <AlertCircle className="w-4 h-4 text-danger mt-0.5 flex-shrink-0" />
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          <SwapDetails quote={quote} slippage={slippageTolerance} />

          <button
            onClick={handleSwap}
            disabled={!canSwap || swapStatus === 'pending'}
            className={`btn btn-gradient btn-lg w-full font-semibold ${
              canSwap && swapStatus !== 'pending'
                ? 'animate-scale-in'
                : 'opacity-50 cursor-not-allowed'
            }`}
          >
            {swapStatus === 'pending' ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin" />
                Swapping...
              </span>
            ) : swapStatus === 'success' ? (
              <span className="flex items-center justify-center gap-2">
                <CheckCircle className="w-5 h-5" />
                {SUCCESS_MESSAGES.SWAP_SUCCESS}
              </span>
            ) : !fromAmount ? (
              UI_STRINGS.ENTER_AMOUNT
            ) : !canSwap ? (
              ERROR_MESSAGES.INSUFFICIENT_BALANCE
            ) : (
              UI_STRINGS.SWAP_BUTTON
            )}
          </button>

          {quote && (
            <div className="flex items-center justify-center gap-2 text-xs text-muted animate-fade-in">
              <Clock className="w-3 h-3" />
              {UI_STRINGS.QUOTE_EXPIRY}
            </div>
          )}

          <div className="text-center text-muted text-sm">
            Powered by Stellar AMM |{' '}
            <a
              href="https://stellar.org"
              className="text-brand-secondary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn More
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AmmSwapUI;
