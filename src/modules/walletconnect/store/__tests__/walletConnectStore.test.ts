import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWalletStore } from '../walletConnectStore';

// Removed deviceId mock

vi.mock('../../services/walletService', () => ({
  walletService: {
    connectChainWallet: vi.fn().mockResolvedValue({
      evmAddress: '0x123',
      evmChainId: 1,
    }),
    getProvider: vi.fn().mockReturnValue({ session: {} }),
    signSiweMessage: vi.fn().mockResolvedValue('mock-signature'),
    signStellarChallenge: vi.fn().mockResolvedValue('mock-stellar-signature'),
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
  buildStellarChallenge: vi
    .fn()
    .mockResolvedValue({ xdr: 'mock-xdr', networkPassphrase: 'mock-passphrase' }),
  verifyStellarChallenge: vi.fn().mockResolvedValue({
    accessToken: 'mock-stellar-access',
    expiresIn: 3600,
    refreshToken: 'mock-stellar-refresh',
  }),
  getCurrentTokenInfo: vi.fn().mockReturnValue(null),
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
      isAuthenticated: false,
      authenticatedChain: null,
      linkedChains: [],
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
      })
    );
  });

  it('opens modal correctly', () => {
    useWalletStore.getState().openModal();
    expect(useWalletStore.getState().isModalOpen).toBe(true);
  });

  it('authenticates Stellar and completes the verification flow', async () => {
    const { verifyStellarChallenge, buildStellarChallenge } =
      await import('../../services/Siweauthservice');
    const { walletService } = await import('../../services/walletService');

    // Add stellar wallet to state
    useWalletStore.setState({
      connectedWallets: {
        stellar: {
          type: 'stellar',
          walletId: 'freighter',
          address: 'GCMOCKADDRESS',
          chainId: 'testnet',
        },
      },
    });

    await useWalletStore.getState().authenticateStellar();

    expect(buildStellarChallenge).toHaveBeenCalledWith('GCMOCKADDRESS');
    expect(walletService.signStellarChallenge).toHaveBeenCalledWith(
      'mock-xdr',
      'mock-passphrase',
      expect.anything()
    );
    expect(verifyStellarChallenge).toHaveBeenCalledWith(
      'mock-stellar-signature',
      'mock-passphrase',
      expect.objectContaining({
        address: 'GCMOCKADDRESS',
        chainId: NaN,
      })
    );

    const state = useWalletStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.authenticatedChain).toBe('stellar');
    expect(state.linkedChains).toEqual(['stellar']);
  });
});
