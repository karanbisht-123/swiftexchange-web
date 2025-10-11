import { AlertCircle, CheckCircle, Loader2, RefreshCw, X } from 'lucide-react';
import Select from 'react-select';

import { useAlchemySell } from '../hook/useAlchemySell';

const AlchemyCryptoSell = () => {
  const {
    cryptoAmount,
    setCryptoAmount,
    selectedCryptoOption,
    setSelectedCryptoOption,
    selectedPaymentOption,
    setSelectedPaymentOption,
    fiatAmount,
    quote,
    isLoadingQuote,
    quoteError,
    isCreatingOrder,
    orderError,
    orderSuccess,
    cryptoOptions,
    paymentOptions,
    handleCreateOrder,
    handleCloseTab,
    handleRetryQuote,
    resetForm,
    isFormValid,
    setOrderError,
    MIN_AMOUNT,
    SUCCESS_MESSAGES,
  } = useAlchemySell();

  // Get theme-aware styles for react-select
  const getSelectStyles = () => {
    const bgColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-bg-secondary')
      .trim();
    const textColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-text-primary')
      .trim();
    const borderColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-border')
      .trim();
    const hoverBg = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-bg-hover')
      .trim();
    const brandColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-brand-primary')
      .trim();

    return {
      control: (provided: any) => ({
        ...provided,
        borderRadius: '0.75rem',
        border: `1px solid ${borderColor}`,
        padding: '0.5rem',
        fontSize: '0.875rem',
        minHeight: '2.75rem',
        boxShadow: 'none',
        backgroundColor: bgColor,
        color: textColor,
        '&:hover': {
          borderColor: brandColor,
        },
      }),
      menu: (provided: any) => ({
        ...provided,
        borderRadius: '0.75rem',
        border: `1px solid ${borderColor}`,
        backgroundColor: bgColor,
        maxHeight: '200px',
        overflowY: 'auto',
      }),
      option: (provided: any, state: any) => ({
        ...provided,
        fontSize: '0.875rem',
        padding: '0.75rem 1rem',
        backgroundColor: state.isSelected ? brandColor : state.isFocused ? hoverBg : bgColor,
        color: state.isSelected ? '#ffffff' : textColor,
        cursor: 'pointer',
      }),
      singleValue: (provided: any) => ({
        ...provided,
        fontSize: '0.875rem',
        color: textColor,
      }),
      input: (provided: any) => ({
        ...provided,
        fontSize: '0.875rem',
        color: textColor,
      }),
      placeholder: (provided: any) => ({
        ...provided,
        fontSize: '0.875rem',
        color: getComputedStyle(document.documentElement)
          .getPropertyValue('--color-text-muted')
          .trim(),
      }),
    };
  };

  return (
    <div className="space-y-4">
      {/* Payment Provider */}
      <div className="card">
        <label className="block text-sm font-semibold text-primary mb-3">Payment Provider</label>
        <div className="bg-tertiary border border-color rounded-lg px-4 py-3">
          <span className="text-primary font-medium">Alchemy Pay</span>
          <span className="ml-2 text-xs text-muted">(Secure & Regulated)</span>
        </div>
      </div>

      {/* You Pay */}
      <div className="card">
        <label className="block text-sm font-semibold text-primary mb-3">You Pay</label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="number"
            value={cryptoAmount}
            onChange={e => setCryptoAmount(e.target.value)}
            onWheel={e => e.currentTarget.blur()}
            className={`input flex-1 ${quoteError ? 'input-danger' : ''}`}
            placeholder={`Enter amount (Min: ${
              selectedCryptoOption?.minSellAmount || MIN_AMOUNT
            } ${selectedCryptoOption?.crypto || ''})`}
            min={selectedCryptoOption?.minSellAmount || MIN_AMOUNT}
          />
          <div className="w-full sm:w-1/3">
            <Select
              options={cryptoOptions}
              value={selectedCryptoOption}
              onChange={selected => setSelectedCryptoOption(selected)}
              isSearchable
              styles={getSelectStyles()}
              classNamePrefix="select"
              placeholder="Select Asset"
            />
          </div>
        </div>
        {quoteError && (
          <div className="mt-3 card bg-danger-bg border-2 border-red-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{quoteError}</p>
              </div>
              <button
                onClick={handleRetryQuote}
                className="btn-ghost p-1 text-red-600 hover:text-red-700"
                title="Retry getting quote"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* You Get */}
      <div className="card">
        <label className="block text-sm font-semibold text-primary mb-3">You Get</label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={isLoadingQuote ? 'Loading...' : fiatAmount}
            readOnly
            className="input flex-1 bg-tertiary font-mono"
          />
          <div className="w-full sm:w-1/3">
            <Select
              options={paymentOptions}
              value={selectedPaymentOption}
              onChange={selected => setSelectedPaymentOption(selected)}
              isSearchable
              styles={getSelectStyles()}
              classNamePrefix="select"
              placeholder="Select Currency"
            />
          </div>
        </div>
      </div>

      {/* Loading Quote */}
      {isLoadingQuote && (
        <div className="card bg-info-bg border border-color">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-info" />
            <span className="text-primary text-sm">Getting best price...</span>
          </div>
        </div>
      )}

      {/* Price Breakdown */}
      {quote && !isLoadingQuote && (
        <div className="card border  rounded-xl p-4">
          <h3 className="font-semibold text-primary text-sm mb-4">Price Breakdown</h3>

          <div className="divide-y divide-dashed divide-gray-300 text-sm">
            <div className="flex justify-between items-center py-2">
              <span className="text-secondary">Amount</span>
              <span className="font-semibold text-primary">
                {cryptoAmount} {selectedCryptoOption?.crypto}
              </span>
            </div>

            <div className="flex justify-between items-center py-2">
              <span className="text-secondary">Exchange Rate</span>
              <span className="font-medium text-primary">
                1 {selectedCryptoOption?.crypto} = {quote.cryptoPrice}{' '}
                {selectedPaymentOption?.currency}
              </span>
            </div>

            <div className="flex justify-between items-center py-2">
              <span className="text-secondary">Service Fee</span>
              <span className="text-danger font-medium">
                -{quote.rampFee} {selectedPaymentOption?.currency}
              </span>
            </div>

            {quote.networkFee && parseFloat(quote.networkFee) > 0 && (
              <div className="flex justify-between items-center py-2">
                <span className="text-secondary">Network Fee</span>
                <span className="text-danger font-medium">
                  -{quote.networkFee} {selectedPaymentOption?.currency}
                </span>
              </div>
            )}

            <div className="flex justify-between items-center py-2">
              <span className="text-primary font-bold">You'll Receive</span>
              <span className="text-primary font-bold text-base">
                {quote.fiatQuantity || fiatAmount} {selectedPaymentOption?.currency}
              </span>
            </div>

            <div className="flex justify-between items-center py-2 text-xs">
              <span className="text-muted">Total Fees</span>
              <span className="text-muted">
                {(parseFloat(quote.rampFee) + parseFloat(quote.networkFee || '0')).toFixed(2)}{' '}
                {selectedPaymentOption?.currency}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Order Error */}
      {orderError && (
        <div className="card bg-danger-bg border-2 border-red-300">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-700 text-sm font-semibold">Order Failed</p>
              <p className="text-red-600 text-sm mt-1">{orderError}</p>
            </div>
            <button
              onClick={() => setOrderError('')}
              className="btn-ghost p-1 text-red-500 hover:text-red-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Order Success */}
      {orderSuccess && (
        <div className="card bg-success-bg border-2 border-green-300">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
            <div className="flex-1">
              <p className="text-green-700 text-sm font-semibold">
                {SUCCESS_MESSAGES.ORDER_CREATED}
              </p>
            </div>
          </div>
          <button onClick={handleCloseTab} className="btn-danger w-full">
            Close Existing Tab
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleCreateOrder}
          disabled={!isFormValid()}
          className={`btn-lg flex-1 ${isFormValid() ? 'btn-primary' : 'btn-secondary'}`}
        >
          {isCreatingOrder ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating Order...
            </div>
          ) : (
            'Continue to Sell'
          )}
        </button>
        {(cryptoAmount || orderError || orderSuccess) && (
          <button onClick={resetForm} className="btn-secondary sm:w-auto px-6">
            Reset
          </button>
        )}
      </div>
    </div>
  );
};

export default AlchemyCryptoSell;
