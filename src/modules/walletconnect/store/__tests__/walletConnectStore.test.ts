import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWalletStore } from '../walletConnectStore';

// Removed deviceId mock

vi.mock('../../../../utils/fingerprint', () => ({
  prewarmFingerprint: vi.fn(),
  getFingerprint: vi.fn().mockResolvedValue('mocked-fingerprint'),
}));

vi.mock('../../services/walletService', () => ({
  walletService: {
    connectChainWallet: vi.fn().mockResolvedValue({
      evmAddress: '0x123',
      evmChainId: 1,
    }),
    getProvider: vi.fn().mockReturnValue({ session: {} }),
    signSiweMessage: vi.fn().mockResolvedValue('mock-signature'),
  },
}));

vi.mock('../../services/Siweauthservice', () => ({
  buildSiweMessage: vi.fn().mockResolvedValue('mock-message'),
  verifySiwe: vi.fn().mockResolvedValue({
    accessToken: 'mock-access',
    expiresIn: 3600,
    refreshToken: 'mock-refresh',
  }),
  restoreAuthSession: vi.fn().mockResolvedValue(null),
  setAccessToken: vi.fn(),
}));

describe('walletConnectStore', () => {
  beforeEach(() => {
    useWalletStore.setState({
      connectedWallets: {
        evm: {
          type: 'evm',
          walletId: 'metamask',
          address: '0x123',
          chainId: 1,
        },
      },
      isModalOpen: false,
    });
    vi.clearAllMocks();
  });

  it('authenticates EVM and calls verifySiwe with deviceId and fingerprint', async () => {
    const { verifySiwe } = await import('../../services/Siweauthservice');

    await useWalletStore.getState().authenticateEvm();

    expect(verifySiwe).toHaveBeenCalledWith(
      'mock-message',
      'mock-signature',
      expect.objectContaining({
        address: '0x123',
        chainId: 1,
        asLink: false,
        fingerprint: 'mocked-fingerprint',
      })
    );
  });

  it('calls prewarmFingerprint when openModal is called', async () => {
    const { prewarmFingerprint } = await import('../../../../utils/fingerprint');
    useWalletStore.getState().openModal();
    expect(prewarmFingerprint).toHaveBeenCalled();
    expect(useWalletStore.getState().isModalOpen).toBe(true);
  });
});
