const NOISE_STRINGS = ['payload=', 'jsonrpc', 'UNKNOWN_ERROR', 'version='];

export function extractCleanMessage(rawMsg: string): string {
  if (!rawMsg) return '';

  let trimmed = rawMsg.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const innerMsg = parsed?.message || parsed?.error?.message || parsed?.error || parsed?.reason || parsed?.details || parsed?.description;
      if (innerMsg && typeof innerMsg === 'string') {
        return extractCleanMessage(innerMsg);
      }
    } catch { }
  }

  const nestedBodyMatch = rawMsg.match(/body=\\?"(\{.*?\})"(?:\\|,|\s|$)/s);
  if (nestedBodyMatch?.[1]) {
    try {
      const unescaped = nestedBodyMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      const parsed = JSON.parse(unescaped);
      const innerMsg = parsed?.error?.message || parsed?.message || parsed?.reason || parsed?.details;
      if (innerMsg) return innerMsg;
    } catch (err) {
      console.log(err)
    }
  }

  if (rawMsg.includes('body="') || rawMsg.includes('body=\\"')) {
    const bodyMatch = rawMsg.match(/body=["']?\\?(\{.*?\})\\?["']/);
    if (bodyMatch?.[1]) {
      try {
        const unescaped = bodyMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        const parsed = JSON.parse(unescaped);
        const innerMsg = parsed?.error?.message || parsed?.message || parsed?.reason || parsed?.details;
        if (innerMsg) return innerMsg;
      } catch { }
    }
  }

  const messagePatterns = [
    /["']message["']\s*:\s*["']([^"']+)["']/i,
    /\\?["']message\\?["']\s*:\s*\\?["']([^\\'"]+)\\?["']/i,
    /["']reason["']\s*:\s*["']([^"']+)["']/i,
    /\\?["']reason\\?["']\s*:\s*\\?["']([^\\'"]+)\\?["']/i,
    /["']details["']\s*:\s*["']([^"']+)["']/i,
    /\\?["']details\\?["']\s*:\s*\\?["']([^\\'"]+)\\?["']/i
  ];
  for (const pattern of messagePatterns) {
    const match = rawMsg.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/\\"/g, '"').trim();
    }
  }

  // 3. Fallback: standard `error=\s*(\{[^}]+\})` parsing
  try {
    const match = rawMsg.match(/error=\s*(\{[^}]+\})/);
    if (match?.[1]) {
      const parsed = JSON.parse(match[1]);
      const inner = parsed?.message || parsed?.error?.message || parsed?.reason;
      if (inner && typeof inner === 'string') {
        return inner;
      }
    }
  } catch (error) {
    // ignore
  }

  return rawMsg;
}

function isNoisy(str: string): boolean {
  // If it's a huge hex string (bytecode/signature), it's noise
  const LONG_HEX_PATTERN = /\b0x[0-9a-fA-F]{65,}\b/;
  if (LONG_HEX_PATTERN.test(str)) return true;

  return NOISE_STRINGS.some((n) => str.includes(n));
}


export function translateErrorMessage(message: string): string {
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
    return '';
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

  if (lower.includes('execution reverted')) {
    const revertMatch = processedMessage.match(/execution reverted:?\s*([^"(]+)/i);
    if (revertMatch?.[1]?.trim()) {
      return `Transaction failed: ${revertMatch[1].trim()}`;
    }
  }

  if (lower.includes('gas price below minimum') || lower.includes('intrinsic gas') || lower.includes('max fee') || lower.includes('tip cap') || lower.includes('below minimum')) {
    return processedMessage;
  }

  if (lower.includes('nonce too low') || lower.includes('nonce')) {
    return 'Account nonce out of sync. Please retry';
  }
  if (lower.includes('replacement transaction underpriced') || lower.includes('underpriced')) {
    return 'Pending tx with lower fee. Please retry';
  }

  if (processedMessage.includes('http://') || processedMessage.includes('https://') || lower.includes('rpc error')) {
    const revertMatch = processedMessage.match(/execution reverted:?\s*([^"(]+)/i);
    if (revertMatch?.[1]?.trim()) {
      return `Transaction failed: ${revertMatch[1].trim()}`;
    }
    return 'Network provider error. Please retry';
  }

  if (lower.includes('tx_bad_seq') || lower.includes('sequence_mismatch') || lower.includes('bad sequence')) {
    return 'Tx sequence mismatch. Please retry';
  }

  // Stellar / Soroban Specifics
  if (lower.includes('resulting balance is not within the allowed range')) {
    return 'Insufficient XLM balance. You need more XLM to cover the network reserve and transaction fees.';
  }

  if (lower.includes('error(contract, #10)') || lower.includes('error(contract,#10)')) {
    if (lower.includes('transfer')) {
      return 'Transfer failed: The contract could not complete the transfer. This is usually due to insufficient balance or trustline issues.';
    }
    return 'Contract execution failed. Please ensure you have enough XLM for fees and the minimum reserve.';
  }

  if (lower.includes('tx_insufficient_balance') || lower.includes('op_underfunded')) {
    return 'Insufficient balance to cover transaction fees and minimum reserve.';
  }

  if (lower.includes('tx_bad_auth') || lower.includes('op_bad_auth')) {
    return 'Tx signing failed. Please check wallet';
  }

  if (lower.includes('tx_insufficient_fee') || lower.includes('insufficient funds for gas')) {
    return 'Insufficient native token balance to cover gas fees.';
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
    return 'User cancelled the transaction';
  }

  if (processedMessage.length > 150) {
    if (lower.includes('balance') || lower.includes('underfunded')) {
      return 'Transaction failed due to insufficient balance or reserve requirements.';
    }
    return 'The transaction failed. Please ensure your wallet is funded and try again.';
  }

  return processedMessage;
}

export function parseWalletError(error: unknown): string {
  console.error('[parseWalletError]', error);

  if (!error) return 'Something went wrong. Please try again.';

  let rawMsg = '';
  let errCode: any = null;

  if (typeof error === 'string') {
    rawMsg = error;
  } else if (typeof error === 'object') {
    const errObj = error as any;
    errCode = errObj.code || errObj.error?.code || errObj.info?.error?.code || errObj.originalError?.code;
    rawMsg =
      errObj.message ||
      errObj.originalError?.message ||
      errObj.reason ||
      errObj.error?.message ||
      errObj.data?.message ||
      errObj.details ||
      errObj.description ||
      (errObj.error && typeof errObj.error === 'string' ? errObj.error : '') ||
      String(error);
  } else {
    rawMsg = String(error);
  }

  // Handle user rejection explicitly first
  if (
    errCode === 4001 ||
    /user rejected|user cancelled|user declined|user denied|rejected by user|cancelled by user|transaction rejected|request rejected|disapproved|connection rejected/i.test(rawMsg)
  ) {
    return 'User cancelled the transaction';
  }

  let message = extractCleanMessage(rawMsg);

  if (message.length > 0 && message !== '[object Object]') {
    // If the message is specifically about WalletConnect, let's ensure it's clean and return it
    if (/walletconnect|wallet-connect|connector/i.test(message)) {
      const cleanWc = message
        .replace(/^walletconnect:?/i, '')
        .replace(/^connector:?/i, '')
        .trim();
      if (cleanWc) return cleanWc;
    }

    const translated = translateErrorMessage(message);
    if (translated) {
      return translated;
    }

    // If no translation found but we have a clean, non-noisy message, return it!
    if (!isNoisy(message)) {
      return message;
    }
  }

  return 'Something went wrong. Please try again.';
}

export function parseSwapError(error: any): string {
  console.error('[SwapError]', error);
  const rawMsg: string = error?.message || error?.originalError?.message || '';
  const errCode = error?.code || error?.error?.code || error?.info?.error?.code || error?.originalError?.code;

  const isWalletOrConnectError = 
    errCode === 4001 || 
    errCode === -32603 || 
    /user rejected|user cancelled|user declined|user denied|rejected by user|cancelled by user|transaction rejected|request rejected|disapproved|connection rejected|walletconnect|wallet-connect|connector/i.test(rawMsg) ||
    /user rejected|user cancelled|user declined|user denied|rejected by user|cancelled by user|transaction rejected|request rejected|disapproved|connection rejected|walletconnect|wallet-connect|connector/i.test(String(error));

  if (
    isWalletOrConnectError ||
    (rawMsg &&
      (rawMsg.includes('error=') ||
        rawMsg.includes('UNKNOWN_ERROR') ||
        rawMsg.includes('payload=') ||
        rawMsg.includes('jsonrpc') ||
        rawMsg.includes('processing response error')))
  ) {
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

  message = extractCleanMessage(message);

  const translated = translateErrorMessage(message);
  return translated || 'Swap failed. Please try again.';
}
