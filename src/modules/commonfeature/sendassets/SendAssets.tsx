import { AlertCircle, Copy, Info, Loader2, ChevronRight, Wallet } from 'lucide-react';
import React, { useCallback, useMemo, useRef } from 'react';

import PageLayout from '../../../components/layout/PageLayout';
import TransactionSuccess from '../../transction/component/TransactionSuccess';
import { EvmTransactionSuccessModal } from '../../evm/components/EvmTransactionSuccessModal';
import StellarActiveGuard from '../../walletconnect/components/StellarActiveGuard';
import { useSendAsset } from '../hook/useSendassets';
import { useAssetSelectorModal } from '../components/useAssetSelectorModal';
import { portfolioUtils } from '../../walletconnect/utils/portfolioUtils';
import TransactionButton from '../components/TransactionButton';
import { getChainLogoUrl } from '../../evm/utils/Chainregistry';

interface SendCryptoProps {
  onBack?: () => void;
}

const SendAssets: React.FC<SendCryptoProps> = ({ onBack }) => {
  const { openAssetSelector } = useAssetSelectorModal();
  const recipientRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

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
      const val = e.target.value;
      setRecipientAddress(val);
      if (currentAsset?.type === 'evm' && val.length === 42) {
        amountRef.current?.focus();
      } else if (currentAsset?.type === 'stellar' && val.length === 56) {
        amountRef.current?.focus();
      }
    },
    [setRecipientAddress, currentAsset]
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

  const currentChainLogo = useMemo(() => {
    if (!currentAsset) return null;
    const chainId = currentAsset.chainId;
    if (chainId === 'stellar' || chainId === 9000000) {
      return 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/stellar/info/logo.png';
    }
    return getChainLogoUrl(chainId as number);
  }, [currentAsset]);

  const TransactionReview = useMemo(() => {
    if (!currentAsset || !recipientAddress || !amount) return null;

    return (
      <div className="space-y-4 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-brand-primary/5 rounded-xl border border-brand-primary/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center">
              <Info className="w-5 h-5 text-brand-primary" />
            </div>
            <div>
              <h3 className="font-bold text-text-primary text-sm">Review Details</h3>
              <p className="text-text-secondary text-[11px] font-medium opacity-80">
                Confirm your transaction details before signing.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-bg-tertiary rounded-xl overflow-hidden">
          <div className="p-4 space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider font-bold text-text-muted">Route</span>
              </div>

              <div className="relative space-y-2">
                <div className="flex items-center gap-3 bg-bg-secondary/50 p-3 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-bg-primary flex items-center justify-center">
                    <Wallet size={14} className="text-text-muted" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-text-muted leading-none mb-1">From</div>
                    <div className="text-xs font-mono text-text-primary truncate">{senderAddress}</div>
                  </div>
                </div>

                <div className="absolute left-6 top-1/2 -translate-y-1/2 w-px h-4 bg-divider/10" />

                <div className="flex items-center gap-3 bg-bg-secondary/50 p-3 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-brand-primary/10 flex items-center justify-center">
                    <ChevronRight size={14} className="text-brand-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-text-muted leading-none mb-1">To</div>
                    <div className="text-xs font-mono text-text-primary truncate">{recipientAddress}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="bg-bg-secondary/50 p-3.5 rounded-lg">
                <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">Amount</label>
                <div className="text-lg font-black text-text-primary">
                  {amount} {currentAsset.symbol}
                </div>
              </div>

              <div className="bg-bg-secondary/50 p-3.5 rounded-lg">
                <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">Network</label>
                <div className="flex items-center gap-2">
                  {currentChainLogo && <img src={currentChainLogo} alt="" className="w-4 h-4 rounded-full" />}
                  <div className="text-sm text-text-primary font-bold">{currentAsset.network}</div>
                </div>
              </div>
            </div>

            {memo && currentAsset.type === 'stellar' && (
              <div className="bg-bg-secondary/50 p-3.5 rounded-lg">
                <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">Memo</label>
                <div className="text-sm text-text-primary font-medium break-all">{memo}</div>
              </div>
            )}

            <div className="pt-2">
              <div className="bg-bg-primary/50 rounded-xl p-4">
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-text-secondary font-medium">Estimated Fee</span>
                    <span className="font-bold text-text-primary">{estimatedFees?.totalCost || currentAsset.baseFee} {currentAsset.symbol}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-text-primary">Total Cost</span>
                  <span className="text-xl font-black text-brand-primary">
                    {totalAmount.toFixed(currentAsset.decimals > 10 ? 8 : currentAsset.decimals)}{' '}
                    {currentAsset.symbol}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={handleBackToForm} className="btn-secondary btn py-4 rounded-xl font-bold">
            Edit
          </button>
          <TransactionButton
            label="Send Now"
            onClick={handleConfirmTransaction}
            className="font-black"
          />
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
    currentChainLogo,
    handleBackToForm,
    handleConfirmTransaction,
  ]);

  const TransactionStatusComponent = useMemo(() => {
    const { step, error, txHash } = transactionState;

    if (step === 'signing') {
      return (
        <div className="bg-bg-secondary border border-divider rounded-xl text-center py-12 px-6 max-w-sm mx-auto shadow-sm">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <Loader2 className="w-20 h-20 animate-spin text-brand-primary opacity-20" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Wallet size={32} className="text-brand-primary" />
            </div>
          </div>
          <h3 className="text-xl font-black text-text-primary mb-2">Check Wallet</h3>
          <p className="text-sm text-text-secondary font-medium px-4">Confirm the transaction signature in your wallet extensions.</p>
        </div>
      );
    }

    if (step === 'success') {
      if (currentAsset?.type === 'evm') {
        return (
          <EvmTransactionSuccessModal
            txHash={txHash || ''}
            explorerUrl={explorerUrl}
            onDone={onBack || handleBackToForm}
            networkName={currentAsset.network}
          />
        );
      }
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
        <div className="bg-bg-secondary border border-divider rounded-xl text-center py-12 px-6 max-w-sm mx-auto shadow-sm">
          <div className="w-16 h-16 bg-danger/10 rounded-full flex items-center justify-center mb-6 mx-auto">
            <AlertCircle className="w-8 h-8 text-danger" />
          </div>
          <h3 className="text-xl font-black text-text-primary mb-2">Transaction Error</h3>
          <div className="bg-danger/5 border border-danger/10 rounded-lg p-3 mb-6">
            <p className="text-xs text-danger font-bold leading-relaxed">{error}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleRetryTransaction} className="btn-primary py-3 rounded-lg font-bold text-sm">
              Retry
            </button>
            <button onClick={handleBackToForm} className="btn-secondary py-3 rounded-lg font-bold text-sm">
              Back
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
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {senderAddress && (
          <div className="bg-bg-tertiary rounded-xl p-4 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center border border-divider/50">
                  <Wallet size={18} className="text-text-muted" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-0.5">Active Account</div>
                  <div className="flex items-center gap-1.5">
                    <code className="text-xs font-mono text-text-primary opacity-80">{senderAddress.slice(0, 6)}...{senderAddress.slice(-4)}</code>
                    <button onClick={handleCopySender} className="text-text-muted hover:text-brand-primary transition-colors">
                      <Copy size={12} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-0.5">Available</div>
                <div className="text-xs font-black text-text-primary">
                  {isFetchingBalance ? (
                    <Loader2 size={12} className="animate-spin ml-auto opacity-30" />
                  ) : (
                    `${portfolioUtils.formatBalance(balance)} ${currentAsset?.symbol || ""}`
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider px-1">Select Asset & Network</label>
          <button
            onClick={() => openAssetSelector('SEND')}
            className="group relative w-full bg-bg-tertiary hover:bg-bg-hover rounded-xl p-4 transition-all active:scale-[0.99] text-left"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative">
                  {currentAsset?.logo ? (
                    <img src={currentAsset.logo} alt="" className="w-12 h-12 rounded-full shadow-md border-2 border-bg-secondary" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-bg-tertiary flex items-center justify-center text-sm font-bold text-text-secondary border border-divider">
                      {currentAsset?.symbol.slice(0, 2)}
                    </div>
                  )}
                  {currentChainLogo && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow-lg border border-divider overflow-hidden">
                      <img src={currentChainLogo} alt="" className="w-full h-full object-contain" />
                    </div>
                  )}
                </div>
                <div>
                  <div className="font-black text-lg text-text-primary leading-none mb-1">{currentAsset?.symbol || "Select Asset"}</div>
                  <div className="text-[10px] text-brand-primary font-black uppercase tracking-widest bg-brand-primary/10 px-1.5 py-0.5 rounded-md inline-block">
                    {currentAsset?.network || "All"}
                  </div>
                </div>
              </div>
              <ChevronRight size={18} className="text-text-muted group-hover:text-brand-primary transition-transform group-hover:translate-x-0.5" />
            </div>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div className="group relative bg-bg-tertiary hover:bg-bg-tertiary/80 rounded-xl transition-all overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary scale-y-0 group-focus-within:scale-y-100 transition-transform origin-top duration-300" />
            <div className="p-4">
              <label htmlFor="recipientAddress" className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
                Recipient Address
              </label>
              <input
                ref={recipientRef}
                type="text"
                id="recipientAddress"
                className={`w-full bg-bg-primary/40 border-none focus:ring-0 rounded-lg px-3 py-4 text-xs font-mono transition-all placeholder:text-text-muted ${(formError && formError.includes('address')) ? 'text-danger' : ''
                  }`}
                placeholder={currentAsset?.type === 'stellar' ? 'Stellar Address (G...)' : 'EVM Address (0x...)'}
                value={recipientAddress}
                onChange={handleRecipientChange}
                autoFocus
              />
            </div>
          </div>

          <div className="group relative bg-bg-tertiary hover:bg-bg-tertiary/80 rounded-xl transition-all overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary scale-y-0 group-focus-within:scale-y-100 transition-transform origin-top duration-300" />
            <div className="p-4">
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="amount" className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  Amount
                </label>
                <button
                  type="button"
                  onClick={handleMaxClick}
                  className="text-[10px] font-black text-brand-primary uppercase hover:opacity-70 transition-opacity"
                >
                  Use Max
                </button>
              </div>
              <div className="relative">
                <input
                  ref={amountRef}
                  type="text"
                  inputMode="decimal"
                  id="amount"
                  className={`w-full bg-bg-primary/40 border-none focus:ring-0 rounded-lg pl-3 pr-16 py-4 text-lg font-black transition-all placeholder:text-text-muted ${formError && (formError.includes('balance') || formError.includes('Amount')) ? 'text-danger' : ''
                    }`}
                  placeholder="0.00"
                  value={amount}
                  onChange={handleAmountChange}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-text-muted">
                  {currentAsset?.symbol}
                </div>
              </div>
            </div>
          </div>
        </div>

        {currentAsset?.type === 'stellar' && (
          <div className="bg-bg-tertiary rounded-xl p-4 transition-all">
            <label htmlFor="memo" className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
              Memo <span className="text-[8px] font-normal lowercase">(Optional)</span>
            </label>
            <input
              type="text"
              id="memo"
              className="w-full bg-bg-primary/40 border-none focus:ring-0 rounded-lg px-3 py-3 text-xs font-medium transition-all"
              placeholder="Tag for exchanges"
              value={memo}
              onChange={handleMemoChange}
            />
          </div>
        )}

        {parseFloat(amount) > 0 && currentAsset && (
          <div className="bg-bg-tertiary rounded-xl p-4 border border-divider/60">
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-secondary font-medium">Estimated Fee</span>
                <div className="flex items-center gap-1.5 font-bold text-text-primary">
                  {isEstimatingFees ? <Loader2 size={10} className="animate-spin opacity-50" /> : `${estimatedFees?.totalCost || currentAsset.baseFee} ${currentAsset.symbol}`}
                </div>
              </div>
              <div className="h-px bg-divider/10" />
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-text-primary">Total to Send</span>
                <span className="text-lg font-black text-brand-primary">
                  {portfolioUtils.formatBalance(totalAmount)} {currentAsset.symbol}
                </span>
              </div>
            </div>
          </div>
        )}

        {formError && (
          <div className="bg-danger/5 border border-danger/10 rounded-xl p-3.5 flex gap-3 items-center">
            <AlertCircle size={14} className="text-danger shrink-0" />
            <p className="text-[11px] font-bold text-danger leading-tight">{formError}</p>
          </div>
        )}

        <TransactionButton
          label="Continue to Review"
          loadingLabel="Calculating Fees..."
          isLoading={isEstimatingFees}
          isDisabled={!isFormValid}
          onClick={handleReviewTransaction}
          className="mt-2"
        />
      </div>
    );
  };

  const isStellar = currentAsset?.type === 'stellar';

  return (
    <PageLayout
      title="Send Assets"
      subtitle="Fast & secure global transfers"
      onBack={transactionState.step === 'form' ? onBack : handleBackToForm}
      maxWidth="lg"
      hasFooter={false}
    >
      <div className="w-full mx-auto">
        {isStellar ? (
          <StellarActiveGuard onSkip={onBack}>
            {(() => {
              switch (transactionState.step) {
                case 'form': return renderForm();
                case 'review': return TransactionReview;
                default: return TransactionStatusComponent;
              }
            })()}
          </StellarActiveGuard>
        ) : (
          (() => {
            switch (transactionState.step) {
              case 'form': return renderForm();
              case 'review': return TransactionReview;
              default: return TransactionStatusComponent;
            }
          })()
        )}
      </div>
    </PageLayout>
  );
};

export default SendAssets;

