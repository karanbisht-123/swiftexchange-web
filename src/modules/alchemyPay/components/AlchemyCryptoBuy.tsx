import { AlertCircle, CheckCircle, Loader2, RefreshCw, X } from 'lucide-react';
import { useEffect } from 'react';
import Select from 'react-select';

import { useAlchemyBuy } from '../hook/useAlchemyBuy';

const AlchemyCryptoBuy = ({ onOrderStateChange }: { onOrderStateChange: (active: boolean) => void }) => {
  const {
    setOrderError,
    paymentTab,
    fiatAmount,
    setFiatAmount,
    selectedCryptoOption,
    setSelectedCryptoOption,
    selectedPaymentOption,
    setSelectedPaymentOption,
    cryptoAmount,
    isLoadingQuote,
    quoteError,
    isCreatingOrder,
    orderError,
    orderSuccess,
    quote,
    cryptoOptions,
    paymentOptions,
    handleCreateOrder,
    handleCloseTab,
    handleRetryQuote,
    resetForm,
    isFormValid,
    MIN_AMOUNT,
    SUCCESS_MESSAGES,
  } = useAlchemyBuy();

  useEffect(() => {
    onOrderStateChange(!!(paymentTab && !paymentTab.closed));
  }, [paymentTab, onOrderStateChange]);

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
        zIndex: 9999,
      }),
      menuList: (provided: any) => ({
        ...provided,
        maxHeight: '200px',
        overflowY: 'auto',
      }),
      menuPortal: (provided: any) => ({
        ...provided,
        zIndex: 9999,
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
            type="text"
            inputMode={
              selectedPaymentOption?.currency &&
              ['INR', 'JPY', 'KRW', 'IDR', 'VND', 'HUF'].includes(selectedPaymentOption.currency)
                ? 'numeric'
                : 'decimal'
            }
            value={fiatAmount}
            onChange={e => {
              const val = e.target.value;
              const currency = selectedPaymentOption?.currency;
              const isIntegerOnly =
                currency && ['INR', 'JPY', 'KRW', 'IDR', 'VND', 'HUF'].includes(currency);
              const regex = isIntegerOnly ? /^\d*$/ : /^\d*\.?\d*$/;
              if (val === '' || regex.test(val)) {
                setFiatAmount(val);
              }
            }}
            className={`input flex-1 ${quoteError ? 'input-danger' : ''}`}
            placeholder={`Enter amount (Min: ${
              selectedPaymentOption?.payMin || MIN_AMOUNT
            } ${selectedPaymentOption?.currency || ''})`}
          />
          <div className="w-full sm:w-1/3">
            <Select
              options={paymentOptions}
              value={selectedPaymentOption}
              onChange={selected => setSelectedPaymentOption(selected)}
              isSearchable
              styles={getSelectStyles()}
              menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
              classNamePrefix="select"
              placeholder="Select Currency"
              formatOptionLabel={(option: any) => (
                <div className="flex items-center gap-2">
                  {option.flag && (
                    <img
                      src={option.flag}
                      alt={option.countryName}
                      className="w-6 h-4 object-cover rounded-sm"
                      onError={e => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  <span>{option.label}</span>
                </div>
              )}
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
            value={isLoadingQuote ? 'Loading...' : cryptoAmount}
            readOnly
            className="input flex-1 bg-tertiary font-mono"
          />
          <div className="w-full sm:w-1/3">
            <Select
              options={cryptoOptions}
              value={selectedCryptoOption}
              onChange={selected => setSelectedCryptoOption(selected)}
              isSearchable
              styles={getSelectStyles()}
              menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
              classNamePrefix="select"
              placeholder="Select Asset"
              formatOptionLabel={(option: any) => (
                <div className="flex items-center gap-2">
                  {option.icon && (
                    <img
                      src={option.icon}
                      alt={option.crypto}
                      className="w-5 h-5 rounded-full"
                      onError={e => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  <span>{option.label}</span>
                </div>
              )}
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
        <div className="card   rounded-xl p-4">
          <h3 className="font-semibold text-primary text-sm mb-4">Price Breakdown</h3>

          <div className="divide-y divide-dashed divide-gray-300 text-sm">
            <div className="flex justify-between items-center py-2">
              <span className="text-secondary">Amount</span>
              <span className="font-semibold text-primary">
                {fiatAmount} {selectedPaymentOption?.currency}
              </span>
            </div>

            <div className="flex justify-between items-center py-2">
              <span className="text-secondary">Service Fee</span>
              <span className="text-danger font-medium">
                -{quote.rampFee} {selectedPaymentOption?.currency}
              </span>
            </div>

            <div className="flex justify-between items-center py-2">
              <span className="text-secondary">Network Fee</span>
              <span className="text-danger font-medium">
                -{quote.networkFee} {selectedPaymentOption?.currency}
              </span>
            </div>

            <div className="flex justify-between items-center py-2">
              <span className="text-secondary">Net Amount</span>
              <span className="text-success font-semibold">
                {(
                  parseFloat(fiatAmount) -
                  parseFloat(quote.rampFee) -
                  parseFloat(quote.networkFee)
                ).toFixed(2)}{' '}
                {selectedPaymentOption?.currency}
              </span>
            </div>

            <div className="flex justify-between items-center py-2">
              <span className="text-secondary">Rate: 1 {selectedCryptoOption?.crypto} =</span>
              <span className="font-medium text-primary">
                {quote.cryptoPrice} {selectedPaymentOption?.currency}
              </span>
            </div>

            <div className="flex justify-between items-center py-2">
              <span className="text-primary font-bold">You'll Receive</span>
              <span className="text-primary font-bold text-base">
                {quote.cryptoQuantity} {selectedCryptoOption?.crypto}
              </span>
            </div>

            <div className="flex justify-between items-center py-2 text-xs">
              <span className="text-muted">Total Fees</span>
              <span className="text-muted">
                {(parseFloat(quote.rampFee) + parseFloat(quote.networkFee)).toFixed(2)}{' '}
                {selectedPaymentOption?.currency} (
                {(
                  ((parseFloat(quote.rampFee) + parseFloat(quote.networkFee)) /
                    parseFloat(fiatAmount)) *
                  100
                ).toFixed(1)}
                %)
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
          <button onClick={handleCloseTab} className="btn-danger btn  w-full">
            Close Existing Tab
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-row gap-3">
        <button
          onClick={handleCreateOrder}
          disabled={!isFormValid() || !!(paymentTab && !paymentTab.closed)}
          className={`btn btn py-4 lg:py-5 flex-1 ${
            isFormValid() && !(paymentTab && !paymentTab.closed) ? 'btn-primary' : 'btn-secondary'
          }`}
        >
          {isCreatingOrder ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating Order...
            </div>
          ) : (
            'Continue to Payment'
          )}
        </button>
        {(fiatAmount || orderError || orderSuccess) && (
          <button onClick={resetForm} className="btn-secondary btn py-4 lg:py-5 sm:w-auto px-6">
            Reset
          </button>
        )}
      </div>
    </div>
  );
};

export default AlchemyCryptoBuy;
