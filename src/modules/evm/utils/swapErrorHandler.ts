const NOISE_STRINGS = ['payload=', 'jsonrpc', 'UNKNOWN_ERROR', 'version='];
const HEX_PATTERN = /\b0x[0-9a-fA-F]{6,}\b/;

function isNoisy(str: string): boolean {
  return NOISE_STRINGS.some((n) => str.includes(n)) || HEX_PATTERN.test(str);
}


export function parseWalletError(error: unknown): string {
  console.error('[parseWalletError]', error);

  const rawMsg: string =
    (error as any)?.message ||
    (error as any)?.originalError?.message ||
    String(error);

  try {
    const match = rawMsg.match(/error=\s*(\{[^}]+\})/);
    if (match?.[1]) {
      const parsed = JSON.parse(match[1]);
      if (parsed?.message && typeof parsed.message === 'string') {
        return parsed.message;
      }
    }
  } catch (error) {
    console.error("Error parsing wallet error:", error);
  }
  if (rawMsg.length > 0 && rawMsg !== '[object Object]' && !isNoisy(rawMsg)) {
    return rawMsg;
  }

  return 'Something went wrong. Please try again.';
}

export function parseSwapError(error: any): string {
  console.error('[SwapError]', error);
  const rawMsg: string = error?.message || error?.originalError?.message || '';
  if (rawMsg && (rawMsg.includes('error=') || rawMsg.includes('UNKNOWN_ERROR') || rawMsg.includes('payload='))) {
    return parseWalletError(error);
  }

  let message = '';
  const data = error?.response?.data || error?.data || error;

  if (data?.diagnosisMessages && Array.isArray(data.diagnosisMessages) && data.diagnosisMessages.length > 0) {
    return String(data.diagnosisMessages[0]);
  }

  if (Array.isArray(data) && data.length > 0) {
    const firstErrorItem = data.find((item: any) => item.ok === false || item.error || item.message);
    if (firstErrorItem) {
      message = String(firstErrorItem.error || firstErrorItem.message || 'Unknown swap error');
    } else if (data[0]?.error) {
      message = String(data[0].error);
    } else if (data[0]?.message) {
      message = String(data[0].message);
    }
  }

  if (!message && typeof data === 'object' && data !== null && !(data instanceof Error)) {
    if (data.message) {
      message = data.message;
    } else if (data.error && typeof data.error === 'string') {
      message = data.error;
    } else if (data.info?.error?.message) {
      message = data.info.error.message;
    } else if (data.error?.message) {
      message = data.error.message;
    }
  }

  if (!message && error !== null) {
    if (typeof error === 'object' && error.message) {
      message = error.message;
      if (message.includes('{"') || message.includes('error=')) {
        try {
          let jsonToParse = '';
          if (message.includes('error=')) {
            const match = message.match(/error=({.*})/);
            if (match) {
              jsonToParse = match[1];
              let braces = 0;
              for (let i = 0; i < jsonToParse.length; i++) {
                if (jsonToParse[i] === '{') braces++;
                if (jsonToParse[i] === '}') braces--;
                if (braces === 0) { jsonToParse = jsonToParse.substring(0, i + 1); break; }
              }
            }
          } else {
            const match = message.match(/({.*})/);
            if (match) jsonToParse = match[1];
          }
          if (jsonToParse) {
            const parsed = JSON.parse(jsonToParse);
            const deepError = parsed.error || parsed;
            let body = deepError.body;
            if (typeof body === 'string') { try { body = JSON.parse(body); } catch { } }
            if (body?.error?.message) message = body.error.message;
            else if (deepError.message) message = deepError.message;
            else if (parsed.reason) message = parsed.reason;
          }
        } catch { }
      }
    } else {
      try {
        const parsed = JSON.parse(error.toString());
        if (parsed.message) message = parsed.message;
        else if (Array.isArray(parsed) && parsed.length > 0) {
          const errItem = parsed.find((i: any) => i.error || i.message);
          if (errItem) message = String(errItem.error || errItem.message);
        }
      } catch {
        message = error.toString();
      }
    }
  }

  if (!message) {
    message = error ? String(error) : 'Swap failed. Please try again.';
  }

  let processedMessage = message
    .replace(/^could not coalesce error/i, '')
    .replace(/^\s*\(/, '')
    .replace(/\)\s*$/, '')
    .replace(/^API error: Bad Request - /i, '')
    .replace(/^API error: /i, '')
    .replace(/^Error: /i, '')
    .replace(/^Token approval failed: /i, '')
    .replace(/^ethers-user-denied: /i, '')
    .replace(' [object Object]', '')
    .replace(/^"|"$/g, '')
    .trim();
  if (isNoisy(processedMessage)) {
    return parseWalletError(error);
  }

  const lower = processedMessage.toLowerCase();

  if (lower.includes('balance is empty') || lower.includes('insufficient')) {
    if (lower.includes('fee')) {
      if (lower.includes('required') || lower.includes('current') || lower.includes('need') || lower.includes('have')) {
        return processedMessage;
      }
      return 'Insufficient native tokens for gas fees.';
    }
    return processedMessage;
  }

  if (
    lower.includes('insufficient funds') ||
    lower.includes('insufficient eth balance') ||
    lower.includes('insufficient eth for gas fees') ||
    lower.includes('insufficient balance')
  ) {
    if (lower.includes('need') || lower.includes('have') || lower.includes('required')) {
      return processedMessage;
    }
    return 'Insufficient native tokens to cover network gas fees.';
  }

  if (
    lower.includes('cannot estimate gas') ||
    lower.includes('gas estimation failed') ||
    lower.includes('unpredictable_gas_limit')
  ) {
    if (lower.includes('gas required exceeds allowance')) {
      return 'The transaction is likely to fail. This often happens if you have insufficient token balance for the transfer or the contract execution reverted.';
    }
    return 'Transaction gas estimation failed. This usually happens if the transaction will fail on-chain. Please check your balance or parameters.';
  }

  if (processedMessage.includes('http://') || processedMessage.includes('https://') || lower.includes('rpc error')) {
    const revertMatch = processedMessage.match(/execution reverted:?\s*([^"(]+)/i);
    if (revertMatch?.[1]?.trim()) {
      return `Transaction failed: ${revertMatch[1].trim()}`;
    }
    return 'Transaction failed due to a network provider error. Please try again.';
  }

  if (lower.includes('tx_bad_seq') || lower.includes('sequence_mismatch') || lower.includes('bad sequence')) {
    return 'Transaction sequence number mismatch. This can happen if another transaction was recently submitted. Please try again.';
  }

  // Stellar / Soroban Specifics
  if (lower.includes('resulting balance is not within the allowed range')) {
    return 'Insufficient XLM balance. You need more XLM to cover the network reserve and transaction fees.';
  }

  if (lower.includes('error(contract, #10)')) {
    if (lower.includes('transfer')) {
      return 'Transfer failed: The contract could not complete the transfer. This is usually due to insufficient balance or trustline issues.';
    }
    return 'Contract execution failed. Please ensure you have enough XLM for fees and the minimum reserve.';
  }

  if (lower.includes('tx_insufficient_balance') || lower.includes('op_underfunded')) {
    return 'Insufficient balance to cover transaction fees and minimum reserve.';
  }

  if (lower.includes('tx_bad_auth') || lower.includes('op_bad_auth')) {
    return 'Transaction signing failed. Please verify your wallet connection and try again.';
  }

  if (lower.includes('tx_insufficient_fee')) {
    return 'Network fee is too low. Please try again or increase the fee in your wallet.';
  }

  if (lower.includes('op_no_trust')) {
    return 'Asset trustline missing. You must enable this asset in your wallet before you can receive it.';
  }

  if (lower.includes('op_src_not_found')) {
    return 'Stellar account not activated. Send at least 1 XLM to this address to activate it.';
  }

  if (lower.includes('op_limit_exceeded')) {
    return 'The amount exceeds your trustline limit. Increase the limit in your wallet.';
  }

  if (lower.includes('simulation failed')) {
    if (lower.includes('hosterror')) {
      return 'Transaction simulation failed. This is typically caused by insufficient XLM for fees or missing account reserves.';
    }
    return 'Bridge simulation failed. Please check your Stellar account balance and try again.';
  }

  if (lower.includes('user declined') || lower.includes('user rejected') || lower.includes('dismissed')) {
    return 'Transaction was cancelled by the user.';
  }

  if (processedMessage.length > 150) {
    if (lower.includes('balance') || lower.includes('underfunded')) {
      return 'Transaction failed due to insufficient balance or reserve requirements.';
    }
    return 'The transaction failed. Please ensure your wallet is funded and try again.';
  }

  return processedMessage || 'Swap failed. Please try again.';
}
export interface RangoDisplayError {
  type: 'no_route' | 'amount' | 'balance' | 'fee' | 'expired' | 'server' | 'warning';
  title: string;
  message: string;
  canRetry: boolean;
}

export function parseRangoQuoteResponse(data: any): RangoDisplayError | null {
  if (!data) return null;

  // 1. Hard error from API
  if (data.error) {
    const errorMap: Record<number, RangoDisplayError> = {
      1101: { type: 'server', title: 'Server Error', message: 'Rango internal error. Try again shortly.', canRetry: true },
      1202: { type: 'amount', title: 'Amount Issue', message: 'Amount is below minimum or above maximum for this route.', canRetry: false },
      1203: { type: 'balance', title: 'Balance Error', message: 'Could not fetch your wallet balance. Check RPC.', canRetry: true },
      1204: { type: 'fee', title: 'Approval Error', message: 'Invalid approval transaction. Please try again.', canRetry: true },
      1302: { type: 'expired', title: 'Price Changed', message: 'Price moved too much. Please refresh the quote.', canRetry: true },
      1303: { type: 'expired', title: 'Route Expired', message: 'This route has expired. Please get a new quote.', canRetry: true },
    };

    if (data.errorCode && errorMap[data.errorCode]) {
      return errorMap[data.errorCode];
    }

    return {
      type: 'server',
      title: 'Swap Error',
      message: data.error || 'An unknown error occurred.',
      canRetry: true,
    };
  }

  if (!data.result) {
    const diagnosis = data.diagnosisMessages?.[0] || null;

    const diagnosisMap: Record<string, RangoDisplayError> = {
      'too low': {
        type: 'amount',
        title: 'Amount Too Low',
        message: 'Your input amount is too low for this route. Try increasing it.',
        canRetry: false,
      },
      'too high': {
        type: 'amount',
        title: 'Amount Too High',
        message: 'Your input amount exceeds the maximum limit for this route.',
        canRetry: false,
      },
      'no route': {
        type: 'no_route',
        title: 'No Route Found',
        message: 'No swap route available for this token pair.',
        canRetry: false,
      },
      'liquidity': {
        type: 'no_route',
        title: 'Insufficient Liquidity',
        message: 'Not enough liquidity available for this swap.',
        canRetry: false,
      },
    };

    if (diagnosis) {
      const lowerDiag = diagnosis.toLowerCase();
      for (const [key, val] of Object.entries(diagnosisMap)) {
        if (lowerDiag.includes(key)) return val;
      }
      return {
        type: 'no_route',
        title: 'Route Unavailable',
        message: diagnosis,
        canRetry: false,
      };
    }

    return {
      type: 'no_route',
      title: 'No Route Found',
      message: 'No route available for this swap. Try a different amount or pair.',
      canRetry: false,
    };
  }

  if (data.validationStatus && Array.isArray(data.validationStatus)) {
    for (const chainStatus of data.validationStatus) {
      for (const wallet of chainStatus.wallets || []) {
        for (const asset of wallet.requiredAssets || []) {
          if (!asset.ok) {
            const symbol = asset.asset?.symbol || 'token';
            const chain = chainStatus.blockchain || '';

            if (asset.reason === 'FEE') {
              return {
                type: 'fee',
                title: 'Insufficient Gas',
                message: `Not enough ${symbol} for gas fees on ${chain}.`,
                canRetry: false,
              };
            }
            if (asset.reason === 'INPUT_ASSET') {
              return {
                type: 'balance',
                title: 'Insufficient Balance',
                message: `Not enough ${symbol} balance to complete this swap.`,
                canRetry: false,
              };
            }
            if (asset.reason === 'FEE_AND_INPUT_ASSET') {
              return {
                type: 'balance',
                title: 'Insufficient Balance & Gas',
                message: `Not enough ${symbol} for both the swap and gas fees on ${chain}.`,
                canRetry: false,
              };
            }
          }
        }
      }
    }
  }

  // 4. Result OK but has warnings (high price impact etc)
  if (data.result?.resultType && data.result.resultType !== 'OK') {
    const resultTypeMap: Record<string, RangoDisplayError> = {
      HIGH_IMPACT: {
        type: 'warning',
        title: 'High Price Impact',
        message: 'This swap has a high price impact. You may receive significantly less than expected.',
        canRetry: false,
      },
      INPUT_LIMIT_ISSUE: {
        type: 'amount',
        title: 'Amount Out of Range',
        message: 'The amount is outside the allowed range for this route. Adjust and try again.',
        canRetry: false,
      },
      NO_ROUTE: {
        type: 'no_route',
        title: 'No Route Found',
        message: 'No swap route available for this token pair.',
        canRetry: false,
      },
    };

    if (resultTypeMap[data.result.resultType]) {
      return resultTypeMap[data.result.resultType];
    }
  }

  return null;
}
