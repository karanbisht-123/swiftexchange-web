import { AlertCircle, ArrowLeft, Info, Loader2 } from 'lucide-react';
import React from 'react';

import type {
  QuoteDetails,
  // BridgeQuoteDetails,
  // TransactionStep,
} from '../../../../types/evm/onTapPay.types';
import {
  // TRANSACTION_STEP_MESSAGES,
  TRANSACTION_STEP,
} from '../../constant/OnTapPay.constants';
import { useOneTapPay } from '../../hook/useOneTapPay';

const ASSETS = {
  sell: {
    code: 'WETH',
    name: 'Wrapped Ethereum',
    decimals: 18,
    address: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14',
    isNative: false,
    balance: 0,
    logoUri:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
  },
  buy: {
    code: 'USDT',
    name: 'USDT Coin',
    decimals: 6,
    address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
    isNative: false,
    balance: 0,
    logoUri:
      'https://tokens.pancakeswap.finance/images/0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d.png',
  },
} as const;

interface AmountQuoteStepProps {
  onComplete: (data: {
    amount: number;
    quoteDetails: QuoteDetails;
    transactionHash: string;
    bridgeTransactionHash?: string;
  }) => void;
  onBack: () => void;
}

const AmountQuoteStep: React.FC<AmountQuoteStepProps> = ({ onComplete, onBack }) => {
  const {
    amount,
    currentStep,
    quoteDetails,
    bridgeQuoteDetails,
    error,
    successMessage,
    balance,
    isBalanceLoading,
    handleAmountChange,
    handleApprove,
  } = useOneTapPay({ onComplete });

  const renderQuoteDetails = () => {
    if (currentStep === TRANSACTION_STEP.FETCHING_QUOTES) {
      return (
        <div className="flex justify-center items-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-success" />
          <p className="ml-2 text-muted">Loading quotes...</p>
        </div>
      );
    }

    if (error && !quoteDetails) {
      return <p className="text-center text-danger py-4">{error}</p>;
    }

    if (!quoteDetails) {
      return <p className="text-center text-muted py-4">Enter amount to get quote</p>;
    }

    // Access rawQuote for direct display of swap fields
    const rawSwapQuote = quoteDetails.rawQuote as any;
    const swapDetails = [
      { label: 'Provider', value: quoteDetails.provider },
      { label: 'Rate', value: quoteDetails.rate1 },
      { label: 'Price Impact', value: quoteDetails.slippage1 },
      { label: 'Minimum Received', value: quoteDetails.minReceived1 },
      ...(rawSwapQuote.outputAmount
        ? [
            {
              label: 'Expected Output',
              value: `${rawSwapQuote.outputAmount} ${rawSwapQuote.outputToken || ASSETS.buy.code}`,
            },
          ]
        : []),
    ];

    const bridgeDetails = bridgeQuoteDetails
      ? [
          { label: 'Bridge Provider', value: bridgeQuoteDetails.provider },
          { label: 'Conversion Rate', value: bridgeQuoteDetails.rate },
          {
            label: 'Bridge Slippage Tolerance',
            value: bridgeQuoteDetails.slippage,
          },
          {
            label: 'Bridge Minimum Received',
            value: bridgeQuoteDetails.minReceived,
          },
        ]
      : [];

    return (
      <div className="text-sm text-primary">
        <div className="card-flat p-2 border-b rounded-b-none rounded-lg border-color">
          {swapDetails.map(({ label, value }) => (
            <div key={label} className="flex justify-between py-1 border-dashed border-b">
              <span className="text-muted">{label}:</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}
        </div>
        {bridgeDetails.length > 0 && (
          <div className="card-flat p-2 rounded-t-none  rounded-lg">
            {bridgeDetails.map(({ label, value }) => (
              <div key={label} className="flex justify-between py-1 border-dashed border-b">
                <span className="text-muted">{label}:</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const isProcessing = [
    TRANSACTION_STEP.PREPARING_APPROVAL,
    TRANSACTION_STEP.SIGNING_APPROVAL,
    TRANSACTION_STEP.EXECUTING_APPROVAL,
    TRANSACTION_STEP.PREPARING_SWAP,
    TRANSACTION_STEP.SIGNING_SWAP,
    TRANSACTION_STEP.EXECUTING_SWAP,
    TRANSACTION_STEP.PREPARING_BRIDGE,
    TRANSACTION_STEP.EXECUTING_BRIDGE,
  ].includes(currentStep);

  const isButtonDisabled =
    currentStep === TRANSACTION_STEP.FETCHING_QUOTES ||
    isProcessing ||
    // !isValidAmount(amount) ||
    parseFloat(amount) > parseFloat(balance || '0') ||
    (!!error && !quoteDetails) ||
    !quoteDetails ||
    currentStep === TRANSACTION_STEP.COMPLETED;

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
        <h3 className="heading-3">Swap {ASSETS.sell.code} to USDC</h3>
      </div>

      <p className="text-secondary">
        Enter the amount of {ASSETS.sell.code} to swap and bridge to USDC.
      </p>

      <div>
        <label
          htmlFor="amount-input"
          className="mb-2 text-sm font-medium text-primary flex items-center"
        >
          Amount ({ASSETS.sell.code})
          <Info className="ml-1 h-4 w-4 text-muted" />
        </label>
        <input
          id="amount-input"
          type="number"
          value={amount}
          onChange={handleAmountChange}
          className="input w-full"
          placeholder="Enter amount"
          step="0.0001"
          min="0"
          disabled={isProcessing || currentStep === TRANSACTION_STEP.FETCHING_QUOTES}
        />
        <div className="mt-1 text-sm text-muted">
          {isBalanceLoading ? (
            <span>Loading balance...</span>
          ) : (
            <span>
              Balance: {balance !== null ? parseFloat(balance).toFixed(4) : '0'} {ASSETS.sell.code}
            </span>
          )}
        </div>
        {/* {amount && !isValidAmount(amount) && (
          <p className="mt-1 text-xs text-danger">
            Amount must be a positive number
          </p>
        )} */}
        {/* {isValidAmount(amount) &&
          parseFloat(amount) > parseFloat(balance || "0") && (
            <p className="mt-1 text-xs text-danger">Insufficient balance</p>
          )} */}
      </div>

      <div className="card-bordered p-2 rounded-xl">
        <h3 className="heading-5 pb-2">Quote Details</h3>
        {renderQuoteDetails()}
      </div>

      {error && quoteDetails && (
        <div className="card bg-warning-bg text-warning p-3 text-sm">
          <div className="flex items-center">
            <AlertCircle className="h-4 w-4 mr-2" />
            {error}
          </div>
        </div>
      )}

      {successMessage && (
        <div className="card bg-success-bg text-success p-3 text-sm">{successMessage}</div>
      )}

      <button
        onClick={handleApprove}
        className="btn btn-primary w-full btn-lg animate-pulse-once"
        disabled={isButtonDisabled}
      >
        {isProcessing ? (
          <div className="flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            {/* {TRANSACTION_STEP_MESSAGES[currentStep]} */}
          </div>
        ) : currentStep === TRANSACTION_STEP.COMPLETED ? (
          'Transaction Completed'
        ) : (
          'Approve & Swap'
        )}
      </button>
    </div>
  );
};

export default AmountQuoteStep;
