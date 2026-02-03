import { AlertCircle, ArrowDownUp, CheckCircle, Clock, RefreshCw, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';

import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { ERROR_MESSAGES, SUCCESS_MESSAGES, UI_STRINGS } from '../../constants/ammSwapConstants';
import { useAmmSwap } from '../../hook/useAmmSwap';
import { useAmmSwapStore } from '../../store/ammSwapStore';
import { SettingsPanel, SwapDetails, TokenSelector } from './AmmSwapSubComponents';
import { XlmReserveButton, useTrustlineCount } from './XlmReserveInfo';
import StellarTradingChart from '../chart/StellarTradingChart';

const AmmSwapUI = () => {
  const [showSettings, setShowSettings] = useState(false);
  const [swapStatus, setSwapStatus] = useState<'pending' | 'success' | null>(null);

  const { connectedWallets, getProvider, openModal } = useWalletConnect();
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
  } = useAmmSwap({
    userAddress: stellarAddress,
  });

  const { addTransaction, setDefaultSlippage, setSelectedChartPair, preSelectedToken, setPreSelectedToken } = useAmmSwapStore();
  const trustlineCount = useTrustlineCount(availableTokens);

  useEffect(() => {
    if (preSelectedToken && availableTokens.length > 0) {
      const tokenToSelect = availableTokens.find(
        t => t.code === preSelectedToken.code &&
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
      addTransaction({
        id: Date.now().toString(),
        fromToken,
        toToken,
        fromAmount,
        toAmount,
        status: 'failed',
        timestamp: Date.now(),
      });
      console.error('Swap failed:', err);
    }
  };

  const canSwap = fromAmount && parseFloat(fromAmount) > 0 && !isLoading && quote && stellarWallet;

  const renderSwapForm = () => (
    <div className="w-full max-w-lg mx-auto max-h-[600px] overflow-y-auto p-2 no-scrollbar">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="heading-4">Swap</h4>
          <div className="flex items-center gap-2 relative">
            <XlmReserveButton xlmBalance={xlmBalance} trustlineCount={trustlineCount} />

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
              Balance:{' '}
              {fromToken?.balance ? parseFloat(fromToken.balance).toFixed(7) : '0.0000000'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={fromAmount}
              onChange={e => setFromAmount(e.target.value)}
              placeholder="0.0"
              className="input input-primary flex-1 text-2xl font-semibold bg-transparent"
              disabled={isLoading}
            />
            <TokenSelector
              selectedToken={fromToken || { code: 'Select', balance: '0' }}
              onSelect={setFromToken}
              tokens={availableTokens}
              label="From"
            />
          </div>
          {fromToken?.balance && (
            <button
              onClick={() => {
                const balance = parseFloat(fromToken.balance || '0');
                const reserve = fromToken.code === 'XLM' ? 2 : 0;
                const maxAmount = Math.max(0, balance - reserve);
                setFromAmount(maxAmount.toFixed(7));
              }}
              className="text-xs text-brand-accent hover:text-brand-primary transition-colors"
            >
              MAX
            </button>
          )}
        </div>

        <div className="flex justify-center relative z-10">
          <button
            onClick={swapTokens}
            className="btn btn-glass p-3 lg:rounded-xl hover:scale-110 transition-all duration-300 bg-primary"
            disabled={isLoading}
          >
            <ArrowDownUp className="w-5 h-5 text-text-inverse" />
          </button>
        </div>

        <div className="card card-glass p-4 space-y-2">
          <div className="flex items-center justify-between text-small text-muted">
            <span>To</span>
            <span>
              Balance: {toToken?.balance ? parseFloat(toToken.balance).toFixed(7) : '0.0000000'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={toAmount}
              readOnly
              placeholder="0.0"
              className="input input-primary flex-1 text-2xl font-semibold bg-transparent cursor-not-allowed"
            />
            <TokenSelector
              selectedToken={toToken || { code: 'Select', balance: '0' }}
              onSelect={setToToken}
              tokens={availableTokens}
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
          <div className="flex items-start gap-2 p-3 bg-danger-light rounded-lg animate-fade-in">
            <AlertCircle className="w-4 h-4 text-danger mt-0.5 flex-shrink-0" />
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        <SwapDetails quote={quote} />

        <button
          onClick={handleSwap}
          disabled={!canSwap || swapStatus === 'pending'}
          className={`btn btn-primary py-4  btn-gradient btn w-full font-semibold ${canSwap && swapStatus !== 'pending'
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
  );

  if (!stellarWallet) {
    return (
      <div className="bg-secondary h-full p-4 lg:p-6 rounded-xl flex items-center justify-center">
        <div className="w-full max-w-lg text-center space-y-4">
          <AlertCircle className="w-16 h-16 text-warning mx-auto" />
          <h4 className="heading-4">Stellar Wallet Not Connected</h4>
          <p className="text-muted">Please connect your Stellar wallet to start swapping tokens</p>
          <button
            onClick={openModal}
            className="btn btn-primary btn-lg w-full font-semibold mt-4"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  // if (availableTokens.length === 0 && !error) {
  //   return (
  //     <div className="bg-secondary h-full p-2 lg:p-6 lg:rounded-xl flex items-center justify-center">
  //       <div className="w-full max-w-lg text-center space-y-4">
  //         <RefreshCw className="w-16 h-16 text-brand animate-spin mx-auto" />
  //         <h4 className="heading-4">Loading Your Tokens...</h4>
  //         <p className="text-muted">Fetching your token balances from the network</p>
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <div className="flex flex-col lg:flex-row gap-1  lg:gap-4 h-full lg:p-0 overflow-y-auto lg:overflow-visible">
      <div className="w-full h-[300px] lg:h-auto lg:flex-1 lg:rounded-xl overflow-hidden shrink-0">
        <StellarTradingChart />
      </div>
      <div className="w-full lg:w-[450px] bg-secondary p-2 lg:p-6 lg:rounded-xl shrink-0">
        {renderSwapForm()}
      </div>
    </div>
  );
};

export default AmmSwapUI;
