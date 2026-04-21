export function parseSwapError(error: any): string {
  console.error('[Swap Error]', {
    code: error?.code,
    message: error?.message,
    originalError: error,
  });

  let message = '';

  // Handle structured backend error objects
  if (typeof error === 'object' && error !== null) {
    if (error.message) {
      message = error.message;
    } else if (error.info?.error?.message) {
      message = error.info.error.message;
    } else if (error.error?.message) {
      message = error.error.message;
    } else if (error.data?.message) {
      message = error.data.message;
    } else {
      try {
        // Handle stringified error objects
        const parsed = JSON.parse(error.toString());
        if (parsed.message) message = parsed.message;
      } catch (e) {
        message = error.toString();
      }
    }
  } else {
    message = String(error);
  }

  const errorMessageLower = message.toLowerCase();

  // Priority: Informative API/Backend Errors (Return as-is to preserve details like Have: / Need:)
  if (
    errorMessageLower.includes('api error') ||
    errorMessageLower.includes('bad request') ||
    (errorMessageLower.includes('insufficient') &&
      errorMessageLower.includes('have:') &&
      errorMessageLower.includes('need:'))
  ) {
    // If it's a specific Insufficient balance error with details, return it directly
    // Stripping generic prefixes but keeping the informative details intact
    return message
      .replace(/^API error: Bad Request - /i, '')
      .replace(/^API error: /i, '')
      .replace(/^Error: /i, '');
  }

  // User rejection
  if (
    error?.code === 4001 ||
    error?.code === 'ACTION_REJECTED' ||
    errorMessageLower.includes('user rejected') ||
    errorMessageLower.includes('rejected by user') ||
    errorMessageLower.includes('transaction rejected')
  ) {
    if (errorMessageLower.includes('invalid transaction key')) {
      return `Wallet Error: ${message}. This is likely a compatibility issue with your wallet app's transaction handling.`;
    }
    return 'Transaction was cancelled during confirmation.';
  }

  // Insufficient Balance & Gas Fees (Structured)
  const balanceMatch = message.match(/Insufficient (\w+) (?:balance|for gas fees)\. Have: ([\d.]+).*, Need: ~?([\d.]+)/i);
  if (balanceMatch) {
    const asset = balanceMatch[1];
    const have = balanceMatch[2];
    const need = balanceMatch[3];
    return `Insufficient ${asset} for gas fees. You have ${parseFloat(have).toFixed(6)} ${asset} but need ~${parseFloat(need).toFixed(6)} ${asset}.`;
  }

  if (
    errorMessageLower.includes('insufficient funds') ||
    errorMessageLower.includes('insufficient eth balance') ||
    (errorMessageLower.includes('insufficient') && errorMessageLower.includes('balance')) ||
    errorMessageLower.includes('insufficient eth for gas fees')
  ) {
    return 'You do not have enough native tokens to cover the network gas fees for this swap.';
  }

  // Gas Estimation Issues
  if (
    errorMessageLower.includes('gas required exceeds allowance') ||
    errorMessageLower.includes('cannot estimate gas') ||
    errorMessageLower.includes('gas estimation failed') ||
    (errorMessageLower.includes('transaction failed') && errorMessageLower.includes('gas'))
  ) {
    return 'Transaction could not estimate gas. Please check your balance or try a smaller amount.';
  }

  // API / Backend Errors
  if (errorMessageLower.includes('bad request') || errorMessageLower.includes('api error: 400')) {
    if (message.includes('Insufficient')) return message; // Re-use the message if it's specific
    return 'Swap request failed (Bad Request). Please try again with a different amount or slippage.';
  }

  // Liquidity issues
  if (
    errorMessageLower.includes('no liquidity') ||
    errorMessageLower.includes('insufficient liquidity') ||
    errorMessageLower.includes('execution price is too far')
  ) {
    return 'Insufficient liquidity or high price impact for this token pair.';
  }

  // Network issues
  if (
    errorMessageLower.includes('network error') ||
    errorMessageLower.includes('timeout') ||
    errorMessageLower.includes('failed to fetch')
  ) {
    return 'Network error. Please check your connection and try again.';
  }

  // Prevent leaking RPC URLs or raw ethers.js dumps
  if (
    message.includes('http://') || 
    message.includes('https://') || 
    errorMessageLower.includes('alchemy.com') ||
    errorMessageLower.includes('infura.io') ||
    errorMessageLower.includes('provider') ||
    errorMessageLower.includes('rpc error') ||
    errorMessageLower.includes('call revert exception') ||
    errorMessageLower.includes('unpredictable gas limit')
  ) {
    if (errorMessageLower.includes('insufficient funds')) {
      return 'You do not have enough native tokens to cover network gas fees.';
    }
    const revertMatch = message.match(/execution reverted:?\s*([^"(]+)/i);
    if (revertMatch && revertMatch[1].trim()) {
      return `Transaction failed: ${revertMatch[1].trim()}`;
    }
    return 'Transaction failed due to a network provider error. Please try again.';
  }

  // General fallback
  if (message && message !== 'user rejected action' && message !== 'Failed to execute swap' && !message.includes('[object Object]')) {
    return message.replace('ethers-user-denied: ', '').replace('Error: ', '');
  }

  return 'Swap failed. Please try again.';
}
