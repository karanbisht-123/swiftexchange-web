export function parseSwapError(error: any): string {
  console.error(error, "error-----------------------------")


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

  //  Rango style array responses where one or more items have ok: false
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
        else if (Array.isArray(parsed) && parsed.length > 0) {
          const errItem = parsed.find((i: any) => i.error || i.message);
          if (errItem) message = String(errItem.error || errItem.message);
        }
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

  // Rango specific balance/fee reasons
  if (errorMessageLower.includes('balance is empty') || errorMessageLower.includes('insufficient')) {
    if (errorMessageLower.includes('fee')) {
      if (
        errorMessageLower.includes('required') ||
        errorMessageLower.includes('current') ||
        errorMessageLower.includes('need') ||
        errorMessageLower.includes('have')
      ) {
        return processedMessage;
      }
      return 'Insufficient native tokens for gas fees.';
    }
    return processedMessage;
  }

  if (
    errorMessageLower.includes('insufficient funds') ||
    errorMessageLower.includes('insufficient eth balance') ||
    errorMessageLower.includes('insufficient eth for gas fees') ||
    errorMessageLower.includes('insufficient balance')
  ) {
    if (
      errorMessageLower.includes('need') ||
      errorMessageLower.includes('have') ||
      errorMessageLower.includes('required')
    ) {
      return processedMessage;
    }
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

  // Stellar specific errors
  if (
    errorMessageLower.includes('tx_bad_seq') ||
    errorMessageLower.includes('sequence_mismatch') ||
    errorMessageLower.includes('bad sequence')
  ) {
    return 'Transaction sequence number mismatch. This can happen if another transaction was recently submitted. Please try again.';
  }

  if (errorMessageLower.includes('op_no_trust')) {
    return 'Recipient does not have a trustline for this asset.';
  }

  if (errorMessageLower.includes('tx_insufficient_balance')) {
    return 'Insufficient balance to cover transaction fees and minimum reserve.';
  }

  return processedMessage || 'Swap failed. Please try again.';
}
