export function parseSwapError(error: any): string {
    console.error('[Swap Error]', {
        code: error?.code,
        message: error?.message,
        originalError: error,
    });

    let message = error?.message || '';

    // Ethers V6 nested errors
    if (error?.info?.error?.message) {
        message = error.info.error.message;
    }

    const errorMessageLower = message.toLowerCase();

    // 1. User Rejected Transaction
    if (
        error?.code === 4001 ||
        error?.code === 'ACTION_REJECTED' ||
        errorMessageLower.includes('user rejected') ||
        (errorMessageLower.includes('rejected by user') && !errorMessageLower.includes('invalid transaction key')) ||
        (errorMessageLower.includes('transaction rejected') && !errorMessageLower.includes('invalid transaction key'))
    ) {
        // Only return cancelled if it's truly a user cancel, not a formatting error wrapped in ACTION_REJECTED
        if (!errorMessageLower.includes('invalid transaction key')) {
            return 'Transaction was cancelled during confirmation.';
        }
    }

    if (
        errorMessageLower.includes('insufficient funds') ||
        errorMessageLower.includes('insufficient eth balance') ||
        (errorMessageLower.includes('insufficient') && errorMessageLower.includes('balance'))
    ) {
        return 'You do not have enough ETH to cover the gas fees for this swap.';
    }

    if (
        errorMessageLower.includes('gas required exceeds allowance') ||
        errorMessageLower.includes('cannot estimate gas') ||
        errorMessageLower.includes('gas estimation failed') ||
        (errorMessageLower.includes('transaction failed') && errorMessageLower.includes('gas'))
    ) {
        return 'Transaction could not estimate gas. Please check your ETH balance or try a smaller amount.';
    }

    if (
        errorMessageLower.includes('bad request') ||
        errorMessageLower.includes('api error: 400')
    ) {
        return 'Swap request failed. Please try again.';
    }

    if (
        errorMessageLower.includes('no liquidity') ||
        errorMessageLower.includes('insufficient liquidity')
    ) {
        return 'Insufficient liquidity for this token pair.';
    }

    if (
        errorMessageLower.includes('network error') ||
        errorMessageLower.includes('timeout') ||
        errorMessageLower.includes('failed to fetch')
    ) {
        return 'Network error. Please check your connection and try again.';
    }

    // Return the actual extracted error message if we have one, otherwise fallback
    if (message && message !== 'user rejected action' && message !== 'Failed to execute swap') {
        // Clean up ethers specific prefixes if possible
        return message.replace('ethers-user-denied: ', '').replace('Error: ', '');
    }

    return 'Swap failed. Please try again.';
}
