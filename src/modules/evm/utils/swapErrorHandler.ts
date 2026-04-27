export function parseSwapError(error: any): string {
  console.error('[Swap Error]', {
    code: error?.code,
    message: error?.message,
    originalError: error,
  });

  let message = '';
  const data = error?.response?.data || error?.data || error;
  if (data?.diagnosisMessages && Array.isArray(data.diagnosisMessages) && data.diagnosisMessages.length > 0) {
    return String(data.diagnosisMessages[0]);
  }
  if (Array.isArray(data) && data.length > 0) {
    if (data[0]?.error) message = String(data[0].error);
    else if (data[0]?.message) message = String(data[0].message);
  }
  if (!message && typeof data === 'object' && data !== null) {
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
  if (!message && typeof error === 'object' && error !== null) {
    if (error.message) {
      message = error.message;
      if (message.includes('{"') || message.includes('error=')) {
        try {
          const jsonMatch = message.match(/error=({.*})/);
          const jsonToParse = jsonMatch ? jsonMatch[1] : message;
          const parsed = JSON.parse(jsonToParse);

          const deepError = parsed.error || parsed;
          const body = deepError.body ? JSON.parse(deepError.body) : null;

          if (body?.error?.message) message = body.error.message;
          else if (deepError.message) message = deepError.message;
          else if (parsed.reason) message = parsed.reason;
        } catch (e) {
          // Fallback to original message if parsing fails
        }
      }
    } else {
      try {
        const parsed = JSON.parse(error.toString());
        if (parsed.message) message = parsed.message;
        else if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.error) message = String(parsed[0].error);
      } catch (e) {
        message = error.toString();
      }
    }
  }

  if (!message) {
    message = error ? String(error) : 'Swap failed. Please try again.';
  }
  let processedMessage = message
    .replace(/^API error: Bad Request - /i, '')
    .replace(/^API error: /i, '')
    .replace(/^Error: /i, '')
    .replace(/^ethers-user-denied: /i, '')
    .replace(' [object Object]', '');

  const errorMessageLower = processedMessage.toLowerCase();

  if (
    errorMessageLower.includes('insufficient funds') ||
    errorMessageLower.includes('insufficient eth balance') ||
    errorMessageLower.includes('insufficient eth for gas fees') ||
    errorMessageLower.includes('insufficient balance')
  ) {
    if (errorMessageLower.includes('need') && errorMessageLower.includes('have')) return processedMessage;
    return 'Insufficient native tokens to cover network gas fees.';
  }

  // Gas Estimation & Execution failures
  if (
    errorMessageLower.includes('cannot estimate gas') ||
    errorMessageLower.includes('gas estimation failed') ||
    errorMessageLower.includes('unpredictable_gas_limit')
  ) {
    if (errorMessageLower.includes('gas required exceeds allowance')) {
      return 'The transaction is likely to fail. This often happens if you have insufficient token balance for the transfer or the contract execution reverted.';
    }
    return 'Transaction gas estimation failed. This usually happens if the transaction will fail on-chain. Please check your balance or parameters.';
  }

  if (
    error?.code === 4001 ||
    error?.code === 'ACTION_REJECTED' ||
    errorMessageLower.includes('user rejected') ||
    errorMessageLower.includes('rejected by user') ||
    errorMessageLower.includes('transaction rejected')
  ) {
    return 'Transaction was cancelled during confirmation.';
  }

  // Prevent leaking RPC URLs
  if (
    processedMessage.includes('http://') ||
    processedMessage.includes('https://') ||
    errorMessageLower.includes('rpc error')
  ) {
    const revertMatch = processedMessage.match(/execution reverted:?\s*([^"(]+)/i);
    if (revertMatch && revertMatch[1].trim()) {
      return `Transaction failed: ${revertMatch[1].trim()}`;
    }
    return 'Transaction failed due to a network provider error. Please try again.';
  }

  return processedMessage || 'Swap failed. Please try again.';
}
