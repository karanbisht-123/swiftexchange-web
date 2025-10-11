import { fetchApiResponseFromServer } from '../../../service/apiService';
import type { AlchemySellOrderRequest, AlchemySellOrderResponse } from '../types/alchemyTypes';

export const createAlchemySellOrder = async (
  orderData: AlchemySellOrderRequest
): Promise<AlchemySellOrderResponse> => {
  try {
    const response = await fetchApiResponseFromServer<AlchemySellOrderResponse>(
      '/alchemy/create-sell-order',
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

export const validateSellOrderRequest = (
  orderData: AlchemySellOrderRequest
): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];

  if (!orderData.cryptoAmount?.trim()) {
    errors.push('Crypto amount is required');
  } else {
    const amount = parseFloat(orderData.cryptoAmount);
    if (isNaN(amount) || amount <= 0) {
      errors.push('Crypto amount must be a positive number');
    }
  }

  if (!orderData.fiat?.trim()) {
    errors.push('Fiat currency is required');
  }

  if (!orderData.crypto?.trim()) {
    errors.push('Crypto currency is required');
  }

  if (!orderData.network?.trim()) {
    errors.push('Network is required');
  }

  if (!orderData.country?.trim()) {
    errors.push('Country is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};
