/**
 * Aster API Error Codes and human-friendly messages mapping.
 * Source: https://asterdex.github.io/aster-api-website/futures-v3/error-codes/
 */

export interface AsterErrorDetail {
  code: number;
  name: string;
  message: string;
  userMessage: string;
}

const ERROR_MAP: Record<number, { name: string; userMessage: string }> = {
  // 10xx - Server/Network
  '-1000': {
    name: 'UNKNOWN',
    userMessage: 'An unexpected error occurred while processing the request. Please try again.',
  },
  '-1001': {
    name: 'DISCONNECTED',
    userMessage:
      'Unable to process request due to internal server disconnection. Please try again.',
  },
  '-1002': {
    name: 'UNAUTHORIZED',
    userMessage: 'Unauthorized request. Please check your wallet connection and permissions.',
  },
  '-1003': {
    name: 'TOO_MANY_REQUESTS',
    userMessage: 'Too many requests. Please wait a moment before trying again.',
  },
  '-1006': {
    name: 'UNEXPECTED_RESP',
    userMessage: 'Unexpected response from Aster server. Execution status unknown.',
  },
  '-1007': {
    name: 'TIMEOUT',
    userMessage:
      'Request timed out waiting for Aster server. Please check your transaction history.',
  },
  '-1014': { name: 'UNKNOWN_ORDER_COMPOSITION', userMessage: 'Unsupported operation combination.' },
  '-1015': {
    name: 'TOO_MANY_ORDERS',
    userMessage: 'Too many new operations submitted. Please wait a moment.',
  },
  '-1016': {
    name: 'SERVICE_SHUTTING_DOWN',
    userMessage: 'Aster service is currently undergoing maintenance.',
  },
  '-1020': { name: 'UNSUPPORTED_OPERATION', userMessage: 'This operation is not supported.' },
  '-1021': {
    name: 'INVALID_TIMESTAMP',
    userMessage: 'Request timestamp is out of sync with Aster server. Resynchronizing clock...',
  },
  '-1022': {
    name: 'INVALID_SIGNATURE',
    userMessage: 'Invalid cryptographic signature. Please verify and sign again.',
  },
  '-1023': {
    name: 'START_TIME_GREATER_THAN_END_TIME',
    userMessage: 'Start time cannot be after end time.',
  },

  // 11xx - Request Parameters
  '-1100': {
    name: 'ILLEGAL_CHARS',
    userMessage: 'Illegal characters found in request parameters.',
  },
  '-1101': { name: 'TOO_MANY_PARAMETERS', userMessage: 'Too many parameters submitted.' },
  '-1102': {
    name: 'MANDATORY_PARAM_EMPTY_OR_MALFORMED',
    userMessage: 'A required parameter is missing or invalid.',
  },
  '-1103': { name: 'UNKNOWN_PARAM', userMessage: 'Unknown parameter sent in request.' },
  '-1104': {
    name: 'UNREAD_PARAMETERS',
    userMessage: 'Parameters could not be processed completely.',
  },
  '-1105': { name: 'PARAM_EMPTY', userMessage: 'A required field cannot be empty.' },
  '-1106': { name: 'PARAM_NOT_REQUIRED', userMessage: 'Unnecessary parameter submitted.' },
  '-1108': { name: 'BAD_ASSET', userMessage: 'Invalid or unsupported asset for this network.' },
  '-1109': { name: 'BAD_ACCOUNT', userMessage: 'Invalid account type specified.' },
  '-1111': {
    name: 'BAD_PRECISION',
    userMessage: 'Precision is higher than allowed for this asset.',
  },
  '-1113': { name: 'WITHDRAW_NOT_NEGATIVE', userMessage: 'Invalid withdrawal amount.' },

  // 20xx - Trading & Balance
  '-2010': { name: 'NEW_ORDER_REJECTED', userMessage: 'Operation rejected by Aster risk engine.' },
  '-2011': { name: 'CANCEL_REJECTED', userMessage: 'Action could not be completed.' },
  '-2018': {
    name: 'BALANCE_NOT_SUFFICIENT',
    userMessage: 'Insufficient balance available for this transaction.',
  },
  '-2019': { name: 'MARGIN_NOT_SUFFICIENT', userMessage: 'Insufficient margin balance.' },
  '-2023': {
    name: 'USER_IN_LIQUIDATION',
    userMessage: 'Account is currently undergoing risk liquidation.',
  },
  '-2024': { name: 'POSITION_NOT_SUFFICIENT', userMessage: 'Position balance is insufficient.' },
};

export function parseAsterError(err: any): AsterErrorDetail {
  const code = typeof err?.code === 'number' ? err.code : -1000;
  const rawMsg = err?.msg || err?.message || 'Unknown Aster API error';

  const mapped = ERROR_MAP[code];
  if (mapped) {
    return {
      code,
      name: mapped.name,
      message: rawMsg,
      userMessage: mapped.userMessage,
    };
  }

  // Handle common text patterns if code isn't in map
  if (/daily limit/i.test(rawMsg)) {
    return {
      code,
      name: 'DAILY_LIMIT_EXCEEDED',
      message: rawMsg,
      userMessage: 'Withdrawal amount exceeds your 24-hour remaining limit.',
    };
  }

  if (/min.*amount/i.test(rawMsg)) {
    return {
      code,
      name: 'BELOW_MIN_AMOUNT',
      message: rawMsg,
      userMessage: 'Withdrawal amount is below the minimum allowed limit.',
    };
  }

  if (/insufficient/i.test(rawMsg)) {
    return {
      code,
      name: 'INSUFFICIENT_FUNDS',
      message: rawMsg,
      userMessage: 'Insufficient account balance for this transaction.',
    };
  }

  return {
    code,
    name: 'UNKNOWN',
    message: rawMsg,
    userMessage: rawMsg || 'An error occurred with Aster exchange.',
  };
}
