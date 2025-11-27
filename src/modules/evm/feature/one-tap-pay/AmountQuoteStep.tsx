import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Info,
  Loader2,
  ShoppingCart,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';

import type { QuoteDetails } from '../../../../types/evm/onTapPay.types';
import { TRANSACTION_STEP } from '../../constant/OnTapPay.constants';
import { useOneTapPay } from '../../hook/useOneTapPay';

interface AmountQuoteStepProps {
  onComplete: (data: {
    amount: number;
    quoteDetails: QuoteDetails;
    transactionHash: string;
    bridgeTransactionHash?: string;
  }) => void;
  onBack: () => void;
  bridgeRecipient?: string;
  onRampUrl?: string;
  selectedAsset?: any;
  stellarAddress?: string;
}

const AmountQuoteStep: React.FC<AmountQuoteStepProps> = ({
  onComplete,
  onBack,
  bridgeRecipient = '0x0000000000000000000000000000000000000000',
  onRampUrl,
  selectedAsset,
  stellarAddress,
}) => {
  const {
    amount,
    currentStep,
    quoteDetails,
    bridgeQuoteDetails,
    error,
    successMessage,
    nativeBalance,
    usdtBalance,
    usdcBalance,
    isBalanceLoading,
    assets,
    swapPath,
    hasInsufficientBalance,
    handleAmountChange,
    handleApprove,
    handleDeposit,
  } = useOneTapPay({ bridgeRecipient, onRampUrl, onComplete });

  console.log(selectedAsset, stellarAddress, '==============');
  const renderSwapPath = () => {
    if (swapPath === 'NONE' || !assets.native) return null;

    return (
      <div className="card-bordered p-3 rounded-xl bg-blue-500/5">
        <div className="text-xs font-semibold text-muted mb-2">Transaction Path</div>
        <div className="flex items-center gap-2 text-sm">
          {swapPath === 'NATIVE_TO_USDT_TO_USDC' && (
            <>
              <div className="px-2 py-1 bg-blue-500/10 rounded font-medium">
                {assets.native.code}
              </div>
              <ArrowRight className="h-4 w-4 text-muted" />
              <div className="px-2 py-1 bg-yellow-500/10 rounded font-medium">USDT</div>
              <ArrowRight className="h-4 w-4 text-muted" />
              <div className="px-2 py-1 bg-green-500/10 rounded font-medium">USDC</div>
            </>
          )}
          {swapPath === 'USDT_TO_USDC' && (
            <>
              <div className="px-2 py-1 bg-yellow-500/10 rounded font-medium">USDT</div>
              <ArrowRight className="h-4 w-4 text-muted" />
              <div className="px-2 py-1 bg-green-500/10 rounded font-medium">USDC</div>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderQuoteDetails = () => {
    if (currentStep === TRANSACTION_STEP.FETCHING_QUOTES) {
      return (
        <div className="flex justify-center items-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <p className="ml-2 text-muted">Getting best rates...</p>
        </div>
      );
    }

    if (hasInsufficientBalance) {
      return null;
    }

    if (error && !quoteDetails) {
      return <p className="text-center text-danger py-4">{error}</p>;
    }

    if (!quoteDetails || swapPath === 'NONE') {
      return (
        <div className="text-center py-6">
          <TrendingUp className="h-8 w-8 text-muted mx-auto mb-2" />
          <p className="text-muted text-sm">Enter amount to see conversion rate</p>
        </div>
      );
    }

    const rawSwapQuote = quoteDetails.rawQuote as any;
    const estimatedOutput =
      bridgeQuoteDetails?.rawQuote?.quotes?.minimumAmountOut ||
      rawSwapQuote?.outputAmount ||
      amount;

    const swapDetails =
      swapPath === 'NATIVE_TO_USDT_TO_USDC'
        ? [
            { label: 'Swap Provider', value: quoteDetails.provider },
            { label: 'Exchange Rate', value: quoteDetails.rate1 },
            { label: 'Price Impact', value: quoteDetails.slippage1 },
            { label: 'Minimum Received', value: quoteDetails.minReceived1 },
            ...(rawSwapQuote.outputAmount
              ? [
                  {
                    label: 'USDT Output',
                    value: `${parseFloat(rawSwapQuote.outputAmount).toFixed(4)} USDT`,
                  },
                ]
              : []),
          ]
        : [];

    const bridgeDetails = bridgeQuoteDetails
      ? [
          { label: 'Bridge Provider', value: bridgeQuoteDetails.provider },
          { label: 'Conversion Rate', value: bridgeQuoteDetails.rate },
          { label: 'Bridge Slippage', value: bridgeQuoteDetails.slippage },
          { label: 'Min USDC Received', value: bridgeQuoteDetails.minReceived },
        ]
      : [];

    return (
      <div className="space-y-3">
        {/* Conversion Summary */}
        <div className="card-bordered p-4 rounded-xl bg-gradient-to-br from-blue-500/5 to-purple-500/5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-muted">You Pay</div>
            <div className="text-lg font-bold text-primary">
              {parseFloat(amount).toFixed(4)}{' '}
              {swapPath === 'NATIVE_TO_USDT_TO_USDC' ? assets.native?.code : 'USDT'}
            </div>
          </div>

          <div className="flex justify-center my-2">
            <div className="p-2 rounded-full bg-blue-500/10">
              <Zap className="h-4 w-4 text-blue-500" />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted">You Receive (Est.)</div>
            <div className="text-lg font-bold text-success">
              ~{parseFloat(estimatedOutput).toFixed(4)} USDC
            </div>
          </div>
        </div>

        {/* Swap Path Visualization */}
        {renderSwapPath()}

        {/* Detailed Breakdown */}
        <div className="text-sm text-primary">
          {swapDetails.length > 0 && (
            <div className="card-flat p-3 border-b rounded-b-none rounded-lg border-color">
              <div className="flex items-center gap-2 mb-2">
                <div className="text-xs text-muted font-semibold">Step 1: Swap Details</div>
                <div className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-600 rounded">
                  {assets.native?.code} → USDT
                </div>
              </div>
              {swapDetails.map(({ label, value }) => (
                <div
                  key={label}
                  className="flex justify-between py-1 border-dashed border-b border-color/50 last:border-0"
                >
                  <span className="text-muted">{label}:</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          )}

          {bridgeDetails.length > 0 && (
            <div
              className={`card-flat p-3 rounded-lg ${swapDetails.length > 0 ? 'rounded-t-none border-t-0' : ''}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="text-xs text-muted font-semibold">
                  {swapPath === 'NATIVE_TO_USDT_TO_USDC'
                    ? 'Step 2: Bridge Details'
                    : 'Bridge Details'}
                </div>
                <div className="text-xs px-2 py-0.5 bg-green-500/10 text-green-600 rounded">
                  USDT → USDC
                </div>
              </div>
              {bridgeDetails.map(({ label, value }) => (
                <div
                  key={label}
                  className="flex justify-between py-1 border-dashed border-b border-color/50 last:border-0"
                >
                  <span className="text-muted">{label}:</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="card-flat p-3 rounded-lg bg-blue-500/5">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-muted">
              {swapPath === 'NATIVE_TO_USDT_TO_USDC' ? (
                <>
                  Your {assets.native?.code} will be swapped to USDT via Uniswap V3, then bridged to
                  USDC via Allbridge. Gas fees will be deducted from your {assets.native?.code}{' '}
                  balance.
                </>
              ) : (
                <>
                  Your USDT will be bridged directly to USDC via Allbridge. A small bridge fee
                  applies.
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const PROCESSING_STEPS = new Set<any>([
    TRANSACTION_STEP.PREPARING_APPROVAL,
    TRANSACTION_STEP.SIGNING_APPROVAL,
    TRANSACTION_STEP.EXECUTING_APPROVAL,
    TRANSACTION_STEP.PREPARING_SWAP,
    TRANSACTION_STEP.SIGNING_SWAP,
    TRANSACTION_STEP.EXECUTING_SWAP,
    TRANSACTION_STEP.PREPARING_BRIDGE,
    TRANSACTION_STEP.EXECUTING_BRIDGE,
  ]);

  const isProcessing = PROCESSING_STEPS.has(currentStep);

  const noBothBalances = parseFloat(nativeBalance) === 0 && parseFloat(usdtBalance) === 0;

  const isButtonDisabled =
    currentStep === TRANSACTION_STEP.FETCHING_QUOTES ||
    isProcessing ||
    hasInsufficientBalance ||
    noBothBalances ||
    swapPath === 'NONE' ||
    !amount ||
    parseFloat(amount) <= 0 ||
    (!!error && !quoteDetails) ||
    !quoteDetails ||
    currentStep === TRANSACTION_STEP.COMPLETED;

  const getButtonText = () => {
    if (noBothBalances) return 'No Balance Available';
    if (hasInsufficientBalance) return 'Insufficient Balance';
    if (isProcessing) {
      if (currentStep === TRANSACTION_STEP.EXECUTING_APPROVAL) return 'Approving USDT...';
      if (currentStep === TRANSACTION_STEP.EXECUTING_SWAP) return 'Swapping to USDT...';
      if (currentStep === TRANSACTION_STEP.EXECUTING_BRIDGE) return 'Bridging to USDC...';
      return 'Processing...';
    }
    if (currentStep === TRANSACTION_STEP.COMPLETED) return 'Transaction Completed';
    return 'Convert to USDC';
  };

  const getInputLabel = () => {
    if (swapPath === 'NONE' || !assets.native) return 'Amount';

    if (swapPath === 'NATIVE_TO_USDT_TO_USDC') {
      return `Amount (${assets.native.code})`;
    }
    return 'Amount (USDT)';
  };

  const getCurrentBalance = () => {
    if (swapPath === 'NATIVE_TO_USDT_TO_USDC') {
      return nativeBalance;
    }
    return usdtBalance;
  };

  const getCurrentToken = () => {
    if (swapPath === 'NATIVE_TO_USDT_TO_USDC') {
      return assets.native?.code || '';
    }
    return 'USDT';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <button
          onClick={onBack}
          className="btn btn-ghost mr-3 p-2"
          aria-label="Go back"
          disabled={isProcessing || currentStep === TRANSACTION_STEP.FETCHING_QUOTES}
        >
          <ArrowLeft className="h-5 w-5 text-muted" />
        </button>
        <h3 className="heading-3">Convert to USDC</h3>
      </div>

      {noBothBalances ? (
        <div className="text-center py-8 space-y-4">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-blue-500/10">
              <ShoppingCart className="h-8 w-8 text-blue-500" />
            </div>
          </div>
          <div>
            <h4 className="text-lg font-semibold text-primary mb-2">No Balance Available</h4>
            <p className="text-sm text-muted">
              You need to deposit funds first. Buy crypto directly using fiat to get started.
            </p>
          </div>
          <button onClick={handleDeposit} className="btn btn-primary w-full">
            <ShoppingCart className="h-5 w-5 mr-2" />
            Deposit Now
          </button>
        </div>
      ) : (
        <>
          {/* Available Balances */}
          <div className="card-bordered p-3 rounded-xl space-y-2">
            <h4 className="text-sm font-medium text-muted">Available Balances</h4>
            <div className="space-y-1">
              {assets.native && parseFloat(nativeBalance) > 0 && (
                <div
                  className={`flex justify-between items-center p-2 rounded transition-colors ${
                    swapPath === 'NATIVE_TO_USDT_TO_USDC'
                      ? 'bg-blue-500/10 border border-blue-500/20'
                      : 'hover:bg-gray-500/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <img
                      src={assets.native.logoUri}
                      alt={assets.native.code}
                      className="w-5 h-5 rounded-full"
                      onError={e => {
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/20';
                      }}
                    />
                    <span className="text-sm font-medium">{assets.native.code}</span>
                  </div>
                  <span className="text-sm font-medium">
                    {isBalanceLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      parseFloat(nativeBalance).toFixed(6)
                    )}
                  </span>
                </div>
              )}
              {assets.usdt && parseFloat(usdtBalance) > 0 && (
                <div
                  className={`flex justify-between items-center p-2 rounded transition-colors ${
                    swapPath === 'USDT_TO_USDC'
                      ? 'bg-blue-500/10 border border-blue-500/20'
                      : 'hover:bg-gray-500/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <img
                      src={assets.usdt.logoUri}
                      alt={assets.usdt.code}
                      className="w-5 h-5 rounded-full"
                      onError={e => {
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/20';
                      }}
                    />
                    <span className="text-sm font-medium">{assets.usdt.code}</span>
                  </div>
                  <span className="text-sm font-medium">
                    {isBalanceLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      parseFloat(usdtBalance).toFixed(6)
                    )}
                  </span>
                </div>
              )}
              {assets.usdc && parseFloat(usdcBalance) > 0 && (
                <div className="flex justify-between items-center p-2 rounded bg-gray-500/5">
                  <div className="flex items-center gap-2">
                    <img
                      src={assets.usdc.logoUri}
                      alt={assets.usdc.code}
                      className="w-5 h-5 rounded-full"
                      onError={e => {
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/20';
                      }}
                    />
                    <span className="text-sm font-medium">{assets.usdc.code}</span>
                  </div>
                  <span className="text-sm font-medium">
                    {isBalanceLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      parseFloat(usdcBalance).toFixed(6)
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          {
            <>
              {/* Amount Input */}
              <div>
                <label
                  htmlFor="amount-input"
                  className="mb-2 text-sm font-medium text-primary flex items-center justify-between"
                >
                  <span>{getInputLabel()}</span>
                  <button
                    onClick={() =>
                      handleAmountChange({ target: { value: getCurrentBalance() } } as any)
                    }
                    className="text-xs text-blue-500 hover:text-blue-600"
                    type="button"
                  >
                    Max
                  </button>
                </label>
                <input
                  id="amount-input"
                  type="number"
                  value={amount}
                  onChange={handleAmountChange}
                  className="input w-full"
                  placeholder="0.00"
                  step="0.0001"
                  min="0"
                  disabled={isProcessing || currentStep === TRANSACTION_STEP.FETCHING_QUOTES}
                />
                <div className="mt-1 text-xs text-muted">
                  Available: {parseFloat(getCurrentBalance()).toFixed(6)} {getCurrentToken()}
                </div>
              </div>

              {/* Conversion Details */}
              <div className="card-bordered p-3 rounded-xl">
                <h3 className="text-sm font-semibold mb-3 text-primary">Conversion Details</h3>
                {renderQuoteDetails()}
              </div>
            </>
          }

          {hasInsufficientBalance && (
            <div className="text-center py-6 space-y-4">
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-warning-bg">
                  <Wallet className="h-8 w-8 text-warning" />
                </div>
              </div>
              <p className="text-muted">
                You don't have sufficient balance to perform this transaction.
              </p>
              <button onClick={handleDeposit} className="btn btn-primary w-full">
                Deposit Now
              </button>
            </div>
          )}

          {error && quoteDetails && (
            <div className="card bg-warning-bg text-warning p-3 text-sm rounded-lg">
              <div className="flex items-center">
                <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="card bg-success-bg text-success p-3 text-sm rounded-lg">
              {successMessage}
            </div>
          )}

          {/* Processing Status */}
          {isProcessing && (
            <div className="card-bordered p-4 rounded-xl">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-primary">{getButtonText()}</p>
                  <p className="text-xs text-muted mt-1">
                    Please confirm the transaction in your wallet and wait for confirmation.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={handleApprove}
            className="btn btn-primary w-full btn-lg"
            disabled={isButtonDisabled}
          >
            {isProcessing ? (
              <div className="flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                {getButtonText()}
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <Zap className="h-5 w-5 mr-2" />
                {getButtonText()}
              </div>
            )}
          </button>
        </>
      )}
    </div>
  );
};

export default AmountQuoteStep;
