

import { sendCustomNotification } from '../service/notificationService';

export function getRequestExpiry(minutes = 2): number {
  return Math.floor(Date.now() / 1000) + minutes * 60;
}

function isWalletConnectProvider(provider: any): boolean {
  return !!(provider?.client && provider?.session && typeof provider.client.request === 'function');
}

export async function notifyWalletSignRequest(to?: string): Promise<void> {
  const token = localStorage.getItem('device_token');
  if (!token) return;

  await sendCustomNotification(token, {
    title: 'Wallet Signature Required',
    body: `Open your wallet to sign the EVM transaction${to ? ` to ${to}` : ''}.`,
  }).catch(console.error);
}

export async function sendEVMTransaction(
  provider: any,
  chainId: number | string,
  txParams: Record<string, any>
): Promise<string> {

  // if (isPending) {
  //   throw new Error('A transaction is already pending. Please wait.');
  // }
  const numericChainId = Number(chainId);

  if (isWalletConnectProvider(provider)) {
    const topic = provider.session?.topic;
    if (!topic) throw new Error('No WalletConnect session topic');

    await notifyWalletSignRequest(txParams.to);
    return await provider.client.request({
      topic,
      chainId: `eip155:${numericChainId}`,
      request: {
        method: 'eth_sendTransaction',
        params: [txParams],
      },
    }) as Promise<string>;
  }

  await notifyWalletSignRequest(txParams.to);
  return await provider.request({
    method: 'eth_sendTransaction',
    params: [txParams],
  });
}