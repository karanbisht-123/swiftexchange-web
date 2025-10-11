import { fetchApiResponseFromServer } from '../../../service/apiService';
import type {
  AlchemyQuoteRequest,
  // AlchemyQuoteResponse,
} from '../types/alchemyTypes';

export const fetchAlchemyQuote = async (quoteData: AlchemyQuoteRequest): Promise<any> => {
  try {
    const response = await fetchApiResponseFromServer<any>(
      '/alchemy/fetch-quotes',
      'POST',
      quoteData
    );

    if (!response.data) {
      throw new Error('No quote data received from Alchemy Pay');
    }

    return response.data;
  } catch (error) {
    console.error('Error fetching Alchemy Pay quote:', error);
    throw error;
  }
};

export const validateQuoteRequest = (
  quoteData: AlchemyQuoteRequest
): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];

  if (!quoteData.crypto?.trim()) {
    errors.push('Cryptocurrency is required');
  }

  if (!quoteData.network?.trim()) {
    errors.push('Network is required');
  }

  if (!quoteData.fiat?.trim()) {
    errors.push('Fiat currency is required');
  }

  if (!quoteData.amount?.trim()) {
    errors.push('Amount is required');
  } else {
    const amount = parseFloat(quoteData.amount);
    if (isNaN(amount) || amount <= 0) {
      errors.push('Amount must be a positive number');
    }
  }

  if (!['BUY', 'SELL'].includes(quoteData.side)) {
    errors.push('Side must be either BUY or SELL');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};
