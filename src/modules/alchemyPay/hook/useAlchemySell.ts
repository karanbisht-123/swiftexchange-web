import { useEffect, useState } from 'react';

import cryptoSupportData from '../../../data/alchemy/AlchemyCryptoSupprort.json';
import fiatSupportData from '../../../data/alchemy/AlchemyFiatSellSupprort.json';
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  MIN_AMOUNT_SELL,
  SUCCESS_MESSAGES,
} from '../constants/alchemyConstants';
import { fetchAlchemyQuote, validateQuoteRequest } from '../service/alchemyQuoteService';
import { createAlchemySellOrder, validateSellOrderRequest } from '../service/alchemySellService';
import type {
  AlchemyQuoteData,
  AlchemyQuoteRequest,
  AlchemySellOrderRequest,
} from '../types/alchemyTypes';

interface ParsedApiResponse {
  success: boolean;
  returnCode?: string;
  returnMsg?: string;
  data?: any;
  traceId?: string;
}

type CryptoOption = {
  value: string;
  label: string;
  crypto: string;
  network: string;
  minSellAmount: number;
  maxSellAmount: number;
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
  .filter(crypto => crypto.sellEnable === 1)
  .map(crypto => ({
    value: `${crypto.crypto}-${crypto.network}`,
    label: `${crypto.crypto} (${crypto.network})`,
    crypto: crypto.crypto,
    network: crypto.network,
    minSellAmount: crypto.minSellAmount ?? MIN_AMOUNT_SELL,
    maxSellAmount: crypto.maxSellAmount ?? Number.MAX_SAFE_INTEGER,
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

export const useAlchemySell = () => {
  const [cryptoAmount, setCryptoAmount] = useState('');
  const [selectedCryptoOption, setSelectedCryptoOption] = useState<CryptoOption | null>(
    cryptoOptions[0] || null
  );
  const [selectedPaymentOption, setSelectedPaymentOption] = useState<PaymentOption | null>(
    paymentOptions[0] || null
  );
  const [fiatAmount, setFiatAmount] = useState('0.0');
  const [quote, setQuote] = useState<AlchemyQuoteData | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [orderUrl, setOrderUrl] = useState('');
  const [paymentTab, setPaymentTab] = useState<Window | null>(null);

  const parseApiResponse = (response: any): ParsedApiResponse => {
    try {
      if (typeof response.data === 'string') {
        return JSON.parse(response.data);
      }
      return response.data || response;
    } catch (error) {
      console.error('Failed to parse API response:', error);
      return {
        success: false,
        returnMsg: ERROR_MESSAGES.INVALID_RESPONSE,
      };
    }
  };

  const getErrorMessage = (
    parsedResponse: ParsedApiResponse,
    fallback = ERROR_MESSAGES.ORDER_FAILED
  ): string => {
    if (parsedResponse.returnCode && ERROR_CODES[parsedResponse.returnCode]) {
      return ERROR_CODES[parsedResponse.returnCode];
    }

    if (parsedResponse.returnMsg) {
      return parsedResponse.returnMsg;
    }

    return fallback;
  };

  useEffect(() => {
    const fetchQuote = async () => {
      setQuoteError('');
      setOrderError('');
      setOrderSuccess(false);
      setOrderUrl('');

      const amount = parseFloat(cryptoAmount);
      if (!cryptoAmount || amount <= 0) {
        setFiatAmount('0.0');
        setQuote(null);
        if (cryptoAmount) {
          setQuoteError(
            ERROR_MESSAGES.MIN_AMOUNT(
              selectedCryptoOption?.minSellAmount || MIN_AMOUNT_SELL,
              selectedCryptoOption?.crypto || ''
            )
          );
        }
        return;
      }

      if (!selectedCryptoOption) {
        setQuoteError(ERROR_MESSAGES.NO_CRYPTO_SELECTED);
        setFiatAmount('0.0');
        setQuote(null);
        return;
      }

      if (!selectedPaymentOption) {
        setQuoteError(ERROR_MESSAGES.NO_PAYMENT_SELECTED);
        setFiatAmount('0.0');
        setQuote(null);
        return;
      }

      if (amount < (selectedCryptoOption.minSellAmount || MIN_AMOUNT_SELL)) {
        setFiatAmount('0.0');
        setQuote(null);
        setQuoteError(
          ERROR_MESSAGES.MIN_AMOUNT(selectedCryptoOption.minSellAmount, selectedCryptoOption.crypto)
        );
        return;
      }
      if (selectedCryptoOption.maxSellAmount && amount > selectedCryptoOption.maxSellAmount) {
        setFiatAmount('0.0');
        setQuote(null);
        setQuoteError(
          ERROR_MESSAGES.MAX_AMOUNT(selectedCryptoOption.maxSellAmount, selectedCryptoOption.crypto)
        );
        return;
      }

      const quoteRequest: AlchemyQuoteRequest = {
        crypto: selectedCryptoOption.crypto,
        network: selectedCryptoOption.network,
        fiat: selectedPaymentOption.currency,
        amount: cryptoAmount,
        side: 'SELL',
      };

      const validation = validateQuoteRequest(quoteRequest);
      if (!validation.isValid) {
        setQuoteError(validation.errors[0]);
        setFiatAmount('0.0');
        setQuote(null);
        return;
      }

      setIsLoadingQuote(true);
      setQuote(null);
      setFiatAmount('0.0');

      try {
        const response = await fetchAlchemyQuote(quoteRequest);

        if (!response.success) {
          throw new Error(ERROR_MESSAGES.QUOTE_FAILED);
        }

        const parsedResponse = parseApiResponse(response);

        if (!parsedResponse.success) {
          throw new Error(getErrorMessage(parsedResponse, ERROR_MESSAGES.QUOTE_FAILED));
        }

        if (!parsedResponse.data) {
          throw new Error(ERROR_MESSAGES.NO_QUOTE_DATA);
        }

        const quoteData: AlchemyQuoteData = {
          ...parsedResponse.data,
          networkFee: parsedResponse.data.networkFee || '0',
        };

        setQuote(quoteData);
        setFiatAmount(quoteData.fiatQuantity || '0.0');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : ERROR_MESSAGES.QUOTE_FAILED;
        setQuoteError(errorMessage);
        setFiatAmount('0.0');
        setQuote(null);
      } finally {
        setIsLoadingQuote(false);
      }
    };

    const debounceTimer = setTimeout(fetchQuote, 500);
    return () => clearTimeout(debounceTimer);
  }, [cryptoAmount, selectedCryptoOption, selectedPaymentOption]);

  const handleCreateOrder = async () => {
    if (paymentTab && !paymentTab.closed) {
      setOrderError(ERROR_MESSAGES.EXISTING_TAB);
      return;
    }

    const amount = parseFloat(cryptoAmount);

    if (!selectedCryptoOption) {
      setOrderError(ERROR_MESSAGES.NO_CRYPTO_SELECTED);
      return;
    }

    if (!selectedPaymentOption) {
      setOrderError(ERROR_MESSAGES.NO_PAYMENT_SELECTED);
      return;
    }

    if (amount < (selectedCryptoOption.minSellAmount || MIN_AMOUNT_SELL)) {
      setOrderError(
        ERROR_MESSAGES.MIN_AMOUNT(selectedCryptoOption.minSellAmount, selectedCryptoOption.crypto)
      );
      return;
    }
    if (selectedCryptoOption.maxSellAmount && amount > selectedCryptoOption.maxSellAmount) {
      setOrderError(
        ERROR_MESSAGES.MAX_AMOUNT(selectedCryptoOption.maxSellAmount, selectedCryptoOption.crypto)
      );
      return;
    }

    const orderRequest: AlchemySellOrderRequest = {
      cryptoAmount,
      crypto: selectedCryptoOption.crypto,
      fiat: selectedPaymentOption.currency,
      network: selectedCryptoOption.network,
      country: selectedPaymentOption.country,
    };

    const validation = validateSellOrderRequest(orderRequest);
    if (!validation.isValid) {
      setOrderError(validation.errors.join(', '));
      return;
    }

    setIsCreatingOrder(true);
    setOrderError('');
    setOrderSuccess(false);
    setOrderUrl('');

    try {
      const response = await createAlchemySellOrder(orderRequest);

      if (typeof response.success === 'string' && response.success.startsWith('http')) {
        setOrderUrl(response.success);
        const tab = window.open(response.success, '_blank');
        if (tab) {
          setPaymentTab(tab);
        } else {
          setOrderError(ERROR_MESSAGES.NO_TAB_OPEN);
        }
        setOrderSuccess(true);
        return;
      }

      const parsedResponse = parseApiResponse(response);

      if (!parsedResponse.success) {
        throw new Error(getErrorMessage(parsedResponse));
      }

      if (parsedResponse.data) {
        setOrderSuccess(true);
      } else {
        throw new Error('Order creation completed but no confirmation received');
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
    setCryptoAmount(prev => {
      const num = parseFloat(prev) || 0;
      return (num + 0.0001).toString();
    });
  };

  const resetForm = () => {
    setCryptoAmount('');
    setFiatAmount('0.0');
    setQuote(null);
    setQuoteError('');
    setOrderError('');
    setOrderSuccess(false);
    setOrderUrl('');
    setSelectedPaymentOption(paymentOptions[0] || null);
    setSelectedCryptoOption(cryptoOptions[0] || null);
    if (paymentTab && !paymentTab.closed) {
      paymentTab.close();
    }
    setPaymentTab(null);
  };

  const isFormValid = () => {
    const amount = parseFloat(cryptoAmount);
    return (
      amount >= (selectedCryptoOption?.minSellAmount || MIN_AMOUNT_SELL) &&
      (!selectedCryptoOption?.maxSellAmount || amount <= selectedCryptoOption.maxSellAmount) &&
      quote &&
      !isLoadingQuote &&
      !isCreatingOrder &&
      selectedCryptoOption &&
      selectedPaymentOption &&
      !quoteError
    );
  };

  return {
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
    orderUrl,
    paymentTab,
    cryptoOptions,
    paymentOptions,
    handleCreateOrder,
    handleCloseTab,
    handleRetryQuote,
    resetForm,
    isFormValid,
    setOrderError,
    MIN_AMOUNT: MIN_AMOUNT_SELL,
    SUCCESS_MESSAGES,
    ERROR_MESSAGES,
  };
};
