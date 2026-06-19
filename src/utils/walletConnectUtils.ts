import { sendCustomNotification } from '../service/notificationService';

/**
 * @param minutes - How many minutes until the request expires (default: 2)
 * @returns Unix timestamp in seconds
 *
 * @example
 * provider.client.request({
 *   topic,
 *   chainId,
 *   expiry: getRequestExpiry(2),
 *   request: { method: 'eth_sendTransaction', params: [txParams] },
 * });
 */
export function getRequestExpiry(minutes = 2): number {
  return Math.floor(Date.now() / 1000) + minutes * 60;
}

function isWalletConnectProvider(provider: any): boolean {
  return !!(provider?.client && provider?.session && typeof provider.client.request === 'function');
}

/**
 * @param provider  The EVM wallet provider
 * @param chainId   Numeric chain ID (e.g. 1, 42161)
 * @param txParams  The transaction params object
 * @returns Transaction hash
 */

let isPending = false;

export async function sendEVMTransaction(
  provider: any,
  chainId: number | string,
  txParams: Record<string, any>
): Promise<string> {

  // if (isPending) {
  //   throw new Error('A transaction is already pending. Please wait.');
  // }

  // isPending = true;

  try {
    const token = localStorage.getItem('device_token');
    if (token) {
      sendCustomNotification(token, {
        title: 'Transaction Request',
        body: `Please confirm the EVM transaction to ${txParams.to || ''}`,
      }).catch(err => {
        console.error(err);
      });
    }
    const numericChainId = Number(chainId);

    if (isWalletConnectProvider(provider)) {
      const topic = provider.session?.topic;
      if (!topic) throw new Error('No WalletConnect session topic');

      return await provider.client.request({
        topic,
        chainId: `eip155:${numericChainId}`,
        request: {
          method: 'eth_sendTransaction',
          params: [txParams],
        },
      }) as Promise<string>;
    }

    return await provider.request({
      method: 'eth_sendTransaction',
      params: [txParams],
    });

  } finally {
    isPending = false;
  }
}
