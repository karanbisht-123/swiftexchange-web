import { AlertCircle, CheckCircle2, Copy, ExternalLink, Info, Loader2 } from 'lucide-react';
import React from 'react';

import PageLayout from '../../../components/layout/PageLayout';
// import type { EVMSendTransaction } from "../../../types/evm/evmTransaction.types";
// import { type StellarSendTransaction } from "../../steallr/types/stellarTransaction.types";
import { NETWORK_CONFIGS } from '../../../config';
import { useSendAsset } from '../hook/useSendassets';

interface SendCryptoProps {
  onBack?: () => void;
}

// interface TransactionState {
//   transaction: EVMSendTransaction | StellarSendTransaction | null;
//   signedTransaction: string | null;
//   txHash: string | null;
//   step: "form" | "review" | "signing" | "broadcasting" | "success" | "error";
//   error: string | null;
// }

const SendAssets: React.FC<SendCryptoProps> = ({ onBack }) => {
  const {
    recipientAddress,
    setRecipientAddress,
    amount,
    setAmount,
    memo,
    setMemo,
    selectedAssetValue,
    setSelectedAssetValue,
    balance,
    isFetchingBalance,
    transactionState,
    isEstimatingFees,
    estimatedFees,
    // notifications,
    // addNotification,
    // removeNotification,
    currentAsset,
    senderAddress,
    handleMaxClick,
    handleReviewTransaction,
    handleConfirmTransaction,
    handleBackToForm,
    handleRetryTransaction,
    copyToClipboard,
    formError,
    assets,
  } = useSendAsset(onBack);

  const renderTransactionReview = () => {
    const { transaction } = transactionState;
    if (!transaction || !currentAsset) return null;

    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <div className="card bg-info-bg border border-color">
          <div className="flex items-center gap-2 mb-2">
            <Info className="w-5 h-5 text-info" />
            <h3 className="font-semibold text-primary">Transaction Review</h3>
          </div>
          <p className="text-secondary text-sm">
            Please review all transaction details carefully before confirming.
          </p>
        </div>

        <div className="card space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-secondary mb-2">From</label>
              <div className="flex items-center gap-2 bg-tertiary p-3 rounded-lg border border-color">
                <code className="text-xs font-mono text-primary break-all flex-1">
                  {transaction.from}
                </code>
                <button
                  onClick={() => copyToClipboard(transaction.from, 'Sender address')}
                  className="btn-ghost p-2 flex-shrink-0"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary mb-2">To</label>
              <div className="flex items-center gap-2 bg-tertiary p-3 rounded-lg border border-color">
                <code className="text-xs font-mono text-primary break-all flex-1">
                  {transaction.to}
                </code>
                <button
                  onClick={() => copyToClipboard(transaction.to, 'Recipient address')}
                  className="btn-ghost p-2 flex-shrink-0"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-secondary mb-2">Amount</label>
              <div className="text-lg font-bold text-primary">
                {transaction.amount} {transaction.asset}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary mb-2">Network</label>
              <div className="text-sm text-primary font-medium">{transaction.network}</div>
            </div>
          </div>

          {transaction.memo && (
            <div>
              <label className="block text-sm font-medium text-secondary mb-2">Memo</label>
              <div className="text-sm text-primary bg-tertiary p-3 rounded-lg border border-color">
                {transaction.memo}
              </div>
            </div>
          )}

          <div className="divider"></div>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-secondary uppercase">Fee Details</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              {estimatedFees?.gasLimit && (
                <div>
                  <span className="text-muted block mb-1">Gas Limit</span>
                  <div className="font-semibold text-primary">
                    {parseInt(estimatedFees.gasLimit).toLocaleString()}
                  </div>
                </div>
              )}
              {estimatedFees?.maxFeePerGas ? (
                <>
                  <div>
                    <span className="text-muted block mb-1">Max Fee/Gas</span>
                    <div className="font-semibold text-primary">
                      {(parseInt(estimatedFees.maxFeePerGas) / 1e9).toFixed(2)} Gwei
                    </div>
                  </div>
                  <div>
                    <span className="text-muted block mb-1">Priority Fee</span>
                    <div className="font-semibold text-primary">
                      {(parseInt(estimatedFees.maxPriorityFeePerGas) / 1e9).toFixed(2)} Gwei
                    </div>
                  </div>
                </>
              ) : estimatedFees?.gasPrice ? (
                <div>
                  <span className="text-muted block mb-1">Gas Price</span>
                  <div className="font-semibold text-primary">
                    {(parseInt(estimatedFees.gasPrice) / 1e9).toFixed(2)} Gwei
                  </div>
                </div>
              ) : null}
              <div>
                <span className="text-muted block mb-1">Network Fee</span>
                <div className="font-semibold text-primary">
                  {estimatedFees?.totalCost || '0'} {currentAsset.value}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-tertiary rounded-lg p-4 border border-color">
            <div className="flex justify-between items-center">
              <span className="text-base font-semibold text-secondary">Total Cost</span>
              <span className="text-xl font-bold text-primary">
                {(
                  parseFloat(transaction.amount) +
                  (estimatedFees ? parseFloat(estimatedFees.totalCost) : 0)
                ).toFixed(currentAsset.decimals > 10 ? 8 : currentAsset.decimals)}{' '}
                {currentAsset.value}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={handleBackToForm} className="btn-secondary">
            Back to Edit
          </button>
          <button onClick={handleConfirmTransaction} className="btn-primary">
            Confirm & Send
          </button>
        </div>
      </div>
    );
  };

  const renderTransactionStatus = () => {
    const { step, error, txHash } = transactionState;

    if (step === 'signing') {
      return (
        <div className="card text-center py-12 max-w-md mx-auto">
          <Loader2 className="w-16 h-16 animate-spin text-brand mb-6 mx-auto" />
          <h3 className="heading-3 mb-2">Signing Transaction</h3>
          <p className="text-secondary">Securely signing transaction with your private key...</p>
        </div>
      );
    }

    if (step === 'broadcasting') {
      return (
        <div className="card text-center py-12 max-w-md mx-auto">
          <Loader2 className="w-16 h-16 animate-spin text-brand mb-6 mx-auto" />
          <h3 className="heading-3 mb-2">Broadcasting Transaction</h3>
          <p className="text-secondary">Submitting transaction to the blockchain network...</p>
        </div>
      );
    }

    if (step === 'success' && txHash) {
      const explorerUrl = currentAsset
        ? NETWORK_CONFIGS[currentAsset.networkKey as keyof typeof NETWORK_CONFIGS]?.explorerUrl
        : '';

      return (
        <div className="card text-center py-12 max-w-md mx-auto">
          <div className="w-16 h-16 bg-success-bg rounded-full flex items-center justify-center mb-6 mx-auto">
            <CheckCircle2 className="w-10 h-10 text-success" />
          </div>
          <h3 className="heading-3 mb-2 text-success">Transaction Successful!</h3>
          <p className="text-secondary mb-6">
            Your transaction has been broadcasted to the network.
          </p>

          <div className="card bg-success-bg border border-color mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-secondary">Transaction Hash</span>
              <button
                onClick={() => copyToClipboard(txHash, 'Transaction hash')}
                className="btn-ghost p-1"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <code className="text-xs font-mono text-primary break-all block">{txHash}</code>
          </div>

          <div className="space-y-3">
            {explorerUrl && (
              <a
                href={`${explorerUrl}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                View on Explorer
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button onClick={handleBackToForm} className="btn-secondary w-full">
              Send Another Transaction
            </button>
          </div>
        </div>
      );
    }

    if (step === 'error' && error) {
      return (
        <div className="card text-center py-12 max-w-md mx-auto">
          <div className="w-16 h-16 bg-danger-bg rounded-full flex items-center justify-center mb-6 mx-auto">
            <AlertCircle className="w-10 h-10 text-danger" />
          </div>
          <h3 className="heading-3 mb-2 text-danger">Transaction Failed</h3>
          <div className="card bg-danger-bg border-2 border-red-300 mb-6">
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleRetryTransaction} className="btn-primary">
              Try Again
            </button>
            <button onClick={handleBackToForm} className="btn-secondary">
              Back to Form
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderForm = () => {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        {/* Sender Address Display */}
        {senderAddress && (
          <div className="card bg-tertiary border border-color py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-medium text-secondary mb-1">From Wallet</label>
                <code className="text-xs font-mono text-primary break-all block">
                  {senderAddress}
                </code>
                {currentAsset && (
                  <div className="text-xs text-muted mt-1 flex items-center gap-1">
                    Balance:{' '}
                    {isFetchingBalance ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      `${balance.toLocaleString(undefined, {
                        maximumFractionDigits: currentAsset.decimals,
                      })} ${currentAsset.value}`
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(senderAddress, 'Sender address')}
                className="btn-ghost p-2 flex-shrink-0"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Recipient Address */}
        <div className="card">
          <label
            htmlFor="recipientAddress"
            className="block text-sm font-semibold text-primary mb-3"
          >
            Recipient Address
          </label>
          <input
            type="text"
            id="recipientAddress"
            className={`input ${
              (formError && formError.includes('Recipient address')) ||
              (formError && formError.includes('Invalid recipient'))
                ? 'input-danger'
                : ''
            }`}
            placeholder={currentAsset?.type === 'stellar' ? 'G...' : '0x...'}
            value={recipientAddress}
            onChange={e => setRecipientAddress(e.target.value)}
            required
          />
        </div>

        {/* Amount and Asset */}
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="amount" className="block text-sm font-semibold text-primary mb-3">
                Amount
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  id="amount"
                  className={`input pr-16 ${
                    formError &&
                    (formError.includes('balance') || formError.includes('Amount must'))
                      ? 'input-danger'
                      : ''
                  }`}
                  placeholder="0.0"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={handleMaxClick}
                  className="absolute right-2 top-1/2 -translate-y-1/2 btn-ghost btn-sm"
                >
                  MAX
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="asset" className="block text-sm font-semibold text-primary mb-3">
                Asset
              </label>
              <div className="relative">
                <select
                  id="asset"
                  className="input appearance-none pr-12"
                  value={selectedAssetValue}
                  onChange={e => setSelectedAssetValue(e.target.value)}
                >
                  {assets.map(assetOption => (
                    <option key={assetOption.value} value={assetOption.value}>
                      {assetOption.label}
                    </option>
                  ))}
                </select>
                {currentAsset && (
                  <div className="absolute right-10 top-1/2 -translate-y-1/2 pointer-events-none">
                    <img
                      src={currentAsset.logo}
                      alt={currentAsset.label}
                      className="w-6 h-6 rounded-full"
                      onError={e => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Memo field (Optional, only for Stellar) */}
        {currentAsset?.type === 'stellar' && (
          <div className="card">
            <label htmlFor="memo" className="block text-sm font-semibold text-primary mb-3">
              Memo/Tag{' '}
              <span className="text-xs text-muted font-normal">
                (Optional - Required for some exchanges)
              </span>
            </label>
            <input
              type="text"
              id="memo"
              className="input"
              placeholder="Enter memo/tag (optional)"
              value={memo}
              onChange={e => setMemo(e.target.value)}
            />
            <p className="text-xs text-muted mt-2">
              Some exchanges require a memo for deposits. Check with the recipient.
            </p>
          </div>
        )}

        {/* Fee Estimation */}
        {parseFloat(amount) > 0 && currentAsset && (
          <div className="card rounded-xl p-4">
            <div className="divide-y divide-dashed divide-gray-300 text-sm">
              {/* Amount */}
              <div className="flex justify-between items-center py-2">
                <span className="text-secondary">Amount</span>
                <span className="font-semibold text-primary">
                  {parseFloat(amount).toLocaleString(undefined, {
                    maximumFractionDigits: currentAsset.decimals > 10 ? 8 : currentAsset.decimals,
                  })}{' '}
                  {currentAsset.value}
                </span>
              </div>

              {/* Network Fee */}
              <div className="flex justify-between items-center py-2">
                <span className="text-secondary">Network Fee</span>
                <div className="flex items-center gap-2">
                  {isEstimatingFees ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span className="font-semibold text-primary">
                      {estimatedFees?.totalCost ||
                        currentAsset.baseFee.toFixed(
                          currentAsset.decimals > 10 ? 8 : currentAsset.decimals
                        )}{' '}
                      {currentAsset.value}
                    </span>
                  )}
                </div>
              </div>

              {/* Total */}
              <div className="flex justify-between items-center py-2">
                <span className="text-base font-bold text-primary">Total</span>
                <span className="text-lg font-bold text-primary">
                  {(
                    parseFloat(amount) +
                    (estimatedFees ? parseFloat(estimatedFees.totalCost) : currentAsset.baseFee)
                  ).toLocaleString(undefined, {
                    maximumFractionDigits: currentAsset.decimals > 10 ? 8 : currentAsset.decimals,
                  })}{' '}
                  {currentAsset.value}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {formError && (
          <div className="card bg-danger-bg border-2 border-red-300">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{formError}</p>
            </div>
          </div>
        )}

        {/* Info Message */}
        {!formError && senderAddress && (
          <div className="card bg-info-bg border border-color">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
              <p className="text-sm text-primary">
                Transaction will be signed locally and broadcast to the{' '}
                <span className="font-semibold">{currentAsset?.network}</span> network.
              </p>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="button"
          onClick={handleReviewTransaction}
          disabled={
            !!formError ||
            !senderAddress ||
            isEstimatingFees ||
            !amount ||
            parseFloat(amount) <= 0 ||
            isFetchingBalance
          }
          className={`w-full btn-lg ${
            !!formError ||
            !senderAddress ||
            isEstimatingFees ||
            !amount ||
            parseFloat(amount) <= 0 ||
            isFetchingBalance
              ? 'btn-secondary'
              : 'btn-primary'
          }`}
        >
          {isEstimatingFees ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Estimating Fees...
            </span>
          ) : (
            'Review Transaction'
          )}
        </button>
      </div>
    );
  };

  return (
    <PageLayout
      title="Send Assets"
      subtitle="Secure multi-chain asset transfer"
      onBack={transactionState.step === 'form' ? onBack : handleBackToForm}
      maxWidth="lg"
    >
      {(() => {
        switch (transactionState.step) {
          case 'form':
            return renderForm();
          case 'review':
            return renderTransactionReview();
          case 'signing':
          case 'broadcasting':
          case 'success':
          case 'error':
            return renderTransactionStatus();
          default:
            return renderForm();
        }
      })()}
    </PageLayout>
  );
};

export default SendAssets;
