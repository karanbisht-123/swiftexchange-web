import { useEffect, useState } from 'react';

import cryptoSupportData from '../../../data/alchemy/AlchemyCryptoSupprort.json';
import fiatSupportData from '../../../data/alchemy/AlchemyFiatSellSupprort.json';
import { useWalletStore } from '../../wallet/store.ts/walletStore';
import { ERROR_MESSAGES, MIN_AMOUNT_BUY, SUCCESS_MESSAGES } from '../constants/alchemyConstants';
import { createAlchemyBuyOrder, validateBuyOrderRequest } from '../service/alchemyBuyService';
import { fetchAlchemyQuote, validateQuoteRequest } from '../service/alchemyQuoteService';
import {
  type AlchemyBuyOrderRequest,
  type AlchemyQuoteRequest,
  ORDER_TYPES,
} from '../types/alchemyTypes';

type CryptoOption = {
  value: string;
  label: string;
  crypto: string;
  network: string;
  minPurchaseAmount: number;
  maxPurchaseAmount: number;
};

type PaymentOption = {
  value: string;
  label: string;
  currency: string;
  payWayCode: string;
  country: string;
  payMin: number;
  payMax: number;
};

const cryptoOptions: CryptoOption[] = cryptoSupportData
  .filter(crypto => crypto.buyEnable === 1)
  .map(crypto => ({
    value: `${crypto.crypto}-${crypto.network}`,
    label: `${crypto.crypto} (${crypto.network})`,
    crypto: crypto.crypto,
    network: crypto.network,
    minPurchaseAmount: crypto.minPurchaseAmount,
    maxPurchaseAmount: crypto.maxPurchaseAmount,
  }));

const paymentOptions: PaymentOption[] = fiatSupportData.map(fiat => ({
  value: `${fiat.currency}-${fiat.payWayCode}-${fiat.country}`,
  label: `${fiat.countryName} (${fiat.payWayName})`,
  currency: fiat.currency,
  payWayCode: fiat.payWayCode,
  country: fiat.country,
  payMin: fiat.payMin,
  payMax: fiat.payMax,
}));

export const useAlchemyBuy = () => {
  const [fiatAmount, setFiatAmount] = useState('');
  const [selectedCryptoOption, setSelectedCryptoOption] = useState<CryptoOption | null>(
    cryptoOptions[0] || null
  );
  const [selectedPaymentOption, setSelectedPaymentOption] = useState<PaymentOption | null>(
    paymentOptions[0] || null
  );
  const [cryptoAmount, setCryptoAmount] = useState('0.0');
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState('');
  const [quote, setQuote] = useState<any | null>(null);
  const [paymentTab, setPaymentTab] = useState<Window | null>(null);

  const walletAddresses = useWalletStore(state => state.walletAddresses);
  const evmAddress = walletAddresses[0] || '0x1f2fee51c15f6be9ff65833516358e6a55736092';

  useEffect(() => {
    const fetchQuote = async () => {
      setQuoteError('');
      setOrderError('');
      setOrderSuccess(false);
      setPaymentUrl('');

      const amount = parseFloat(fiatAmount);
      if (!fiatAmount || amount <= 0) {
        setCryptoAmount('0.0');
        setQuote(null);
        if (fiatAmount) {
          setQuoteError(
            ERROR_MESSAGES.MIN_AMOUNT(
              selectedPaymentOption?.payMin || MIN_AMOUNT_BUY,
              selectedPaymentOption?.currency || ''
            )
          );
        }
        return;
      }

      if (!selectedCryptoOption) {
        setQuoteError(ERROR_MESSAGES.NO_CRYPTO_SELECTED);
        setCryptoAmount('0.0');
        setQuote(null);
        return;
      }

      if (!selectedPaymentOption) {
        setQuoteError(ERROR_MESSAGES.NO_PAYMENT_SELECTED);
        setCryptoAmount('0.0');
        setQuote(null);
        return;
      }

      if (amount < selectedPaymentOption.payMin) {
        setCryptoAmount('0.0');
        setQuote(null);
        setQuoteError(
          ERROR_MESSAGES.MIN_AMOUNT(selectedPaymentOption.payMin, selectedPaymentOption.currency)
        );
        return;
      }
      if (amount > selectedPaymentOption.payMax) {
        setCryptoAmount('0.0');
        setQuote(null);
        setQuoteError(
          ERROR_MESSAGES.MAX_AMOUNT(selectedPaymentOption.payMax, selectedPaymentOption.currency)
        );
        return;
      }

      if (amount < selectedCryptoOption.minPurchaseAmount) {
        setCryptoAmount('0.0');
        setQuote(null);
        setQuoteError(
          ERROR_MESSAGES.MIN_AMOUNT(
            selectedCryptoOption.minPurchaseAmount,
            selectedPaymentOption.currency
          )
        );
        return;
      }
      if (amount > selectedCryptoOption.maxPurchaseAmount) {
        setCryptoAmount('0.0');
        setQuote(null);
        setQuoteError(
          ERROR_MESSAGES.MAX_AMOUNT(
            selectedCryptoOption.maxPurchaseAmount,
            selectedPaymentOption.currency
          )
        );
        return;
      }

      const quoteRequest: AlchemyQuoteRequest = {
        crypto: selectedCryptoOption.crypto,
        network: selectedCryptoOption.network,
        fiat: selectedPaymentOption.currency,
        amount: fiatAmount,
        side: 'BUY',
      };

      const validation = validateQuoteRequest(quoteRequest);
      if (!validation.isValid) {
        setQuoteError(validation.errors[0]);
        setCryptoAmount('0.0');
        setQuote(null);
        return;
      }

      setIsLoadingQuote(true);
      setQuote(null);
      setCryptoAmount('0.0');

      try {
        const response = await fetchAlchemyQuote(quoteRequest);
        if (!response.success || !response.data) {
          throw new Error(ERROR_MESSAGES.NO_QUOTE_DATA);
        }

        const quoteData = JSON.parse(response.data);
        if (!quoteData.success || !quoteData.data) {
          throw new Error(ERROR_MESSAGES.INVALID_QUOTE);
        }

        setQuote(quoteData.data);
        setCryptoAmount(quoteData.data.cryptoQuantity);
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : ERROR_MESSAGES.QUOTE_FAILED;
        setQuoteError(errorMessage);
        setCryptoAmount('0.0');
        setQuote(null);
      } finally {
        setIsLoadingQuote(false);
      }
    };

    const debounceTimer = setTimeout(fetchQuote, 500);
    return () => clearTimeout(debounceTimer);
  }, [fiatAmount, selectedCryptoOption, selectedPaymentOption]);

  const handleCreateOrder = async () => {
    if (paymentTab && !paymentTab.closed) {
      setOrderError(ERROR_MESSAGES.EXISTING_TAB);
      return;
    }

    const amount = parseFloat(fiatAmount);

    if (!selectedCryptoOption) {
      setOrderError(ERROR_MESSAGES.NO_CRYPTO_SELECTED);
      return;
    }

    if (!selectedPaymentOption) {
      setOrderError(ERROR_MESSAGES.NO_PAYMENT_SELECTED);
      return;
    }

    if (amount < selectedPaymentOption.payMin) {
      setOrderError(
        ERROR_MESSAGES.MIN_AMOUNT(selectedPaymentOption.payMin, selectedPaymentOption.currency)
      );
      return;
    }
    if (amount > selectedPaymentOption.payMax) {
      setOrderError(
        ERROR_MESSAGES.MAX_AMOUNT(selectedPaymentOption.payMax, selectedPaymentOption.currency)
      );
      return;
    }

    if (amount < selectedCryptoOption.minPurchaseAmount) {
      setOrderError(
        ERROR_MESSAGES.MIN_AMOUNT(
          selectedCryptoOption.minPurchaseAmount,
          selectedPaymentOption.currency
        )
      );
      return;
    }
    if (amount > selectedCryptoOption.maxPurchaseAmount) {
      setOrderError(
        ERROR_MESSAGES.MAX_AMOUNT(
          selectedCryptoOption.maxPurchaseAmount,
          selectedPaymentOption.currency
        )
      );
      return;
    }

    const orderRequest: AlchemyBuyOrderRequest = {
      side: 'BUY',
      amount: fiatAmount,
      fiatCurrency: selectedPaymentOption.currency,
      cryptoCurrency: selectedCryptoOption.crypto,
      address: evmAddress,
      orderType: ORDER_TYPES.MARKET,
      network: selectedCryptoOption.network,
      alpha2: selectedPaymentOption.country,
      payWayCode: selectedPaymentOption.payWayCode,
      depositType: 2,
      memo: 'crypto-buy-order',
    };

    const validation = validateBuyOrderRequest(orderRequest);
    if (!validation.isValid) {
      setOrderError(validation.errors.join(', '));
      return;
    }

    setIsCreatingOrder(true);
    setOrderError('');
    setOrderSuccess(false);
    setPaymentUrl('');

    try {
      const result = await createAlchemyBuyOrder(orderRequest);
      if (!result.success?.status || !result.success.data) {
        throw new Error(ERROR_MESSAGES.ORDER_FAILED);
      }

      const orderData = JSON.parse(result.success.data);
      if (!orderData.success || !orderData.data?.payUrl) {
        throw new Error(ERROR_MESSAGES.NO_PAYMENT_URL);
      }

      const payUrl = orderData.data.payUrl;
      setPaymentUrl(payUrl);
      setOrderSuccess(true);

      const tab = window.open(payUrl, '_blank');
      if (tab) {
        setPaymentTab(tab);
      } else {
        setOrderError(ERROR_MESSAGES.NO_TAB_OPEN);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : ERROR_MESSAGES.ORDER_FAILED;
      setOrderError(errorMessage);
    } finally {
      setIsCreatingOrder(false);
    }
  };

  useEffect(() => {
    if (paymentTab) {
      const interval = setInterval(() => {
        if (paymentTab.closed) {
          setPaymentTab(null);
          setOrderSuccess(false);
          clearInterval(interval);
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [paymentTab]);

  const handleCloseTab = () => {
    if (paymentTab && !paymentTab.closed) {
      paymentTab.close();
      setPaymentTab(null);
      setOrderSuccess(false);
    }
  };

  const handleRetryQuote = () => {
    setQuoteError('');
    setFiatAmount(prev => {
      const num = parseFloat(prev) || 0;
      return (num + 0.01).toString();
    });
  };

  const resetForm = () => {
    setFiatAmount('');
    setCryptoAmount('0.0');
    setQuote(null);
    setQuoteError('');
    setOrderError('');
    setOrderSuccess(false);
    setPaymentUrl('');
    setSelectedPaymentOption(paymentOptions[0] || null);
    setSelectedCryptoOption(cryptoOptions[0] || null);
    if (paymentTab && !paymentTab.closed) {
      paymentTab.close();
    }
    setPaymentTab(null);
  };

  const isFormValid = () => {
    const amount = parseFloat(fiatAmount);
    return (
      amount >= (selectedPaymentOption?.payMin || MIN_AMOUNT_BUY) &&
      amount <= (selectedPaymentOption?.payMax || Infinity) &&
      amount >= (selectedCryptoOption?.minPurchaseAmount || MIN_AMOUNT_BUY) &&
      amount <= (selectedCryptoOption?.maxPurchaseAmount || Infinity) &&
      quote &&
      !isLoadingQuote &&
      !isCreatingOrder &&
      selectedPaymentOption &&
      selectedCryptoOption &&
      !quoteError
    );
  };

  return {
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
    paymentUrl,
    quote,
    paymentTab,
    cryptoOptions,
    paymentOptions,
    handleCreateOrder,
    handleCloseTab,
    handleRetryQuote,
    resetForm,
    isFormValid,
    evmAddress,
    MIN_AMOUNT: MIN_AMOUNT_BUY,
    SUCCESS_MESSAGES,
    ERROR_MESSAGES,
    setOrderError,
  };
};
