import { fetchApiResponseFromServer } from '../../../service/apiService';
import type { AlchemyBuyOrderRequest, AlchemyBuyOrderResponse } from '../types/alchemyTypes';

export const createAlchemyBuyOrder = async (orderData: AlchemyBuyOrderRequest): Promise<any> => {
  try {
    const response = await fetchApiResponseFromServer<AlchemyBuyOrderResponse>(
      '/alchemy/create-buy-order',
      'POST',
      orderData
    );

    if (!response.data) {
      throw new Error('No order data received from Alchemy Pay');
    }

    return response.data;
  } catch (error) {
    console.error('Error fetching Alchemy Pay quote:', error);
    throw error;
  }
};

export const validateBuyOrderRequest = (
  orderData: AlchemyBuyOrderRequest
): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];

  if (orderData.side !== 'BUY') {
    errors.push('Side must be BUY for buy orders');
  }

  if (!orderData.amount?.trim()) {
    errors.push('Amount is required');
  } else {
    const amount = parseFloat(orderData.amount);
    if (isNaN(amount) || amount <= 0) {
      errors.push('Amount must be a positive number');
    }
  }

  if (!orderData.fiatCurrency?.trim()) {
    errors.push('Fiat currency is required');
  }

  if (!orderData.cryptoCurrency?.trim()) {
    errors.push('Crypto currency is required');
  }

  if (!orderData.address?.trim()) {
    errors.push('Wallet address is required');
  }

  if (!orderData.network?.trim()) {
    errors.push('Network is required');
  }

  if (!orderData.alpha2?.trim()) {
    errors.push('Country code (alpha2) is required');
  }

  if (!orderData.payWayCode?.trim()) {
    errors.push('Payment method code is required');
  }

  if (!orderData.orderType?.trim()) {
    errors.push('Order type is required');
  }

  if (typeof orderData.depositType !== 'number') {
    errors.push('Deposit type must be a number');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};
