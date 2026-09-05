import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGlobalTxStore } from '../../modules/walletconnect/store/globalTxStore';
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

    beforeEach(() => {
      useGlobalTxStore.getState().clearPending();
    });

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
        request: expect.objectContaining({ method: 'eth_sendTransaction', params: [txParams] }),
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

  describe('isMobileDevice & isInAppBrowser', () => {
    const originalUserAgent = navigator.userAgent;

    afterEach(() => {
      Object.defineProperty(navigator, 'userAgent', {
        value: originalUserAgent,
        configurable: true,
      });
    });

    it('detects iPhone / Android user agents as mobile', async () => {
      const { isMobileDevice } = await import('../walletConnectUtils');
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
        configurable: true,
      });
      expect(isMobileDevice()).toBe(true);
    });

    it('detects desktop user agents as non-mobile', async () => {
      const { isMobileDevice } = await import('../walletConnectUtils');
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        configurable: true,
      });
      expect(isMobileDevice()).toBe(false);
    });

    it('detects in-app browsers', async () => {
      const { isInAppBrowser } = await import('../walletConnectUtils');
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 TrustWallet/Android',
        configurable: true,
      });
      expect(isInAppBrowser()).toBe(true);
    });
  });

  describe('formatWalletDeepLink & getWalletRedirectUrls', () => {
    const testUri = 'wc:7f6e3c2d-test@2?relay-protocol=irn&symKey=abc123xyz';

    it('formats Trust Wallet universal link correctly', async () => {
      const { formatWalletDeepLink } = await import('../walletConnectUtils');
      const link = formatWalletDeepLink('trust', testUri);
      expect(link).toBe(`https://link.trustwallet.com/wc?uri=${encodeURIComponent(testUri)}`);
    });

    it('formats MetaMask universal link correctly', async () => {
      const { formatWalletDeepLink } = await import('../walletConnectUtils');
      const link = formatWalletDeepLink('metamask', testUri);
      expect(link).toBe(`https://metamask.app.link/wc?uri=${encodeURIComponent(testUri)}`);
    });

    it('formats Rainbow universal link correctly', async () => {
      const { formatWalletDeepLink } = await import('../walletConnectUtils');
      const link = formatWalletDeepLink('rainbow', testUri);
      expect(link).toBe(`https://rnbwapp.com/wc?uri=${encodeURIComponent(testUri)}`);
    });

    it('returns raw URI for unknown or generic walletconnect id', async () => {
      const { formatWalletDeepLink } = await import('../walletConnectUtils');
      const link = formatWalletDeepLink('walletconnect', testUri);
      expect(link).toBe(testUri);
    });

    it('returns both universal and native URLs in getWalletRedirectUrls', async () => {
      const { getWalletRedirectUrls } = await import('../walletConnectUtils');
      const urls = getWalletRedirectUrls('trust', testUri);
      expect(urls.universal).toBe(
        `https://link.trustwallet.com/wc?uri=${encodeURIComponent(testUri)}`
      );
      expect(urls.native).toBe(`trust://wc?uri=${encodeURIComponent(testUri)}`);
      expect(urls.formattedUrl).toBeDefined();
    });
  });
});
