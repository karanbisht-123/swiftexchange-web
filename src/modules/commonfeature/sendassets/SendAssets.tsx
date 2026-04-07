import { AlertCircle, Copy, Info, Loader2, ChevronRight } from 'lucide-react';
import React, { useCallback, useMemo } from 'react';

import PageLayout from '../../../components/layout/PageLayout';
import TransactionSuccess from '../../transction/component/TransactionSuccess';
import StellarActiveGuard from '../../walletconnect/components/StellarActiveGuard';
import { useSendAsset } from '../hook/useSendassets';
import { useAssetSelectorModal } from '../components/useAssetSelectorModal';

interface SendCryptoProps {
  onBack?: () => void;
}

const SendAssets: React.FC<SendCryptoProps> = ({ onBack }) => {
  const { openAssetSelector } = useAssetSelectorModal();
  const {
    recipientAddress,
    setRecipientAddress,
    amount,
    setAmount,
    memo,
    setMemo,
    balance,
    isFetchingBalance,
    transactionState,
    isEstimatingFees,
    estimatedFees,
    currentAsset,
    senderAddress,
    handleMaxClick,
    handleReviewTransaction,
    handleConfirmTransaction,
    handleBackToForm,
    handleRetryTransaction,
    copyToClipboard,
    formError,
  } = useSendAsset(onBack);

  const handleRecipientChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setRecipientAddress(e.target.value);
    },
    [setRecipientAddress]
  );

  const handleAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setAmount(e.target.value);
    },
    [setAmount]
  );

  const handleMemoChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setMemo(e.target.value);
    },
    [setMemo]
  );

  const handleCopySender = useCallback(() => {
    copyToClipboard(senderAddress || '', 'Sender address');
  }, [senderAddress, copyToClipboard]);

  const handleCopyRecipient = useCallback(() => {
    copyToClipboard(recipientAddress, 'Recipient address');
  }, [recipientAddress, copyToClipboard]);

  const handleCopyTxHash = useCallback(
    (hash: string) => {
      copyToClipboard(hash, 'Transaction hash');
    },
    [copyToClipboard]
  );

  const totalAmount = useMemo(() => {
    if (!amount || !currentAsset) return 0;
    return (
      parseFloat(amount) +
      (estimatedFees ? parseFloat(estimatedFees.totalCost) : currentAsset.baseFee)
    );
  }, [amount, estimatedFees, currentAsset]);

  const isFormValid = useMemo(() => {
    return (
      !formError &&
      senderAddress &&
      !isEstimatingFees &&
      amount &&
      parseFloat(amount) > 0 &&
      !isFetchingBalance
    );
  }, [formError, senderAddress, isEstimatingFees, amount, isFetchingBalance]);

  const explorerUrl = useMemo(() => {
    if (!currentAsset?.blockExplorerUrl || !transactionState.txHash) return '';
    return `${currentAsset.blockExplorerUrl}/tx/${transactionState.txHash}`;
  }, [currentAsset, transactionState.txHash]);

  const TransactionReview = useMemo(() => {
    if (!currentAsset || !recipientAddress || !amount) return null;

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
                  {senderAddress}
                </code>
                <button onClick={handleCopySender} className="btn-ghost p-2 flex-shrink-0">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary mb-2">To</label>
              <div className="flex items-center gap-2 bg-tertiary p-3 rounded-lg border border-color">
                <code className="text-xs font-mono text-primary break-all flex-1">
                  {recipientAddress}
                </code>
                <button onClick={handleCopyRecipient} className="btn-ghost p-2 flex-shrink-0">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-secondary mb-2">Amount</label>
              <div className="text-lg font-bold text-primary">
                {amount} {currentAsset.symbol}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary mb-2">Network</label>
              <div className="text-sm text-primary font-medium">{currentAsset.network}</div>
            </div>
          </div>

          {memo && currentAsset.type === 'stellar' && (
            <div>
              <label className="block text-sm font-medium text-secondary mb-2">Memo</label>
              <div className="text-sm text-primary bg-tertiary p-3 rounded-lg border border-color">
                {memo}
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
                  {estimatedFees?.totalCost || '0'} {currentAsset.symbol}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-tertiary rounded-lg p-4 border border-color">
            <div className="flex justify-between items-center">
              <span className="text-base font-semibold text-secondary">Total Cost</span>
              <span className="text-xl font-bold text-primary">
                {totalAmount.toFixed(currentAsset.decimals > 10 ? 8 : currentAsset.decimals)}{' '}
                {currentAsset.symbol}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={handleBackToForm} className="btn-secondary btn py-4 lg:py-5">
            Back to Edit
          </button>
          <button onClick={handleConfirmTransaction} className="btn-primary btn py-4 lg:py-5">
            Confirm & Send
          </button>
        </div>
      </div>
    );
  }, [
    currentAsset,
    recipientAddress,
    amount,
    senderAddress,
    memo,
    estimatedFees,
    totalAmount,
    handleCopySender,
    handleCopyRecipient,
    handleBackToForm,
    handleConfirmTransaction,
  ]);

  const TransactionStatusComponent = useMemo(() => {
    const { step, error, txHash } = transactionState;

    if (step === 'signing') {
      return (
        <div className="card text-center py-12 max-w-md mx-auto">
          <Loader2 className="w-16 h-16 animate-spin text-brand mb-6 mx-auto" />
          <h3 className="heading-3 mb-2">Signing Transaction</h3>
          <p className="text-secondary">Please approve the transaction in your wallet...</p>
        </div>
      );
    }

    if (step === 'success') {
      return (
        <TransactionSuccess
          txHash={txHash}
          explorerUrl={explorerUrl}
          assetType={currentAsset?.type}
          onCopyHash={handleCopyTxHash}
          onClose={onBack || handleBackToForm}
          onSendAnother={handleBackToForm}
        />
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
  }, [
    transactionState,
    explorerUrl,
    currentAsset,
    handleCopyTxHash,
    onBack,
    handleBackToForm,
    handleRetryTransaction,
  ]);

  const renderForm = () => {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
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
                      })} ${currentAsset.symbol}`
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleCopySender}
                className="btn-ghost p-2 flex-shrink-0"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <button 
          onClick={() => openAssetSelector('SEND')}
          className="card group hover:border-brand-primary active:scale-[0.98] transition-all text-left w-full p-0 overflow-hidden"
        >
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                {currentAsset?.logo ? (
                  <img src={currentAsset.logo} alt="" className="w-12 h-12 rounded-full shadow-sm" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-tertiary flex items-center justify-center text-sm font-bold text-secondary border border-color">
                    {currentAsset?.symbol.slice(0, 2)}
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <div className="font-bold text-lg text-primary">{currentAsset?.symbol}</div>
                  <ChevronRight size={16} className="text-muted group-hover:text-brand-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <div className="text-xs text-muted font-medium">{currentAsset?.network}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted mb-1 font-medium">Available Balance</div>
              <div className="font-bold text-primary">
                {isFetchingBalance ? (
                   <div className="h-5 w-24 bg-tertiary animate-pulse rounded ml-auto" />
                ) : (
                   `${balance.toLocaleString(undefined, { maximumFractionDigits: currentAsset?.decimals ?? 6 })} ${currentAsset?.symbol}`
                )}
              </div>
            </div>
          </div>
        </button>

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
            className={`input ${(formError && formError.includes('Recipient address')) ||
              (formError && formError.includes('Invalid recipient'))
              ? 'input-danger'
              : ''
              }`}
            placeholder={currentAsset?.type === 'stellar' ? 'G...' : '0x...'}
            value={recipientAddress}
            onChange={handleRecipientChange}
            required
          />
        </div>

        <div className="card">
          <label htmlFor="amount" className="block text-sm font-semibold text-primary mb-3">
            Amount
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              id="amount"
              className={`input pr-16 ${formError &&
                (formError.includes('balance') || formError.includes('Amount must'))
                ? 'input-danger'
                : ''
                }`}
              placeholder="0.0"
              value={amount}
              onChange={handleAmountChange}
              required
            />
            <button
              type="button"
              onClick={handleMaxClick}
              className="absolute right-2 top-1/2 -translate-y-1/2 btn-ghost btn-sm font-bold text-brand"
            >
              MAX
            </button>
          </div>
        </div>

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
              onChange={handleMemoChange}
            />
            <p className="text-xs text-muted mt-2">
              Some exchanges require a memo for deposits. Check with the recipient.
            </p>
          </div>
        )}

        {parseFloat(amount) > 0 && currentAsset && (
          <div className="card rounded-xl p-4">
            <div className="divide-y divide-dashed divide-gray-300 text-sm">
              <div className="flex justify-between items-center py-2">
                <span className="text-secondary">Amount</span>
                <span className="font-semibold text-primary">
                  {parseFloat(amount).toLocaleString(undefined, {
                    maximumFractionDigits: currentAsset.decimals > 10 ? 8 : currentAsset.decimals,
                  })}{' '}
                  {currentAsset.symbol}
                </span>
              </div>

              <div className="flex justify-between items-center py-2">
                <span className="text-secondary">Network Fee</span>
                <div className="flex items-center gap-2">
                  {isEstimatingFees ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <div className="text-right">
                      <span className="font-semibold text-primary">
                        {estimatedFees?.totalCost ||
                          currentAsset.baseFee.toFixed(
                            currentAsset.decimals > 10 ? 8 : currentAsset.decimals
                          )}{' '}
                        {currentAsset.symbol}
                      </span>
                      {estimatedFees?.isEstimated && (
                        <span className="block text-xs text-yellow-600">~Estimated</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {estimatedFees?.error && (
                <div className="col-span-2 mt-2">
                  <div className="text-xs text-yellow-600 bg-yellow-50 p-2 rounded border border-yellow-200">
                    {estimatedFees.error}
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center py-2">
                <span className="text-base font-bold text-primary">Total</span>
                <span className="text-lg font-bold text-primary">
                  {totalAmount.toLocaleString(undefined, {
                    maximumFractionDigits: currentAsset.decimals > 10 ? 8 : currentAsset.decimals,
                  })}{' '}
                  {currentAsset.symbol}
                </span>
              </div>
            </div>
          </div>
        )}

        {formError && (
          <div className="card bg-danger-bg border-2 border-red-300">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{formError}</p>
            </div>
          </div>
        )}

        {!formError && senderAddress && (
          <div className="card bg-info-bg border border-color">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
              <p className="text-sm text-primary">
                Transaction will be sent directly to your wallet for signing and broadcasting on the{' '}
                <span className="font-semibold">{currentAsset?.network}</span> network.
              </p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleReviewTransaction}
          disabled={!isFormValid}
          className={`w-full btn py-4 lg:py-5 ${isFormValid ? 'btn-primary' : 'btn-secondary'}`}
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

  const isStellar = currentAsset?.type === 'stellar';

  return (
    <PageLayout
      title="Send Assets"
      subtitle="Secure multi-chain asset transfer"
      onBack={transactionState.step === 'form' ? onBack : handleBackToForm}
      maxWidth="lg"
    >
      {isStellar ? (
        <StellarActiveGuard onSkip={onBack}>
          {(() => {
            switch (transactionState.step) {
              case 'form':
                return renderForm();
              case 'review':
                return TransactionReview;
              case 'signing':
              case 'success':
              case 'error':
                return TransactionStatusComponent;
              default:
                return renderForm();
            }
          })()}
        </StellarActiveGuard>
      ) : (
        (() => {
          switch (transactionState.step) {
            case 'form':
              return renderForm();
            case 'review':
              return TransactionReview;
            case 'signing':
            case 'success':
            case 'error':
              return TransactionStatusComponent;
            default:
              return renderForm();
          }
        })()
      )}
    </PageLayout>
  );
};

export default SendAssets;
