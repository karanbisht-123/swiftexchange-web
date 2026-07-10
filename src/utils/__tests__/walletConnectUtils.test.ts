import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sendCustomNotification } from '../../service/notificationService';
import {
  getRequestExpiry,
  notifyWalletSignRequest,
  sendEVMTransaction,
} from '../walletConnectUtils';

vi.mock('../../service/notificationService', () => ({
  sendCustomNotification: vi.fn().mockResolvedValue({ success: true }),
}));

describe('walletConnectUtils', () => {
  describe('getRequestExpiry', () => {
    it('returns a unix timestamp roughly 2 minutes from now by default', () => {
      const before = Math.floor(Date.now() / 1000);
      const expiry = getRequestExpiry();
      const after = Math.floor(Date.now() / 1000);
      expect(expiry).toBeGreaterThanOrEqual(before + 120);
      expect(expiry).toBeLessThanOrEqual(after + 120);
    });

    it('respects a custom minutes argument', () => {
      const before = Math.floor(Date.now() / 1000);
      const expiry = getRequestExpiry(5);
      expect(expiry).toBeGreaterThanOrEqual(before + 300);
    });
  });

  describe('notifyWalletSignRequest', () => {
    beforeEach(() => {
      vi.mocked(sendCustomNotification).mockResolvedValue({ success: true });
      localStorage.clear();
    });

    it('does nothing when no device_token is in localStorage', async () => {
      await notifyWalletSignRequest('0xRecipient');
      expect(sendCustomNotification).not.toHaveBeenCalled();
    });

    it('calls sendCustomNotification with a generic body when no recipient is given', async () => {
      localStorage.setItem('device_token', 'test-token');
      await notifyWalletSignRequest();
      expect(sendCustomNotification).toHaveBeenCalledWith('test-token', {
        title: 'Wallet Signature Required',
        body: 'Open your wallet to sign the EVM transaction.',
      });
    });

    it('includes the recipient address in the notification body', async () => {
      localStorage.setItem('device_token', 'test-token');
      await notifyWalletSignRequest('0xDeadBeef');
      expect(sendCustomNotification).toHaveBeenCalledWith('test-token', {
        title: 'Wallet Signature Required',
        body: 'Open your wallet to sign the EVM transaction to 0xDeadBeef.',
      });
    });

    it('swallows errors from sendCustomNotification', async () => {
      localStorage.setItem('device_token', 'test-token');
      vi.mocked(sendCustomNotification).mockRejectedValue(new Error('Push failed'));
      await expect(notifyWalletSignRequest()).resolves.not.toThrow();
    });
  });

  describe('sendEVMTransaction', () => {
    const txParams = { to: '0xRecipient', value: '0x0' };

    it('sends via provider.request for a standard EIP-1193 provider', async () => {
      const provider = {
        request: vi.fn().mockResolvedValue('0xTXHASH'),
      };
      const hash = await sendEVMTransaction(provider, 1, txParams);
      expect(hash).toBe('0xTXHASH');
      expect(provider.request).toHaveBeenCalledWith({
        method: 'eth_sendTransaction',
        params: [txParams],
      });
    });

    it('sends via provider.client.request for a WalletConnect provider', async () => {
      const provider = {
        client: { request: vi.fn().mockResolvedValue('0xWCHASH') },
        session: { topic: 'abc-topic' },
      };
      const hash = await sendEVMTransaction(provider, 1, txParams);
      expect(hash).toBe('0xWCHASH');
      expect(provider.client.request).toHaveBeenCalledWith({
        topic: 'abc-topic',
        chainId: 'eip155:1',
        request: { method: 'eth_sendTransaction', params: [txParams] },
      });
    });

    it('throws when WalletConnect session has no topic', async () => {
      const provider = {
        client: { request: vi.fn() },
        session: {},
      };
      await expect(sendEVMTransaction(provider, 1, txParams)).rejects.toThrow(
        'No WalletConnect session topic'
      );
    });

    it('converts a string chainId to numeric for the eip155 prefix', async () => {
      const provider = {
        client: { request: vi.fn().mockResolvedValue('0xHASH') },
        session: { topic: 'topic-xyz' },
      };
      await sendEVMTransaction(provider, '137', txParams);
      expect(provider.client.request).toHaveBeenCalledWith(
        expect.objectContaining({ chainId: 'eip155:137' })
      );
    });
  });
});
