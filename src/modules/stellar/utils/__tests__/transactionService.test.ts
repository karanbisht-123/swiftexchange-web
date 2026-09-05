import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sendCustomNotification } from '../../../../service/notificationService';
import { StellarSequenceTracker } from '../StellarSequenceTracker';
import { signAndSubmitTransaction } from '../transactionService';

const { MockTransaction, MockHorizonServer, mockLoadAccount } = vi.hoisted(() => {
  const mockLoadAccount = vi.fn();

  class MockTransaction {
    source: string;
    sequence: string;
    tx: { _attributes: { seqNum: any } };
    _envelope: any;
    passphrase: string;
    xdrString: string;

    constructor(xdr: string, passphrase: string) {
      this.xdrString = xdr;
      this.passphrase = passphrase;
      this.source = 'GB1234567890SOURCEADDRESS';
      this.sequence = '100';
      this.tx = {
        _attributes: {
          seqNum: { toString: () => this.sequence },
        },
      };
    }

    toXDR() {
      return `mutated_${this.tx._attributes.seqNum?.toString() || this.sequence}`;
    }

    hash() {
      return {
        toString: () => 'mock_computed_tx_hash_hex',
      };
    }
  }

  class MockHorizonServer {
    url: string;
    constructor(url: string) {
      this.url = url;
    }
    loadAccount = mockLoadAccount;
  }

  return { MockTransaction, MockHorizonServer, mockLoadAccount };
});

vi.mock('@stellar/stellar-sdk', () => ({
  Transaction: MockTransaction,
  Horizon: {
    Server: MockHorizonServer,
  },
  xdr: {
    SequenceNumber: {
      fromString: (seq: string) => ({
        toString: () => seq,
      }),
    },
  },
}));

vi.mock('../../../../service/notificationService', () => ({
  sendCustomNotification: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../../../walletconnect/config/chains', () => ({
  getStellarConfig: vi.fn((network: string) => ({
    network: network === 'public' || network === 'mainnet' ? 'PUBLIC' : 'TESTNET',
    networkPassphrase: 'Test SDF Network ; September 2015',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    chainId: 'testnet',
  })),
}));

describe('transactionService', () => {
  const testAddress = 'GB1234567890SOURCEADDRESS';
  const defaultParams = {
    xdr: 'AAAA_VALID_BASE64_XDR_MOCK',
    network: 'testnet',
    networkPassphrase: 'Test SDF Network ; September 2015',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    StellarSequenceTracker.reset(testAddress);

    mockLoadAccount.mockResolvedValue({
      sequenceNumber: () => '99',
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hash: 'horizon_tx_hash_12345' }),
    });
  });

  describe('Extension Provider Flow', () => {
    it('successfully signs and submits via extension when provider returns string XDR', async () => {
      const mockProvider = {
        signTransaction: vi.fn().mockResolvedValue('SIGNED_XDR_STRING'),
      };

      const result = await signAndSubmitTransaction({
        ...defaultParams,
        provider: mockProvider,
      });

      expect(mockProvider.signTransaction).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ network: 'testnet' })
      );
      expect(global.fetch).toHaveBeenCalledWith(
        'https://horizon-testnet.stellar.org/transactions',
        expect.objectContaining({ method: 'POST' })
      );
      expect(result).toEqual({
        success: true,
        hash: 'horizon_tx_hash_12345',
      });
    });

    it('successfully signs and submits via extension when provider returns signedTxXdr object', async () => {
      const mockProvider = {
        signTransaction: vi.fn().mockResolvedValue({ signedTxXdr: 'SIGNED_TX_OBJECT' }),
      };

      const result = await signAndSubmitTransaction({
        ...defaultParams,
        provider: mockProvider,
      });

      expect(result).toEqual({
        success: true,
        hash: 'horizon_tx_hash_12345',
      });
    });

    it('handles extension signing failure when no signed XDR is returned', async () => {
      const mockProvider = {
        signTransaction: vi.fn().mockResolvedValue(null),
      };

      const result = await signAndSubmitTransaction({
        ...defaultParams,
        provider: mockProvider,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Extension failed to sign');
    });
  });

  describe('WalletConnect Provider Flow', () => {
    it('submits via WalletConnect request and returns returned hash', async () => {
      const mockProvider = {
        client: {
          request: vi.fn().mockResolvedValue({
            status: 'success',
            hash: 'wc_submitted_tx_hash',
          }),
        },
        session: { topic: 'topic_123' },
      };

      const result = await signAndSubmitTransaction({
        ...defaultParams,
        provider: mockProvider,
      });

      expect(mockProvider.client.request).toHaveBeenCalledWith({
        topic: 'topic_123',
        chainId: 'stellar:testnet',
        request: {
          method: 'stellar_signAndSubmitXDR',
          params: expect.objectContaining({
            network: 'TESTNET',
            networkPassphrase: defaultParams.networkPassphrase,
          }),
        },
      });
      expect(result).toEqual({
        success: true,
        hash: 'wc_submitted_tx_hash',
      });
    });

    it('submits returned signedXDR to Horizon if WalletConnect only signs', async () => {
      const mockProvider = {
        client: {
          request: vi.fn().mockResolvedValue({
            signedXDR: 'SIGNED_WC_XDR',
          }),
        },
        session: { topic: 'topic_abc' },
      };

      const result = await signAndSubmitTransaction({
        ...defaultParams,
        provider: mockProvider,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://horizon-testnet.stellar.org/transactions',
        expect.any(Object)
      );
      expect(result).toEqual({
        success: true,
        hash: 'horizon_tx_hash_12345',
      });
    });

    it('handles plain string hash from WalletConnect response', async () => {
      const mockProvider = {
        client: {
          request: vi.fn().mockResolvedValue('raw_wc_hash_string'),
        },
        session: { topic: 'topic_plain' },
      };

      const result = await signAndSubmitTransaction({
        ...defaultParams,
        provider: mockProvider,
      });

      expect(result).toEqual({
        success: true,
        hash: 'raw_wc_hash_string',
      });
    });

    it('returns computed hash fallback when status is success but hash is missing', async () => {
      const mockProvider = {
        client: {
          request: vi.fn().mockResolvedValue({
            status: 'success',
          }),
        },
        session: { topic: 'topic_fallback' },
      };

      const result = await signAndSubmitTransaction({
        ...defaultParams,
        provider: mockProvider,
      });

      expect(result).toEqual({
        success: true,
        hash: 'mock_computed_tx_hash_hex',
      });
    });
  });

  describe('Generic Provider Flow (provider.request)', () => {
    it('uses provider.request and falls back to computed transaction hash', async () => {
      const mockProvider = {
        request: vi.fn().mockResolvedValue({ status: 'success' }),
      };

      const result = await signAndSubmitTransaction({
        ...defaultParams,
        provider: mockProvider,
      });

      expect(mockProvider.request).toHaveBeenCalledWith({
        method: 'stellar_signAndSubmitXDR',
        params: expect.objectContaining({
          network: 'TESTNET',
        }),
      });
      expect(result).toEqual({
        success: true,
        hash: 'mock_computed_tx_hash_hex',
      });
    });

    it('handles generic provider rejection', async () => {
      const mockProvider = {
        request: vi.fn().mockResolvedValue({ status: 'error' }),
      };

      const result = await signAndSubmitTransaction({
        ...defaultParams,
        provider: mockProvider,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Transaction failed');
    });
  });

  describe('Horizon Submission Error Handling', () => {
    it('formats detailed error message from extras.result_codes', async () => {
      const mockProvider = {
        signTransaction: vi.fn().mockResolvedValue('SIGNED_XDR'),
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          extras: {
            result_codes: {
              transaction: 'tx_failed',
              operations: ['op_underfunded', 'op_low_reserve'],
            },
          },
        }),
      });

      const result = await signAndSubmitTransaction({
        ...defaultParams,
        provider: mockProvider,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        'Stellar submission failed: tx_failed — op_underfunded, op_low_reserve'
      );
    });

    it('falls back to title or default message if result_codes is absent', async () => {
      const mockProvider = {
        signTransaction: vi.fn().mockResolvedValue('SIGNED_XDR'),
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          title: 'Transaction Malformed',
        }),
      });

      const result = await signAndSubmitTransaction({
        ...defaultParams,
        provider: mockProvider,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Transaction Malformed');
    });
  });

  describe('Sequence Rollback and Bad Sequence Handling', () => {
    it('resets tracker when submission fails with tx_bad_seq error', async () => {
      const resetSpy = vi.spyOn(StellarSequenceTracker, 'reset');
      const rollbackSpy = vi.spyOn(StellarSequenceTracker, 'rollbackSequence');

      const mockProvider = {
        signTransaction: vi.fn().mockRejectedValue(new Error('tx_bad_seq: bad sequence number')),
      };

      const result = await signAndSubmitTransaction({
        ...defaultParams,
        provider: mockProvider,
      });

      expect(result.success).toBe(false);
      expect(rollbackSpy).toHaveBeenCalledWith(testAddress, '99');
      expect(resetSpy).toHaveBeenCalledWith(testAddress);
    });

    it('fails gracefully when no provider is given', async () => {
      const result = await signAndSubmitTransaction({
        ...defaultParams,
        provider: null,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No compatible Stellar wallet provider found');
    });
  });

  describe('Wallet Push Notification', () => {
    it('triggers sendCustomNotification when device_token is stored in localStorage', async () => {
      localStorage.setItem('device_token', 'sample_fcm_token_123');

      const mockProvider = {
        signTransaction: vi.fn().mockResolvedValue('SIGNED_XDR'),
      };

      await signAndSubmitTransaction({
        ...defaultParams,
        provider: mockProvider,
      });

      expect(sendCustomNotification).toHaveBeenCalledWith(
        'sample_fcm_token_123',
        expect.objectContaining({
          title: 'Wallet Signature Required',
        })
      );
    });

    it('does not trigger notification when device_token is missing', async () => {
      const mockProvider = {
        signTransaction: vi.fn().mockResolvedValue('SIGNED_XDR'),
      };

      await signAndSubmitTransaction({
        ...defaultParams,
        provider: mockProvider,
      });

      expect(sendCustomNotification).not.toHaveBeenCalled();
    });
  });
});
