export const ERROR_CODES: Record<string, string> = {
  '3100': 'Commission configuration required. Please contact support.',
  '3101': 'Invalid payment method selected.',
  '3102': 'Amount exceeds daily limit.',
  '3103': 'Service temporarily unavailable.',
  '4001': 'Invalid cryptocurrency or network.',
  '4002': 'Insufficient liquidity for this trade.',
  '5000': 'Internal server error. Please try again.',
  '9999': 'Network error. Please check your connection.',
};

export const MIN_AMOUNT_BUY = 10;
export const MIN_AMOUNT_SELL = 0.0001;

export const SUCCESS_MESSAGES = {
  ORDER_CREATED:
    'Your Alchemy Pay tab has been opened! Complete the transaction in the new tab. For a new payment, first complete or close the existing one.',
  TAB_CLOSED: 'Payment tab closed',
};

export const ERROR_MESSAGES = {
  MIN_AMOUNT: (min: number, currency: string) => `Minimum amount is ${min} ${currency}`,
  MAX_AMOUNT: (max: number, currency: string) => `Maximum amount is ${max} ${currency}`,
  INVALID_AMOUNT: 'Amount must be greater than 0',
  NO_CRYPTO_SELECTED: 'Please select a cryptocurrency',
  NO_PAYMENT_SELECTED: 'Please select a payment option',
  EXISTING_TAB: 'Please complete or close the existing payment tab first.',
  NO_TAB_OPEN: 'Unable to open new tab. Please allow popups or open manually.',
  NO_QUOTE_DATA: 'No quote data received',
  INVALID_QUOTE: 'Invalid quote data structure',
  QUOTE_FAILED: 'Failed to fetch quote',
  ORDER_FAILED: 'Failed to create order',
  NO_PAYMENT_URL: 'No payment URL received from Alchemy Pay',
  INVALID_RESPONSE: 'Invalid response format from server',
};
