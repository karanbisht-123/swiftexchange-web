import { AlertCircle, Copy, Info, Loader2, ChevronRight, Wallet, RefreshCw } from 'lucide-react';
import React, { useCallback, useMemo, useRef } from 'react';
import PageLayout from '../../../components/layout/PageLayout';
import { EvmTransactionSuccessModal } from '../../evm/components/EvmTransactionSuccessModal';
import StellarTransactionModal from '../../steallr/components/modals/StellarTransactionModal';
import StellarActiveGuard from '../../walletconnect/components/StellarActiveGuard';
import { EvmActionGuard } from '../../evm/components/EvmActionGuard';
import { useSendAsset } from '../hook/useSendassets';
import { useAssetSelectorModal } from '../components/useAssetSelectorModal';
import { portfolioUtils } from '../../walletconnect/utils/portfolioUtils';
import TransactionButton from '../components/TransactionButton';
import { getChainLogoUrl } from '../../evm/utils/Chainregistry';
import BigNumber from 'bignumber.js';

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
    handleRefreshBalances,
    handleReviewTransaction,
    handleConfirmTransaction,
    handleBackToForm,
    handleRetryTransaction,
    copyToClipboard,
    formError,
    buttonLabel,
    needsTrustline,
    recipientNeedsTrustline,
    isFetchingRecipientTrust
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
    if (!amount || !currentAsset) return new BigNumber(0);
    const bnAmount = new BigNumber(amount);
    const fee = estimatedFees?.totalCost ? new BigNumber(estimatedFees.totalCost) : new BigNumber(currentAsset.baseFee);
    if (currentAsset.isNative) {
      return bnAmount.plus(fee);
    }
    return bnAmount;
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
      <div className="space-y-4 max-w-2xl mx-auto">
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

            {recipientNeedsTrustline && currentAsset.type === 'stellar' && (
              <div className="bg-brand-primary/5 border border-brand-primary/20 rounded-xl p-3.5 flex gap-3 items-center">
                <div className="w-8 h-8 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0">
                  <Info size={14} className="text-brand-primary" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-brand-primary leading-tight">Claimable Balance</p>
                  <p className="text-[9px] text-text-secondary font-medium opacity-80 leading-tight mt-0.5">
                    Recipient lacks trustline. Asset will be sent as a claimable balance.
                  </p>
                </div>
              </div>
            )}

            {needsTrustline && currentAsset.type === 'stellar' && (
              <div className="bg-brand-primary/5 border border-brand-primary/20 rounded-xl p-3.5 flex gap-3 items-center">
                <div className="w-8 h-8 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0">
                  <RefreshCw size={14} className="text-brand-primary" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-brand-primary leading-tight">Add Trustline</p>
                  <p className="text-[9px] text-text-secondary font-medium opacity-80 leading-tight mt-0.5">
                    Your account will first add a trustline for {currentAsset.symbol} in this transaction.
                  </p>
                </div>
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
                  <span className="text-sm font-bold text-text-primary">Total {currentAsset.isNative ? 'Cost' : 'to Send'}</span>
                  <span className="text-xl font-black text-brand-primary">
                    {totalAmount.toFixed(currentAsset.decimals > 10 ? 8 : currentAsset.decimals).replace(/(\.[0-9]*[1-9])0+$/, "$1").replace(/\.0+$/, "")}{' '}
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
            label={buttonLabel}
            onClick={() => {
              console.log('[SendAssets] Confirming transaction button clicked');
              handleConfirmTransaction();
            }}
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
        <StellarTransactionModal
          isOpen={true}
          status="success"
          type="Send"
          hash={txHash || ''}
          onClose={onBack || handleBackToForm}
        />
      );
    }

    if (step === 'error' && error) {
      if (currentAsset?.type === 'stellar') {
        return (
          <StellarTransactionModal
            isOpen={true}
            status="error"
            type="Send"
            error={error}
            onClose={handleBackToForm}
          />
        );
      }
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
            <button
              onClick={handleRetryTransaction}
              className="btn-primary py-3 rounded-lg font-bold text-sm"
            >
              Retry
            </button>
            <button
              onClick={handleBackToForm}
              className="btn-secondary py-3 rounded-lg font-bold text-sm"
            >
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
      <div className="space-y-4">

        {/* Active Account */}
        {senderAddress && (
          <div className="bg-bg-tertiary rounded-xl p-4">
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
                <div className="flex items-center justify-end gap-1.5 mb-1">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider leading-none mt-0.5">Available</span>
                  <button
                    onClick={handleRefreshBalances}
                    disabled={isFetchingBalance}
                    className={`p-0.5 hover:bg-white/5 rounded-full transition-all text-text-muted hover:text-brand-primary ${isFetchingBalance ? 'animate-spin text-brand-primary' : ''}`}
                  >
                    <RefreshCw size={10} />
                  </button>
                </div>
                <div className="text-xs font-black text-text-primary">
                  {isFetchingBalance ? (
                    <span className="inline-block w-14 h-3.5 bg-brand-primary/30 animate-pulse rounded-full align-middle" />
                  ) : (
                    `${portfolioUtils.formatBalance(balance)} ${currentAsset?.symbol || ""}`
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Asset Selector */}
        <div className="space-y-2">
          <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider px-1">Select Asset & Network</label>
          <button
            onClick={() => openAssetSelector('SEND')}
            className="group relative w-full bg-bg-tertiary hover:bg-bg-hover rounded-xl p-4 transition-colors active:scale-[0.99] text-left"
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
              <ChevronRight size={18} className="text-text-muted group-hover:text-brand-primary transition-colors" />
            </div>
          </button>
        </div>

        {/* Input Fields */}
        <div className="grid grid-cols-1 gap-3">

          {/* Recipient Address */}
          <div className="group relative bg-bg-tertiary rounded-xl overflow-hidden">
            {/* vertical focus indicator */}
            <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl bg-brand-primary opacity-0 group-focus-within:opacity-100 transition-opacity" />
            <div className="p-4">
              <label htmlFor="recipientAddress" className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
                Recipient Address
              </label>
              <div className="bg-bg-secondary rounded-lg px-3 h-14 flex items-center">
                <input
                  ref={recipientRef}
                  type="text"
                  id="recipientAddress"
                  className={`w-full bg-transparent border-none focus:ring-0 outline-none text-xs font-mono placeholder:text-text-muted ${formError && formError.includes('address') ? 'text-danger' : 'text-text-primary'
                    }`}
                  placeholder={currentAsset?.type === 'stellar' ? 'Stellar Address (G...)' : 'EVM Address (0x...)'}
                  value={recipientAddress}
                  onChange={handleRecipientChange}
                  autoFocus
                />
              </div>
            </div>
          </div>

          {/* Amount */}
          <div className="group relative bg-bg-tertiary rounded-xl overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl bg-brand-primary opacity-0 group-focus-within:opacity-100 transition-opacity" />
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
              <div className="bg-bg-secondary rounded-lg px-3 h-14 flex items-center">
                <input
                  ref={amountRef}
                  type="text"
                  inputMode="decimal"
                  id="amount"
                  className={`flex-1 bg-transparent border-none focus:ring-0 outline-none text-lg font-black placeholder:text-text-muted ${formError && (formError.includes('balance') || formError.includes('Amount')) ? 'text-danger' : 'text-text-primary'
                    }`}
                  placeholder="0.00"
                  value={amount}
                  onChange={handleAmountChange}
                />
                <span className="text-xs font-bold text-text-muted ml-2 shrink-0">{currentAsset?.symbol}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Memo (Stellar only) */}
        {currentAsset?.type === 'stellar' && (
          <div className="group relative bg-bg-tertiary rounded-xl overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl bg-brand-primary opacity-0 group-focus-within:opacity-100 transition-opacity" />
            <div className="p-4">
              <label htmlFor="memo" className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
                Memo <span className="text-[8px] font-normal lowercase">(Optional)</span>
              </label>
              <div className="bg-bg-secondary rounded-lg px-3 h-14 flex items-center">
                <input
                  type="text"
                  id="memo"
                  className="w-full bg-transparent border-none focus:ring-0 outline-none text-xs font-medium text-text-primary placeholder:text-text-muted"
                  placeholder="Tag for exchanges"
                  value={memo}
                  onChange={handleMemoChange}
                />
              </div>
            </div>
          </div>
        )}

        {/* Fee summary */}
        {parseFloat(amount) > 0 && currentAsset && (
          <div className="bg-bg-tertiary rounded-xl p-4 border border-divider/60">
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-secondary font-medium">Estimated Fee</span>
                <div className="flex items-center gap-1.5 font-bold text-text-primary">
                  {isEstimatingFees
                    ? <Loader2 size={10} className="animate-spin opacity-50" />
                    : `${estimatedFees?.totalCost || currentAsset.baseFee} ${currentAsset.symbol}`}
                </div>
              </div>
              <div className="h-px bg-divider/10" />
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-text-primary">Total to Send</span>
                <span className="text-lg font-black text-brand-primary">
                  {totalAmount.toFixed(currentAsset.decimals > 10 ? 8 : currentAsset.decimals).replace(/(\.[0-9]*[1-9])0+$/, "$1").replace(/\.0+$/, "")} {currentAsset.symbol}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {formError && (
          <div className="bg-danger/5 border border-danger/10 rounded-xl p-3.5 flex gap-3 items-center">
            <AlertCircle size={14} className="text-danger shrink-0" />
            <p className="text-[11px] font-bold text-danger leading-tight">{formError}</p>
          </div>
        )}

        <TransactionButton
          label={buttonLabel}
          loadingLabel={isFetchingRecipientTrust ? "Checking Recipient..." : "Calculating Fees..."}
          isLoading={isEstimatingFees || isFetchingRecipientTrust}
          isDisabled={!isFormValid && !needsTrustline}
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
          <EvmActionGuard>
            <>{(() => {
              switch (transactionState.step) {
                case 'form': return renderForm();
                case 'review': return TransactionReview;
                default: return TransactionStatusComponent;
              }
            })()}</>
          </EvmActionGuard>
        )}
      </div>
    </PageLayout>
  );
};

export default SendAssets;