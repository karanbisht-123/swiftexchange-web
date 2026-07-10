import { toBech32 } from '@cosmjs/encoding';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildCosmosSigner,
  buildEvmSigner,
  buildUserAddresses,
  computeSplit,
  deriveCosmosAddress,
  dydxToNoble,
  fetchDydxWalletUsdcBalance,
  fetchDydxWalletUsdcBalanceHuman,
  formatBridgeDuration,
  getEvmSourceDenom,
  isInsufficientGasError,
  makeCosmosSignerWithPrefix,
  makeNobleSignerFromDydx,
  pollUntilBalance,
  sumEstimatedFeesUsd,
  sumNobleFeesUusdc,
  toAtomicAmount,
} from '../skipBridgeUtils';

const testBytes = new Uint8Array(20);
const validDydxAddress = toBech32('dydx', testBytes);
const validNobleAddress = toBech32('noble', testBytes);
const validOsmoAddress = toBech32('osmo', testBytes);

vi.mock('../../../evm/utils/Chainregistry', () => ({
  getTokenAddress: vi.fn((_chainId: any, symbol: string) => {
    if (symbol === 'USDC') return '0xUSDC';
    return undefined;
  }),
  getChainById: vi.fn((chainId: any) => {
    if (chainId === 1) return { slug: 'ethereum' };
    if (chainId === 137) return { slug: 'polygon' };
    return undefined;
  }),
}));

vi.mock('viem', () => ({
  createWalletClient: vi.fn(() => ({
    sendTransaction: vi.fn(() => Promise.resolve('tx_hash')),
  })),
  custom: vi.fn(() => ({})),
}));

describe('skipBridgeUtils', () => {
  describe('dydxToNoble', () => {
    it('converts dydx bech32 address to noble prefix', () => {
      const nobleAddress = dydxToNoble(validDydxAddress);
      expect(nobleAddress).toBe(validNobleAddress);
    });

    it('falls back to string replacement if decoding fails', () => {
      expect(dydxToNoble('dydx_invalid')).toBe('noble_invalid');
    });
  });

  describe('makeNobleSignerFromDydx', () => {
    it('wraps a dydx signer to return accounts with noble address prefix', async () => {
      const mockDydxSigner = {
        getAccounts: vi
          .fn()
          .mockResolvedValue([{ address: validDydxAddress, pubkey: new Uint8Array() }]),
        signDirect: vi.fn().mockResolvedValue('signed_doc'),
      };

      const nobleSigner = makeNobleSignerFromDydx(mockDydxSigner);
      const accounts = await nobleSigner.getAccounts();
      expect(accounts[0].address).toBe(validNobleAddress);

      const signResult = await nobleSigner.signDirect(validNobleAddress, {});
      expect(signResult).toBe('signed_doc');
      expect(mockDydxSigner.signDirect).toHaveBeenCalledWith(validDydxAddress, {});
    });
  });

  describe('getEvmSourceDenom', () => {
    it('handles Stellar networks and assets', () => {
      expect(getEvmSourceDenom('XLM', 'pubnet', undefined, true)).toBe('stellar-native');
      expect(getEvmSourceDenom('USDC', 'pubnet', 'GBALANCE')).toBe('stellar:GBALANCE');
      expect(getEvmSourceDenom('USDC', 'pubnet')).toBe('stellar:0xUSDC');
      expect(getEvmSourceDenom('UNKNOWN', 'pubnet')).toBe('stellar-native');
    });

    it('handles EVM native coins', () => {
      expect(getEvmSourceDenom('ETH', 1, undefined, true)).toBe('ethereum-native');
      expect(getEvmSourceDenom('ETH', 1, '0x0000000000000000000000000000000000000000')).toBe(
        'ethereum-native'
      );
    });

    it('handles EVM tokens', () => {
      expect(getEvmSourceDenom('USDC', 1, '0xUSDC_ADDRESS')).toBe('0xusdc_address');
      expect(getEvmSourceDenom('USDC', 137)).toBe('0xusdc');
    });
  });

  describe('toAtomicAmount', () => {
    it('converts to atomic representation based on decimals', () => {
      expect(toAtomicAmount(1.23, 'USDC')).toBe('1230000');
      expect(toAtomicAmount(1.23, 'ETH')).toBe('1230000000000000000');
      expect(toAtomicAmount(1.23, 'XLM', undefined, 'pubnet')).toBe('12300000');
      expect(toAtomicAmount(1.23, 'USDC', 8)).toBe('123000000');
    });

    it('returns zero for falsy or NaN amounts', () => {
      expect(toAtomicAmount(0, 'USDC')).toBe('0');
      expect(toAtomicAmount(NaN, 'USDC')).toBe('0');
    });
  });

  describe('formatBridgeDuration', () => {
    it('formats duration ranges correctly', () => {
      expect(formatBridgeDuration(20)).toBe('< 30s');
      expect(formatBridgeDuration(60)).toBe('~ 1 min');
      expect(formatBridgeDuration(180)).toBe('~ 3 min');
    });
  });

  describe('sumEstimatedFeesUsd', () => {
    it('sums fees correctly', () => {
      const fees = [{ usdAmount: '1.5' }, { usdAmount: '2.25' }, { usdAmount: null }];
      expect(sumEstimatedFeesUsd(fees)).toBe(3.75);
    });
  });

  describe('sumNobleFeesUusdc', () => {
    it('sums only Noble chain fees and converts them to atomic uusdc', () => {
      const fees = [
        { chainId: 'noble-1', usdAmount: '1.25' },
        { chainId: 'osmosis-1', usdAmount: '2.50' },
      ];
      expect(sumNobleFeesUusdc(fees)).toBe(1250000);
    });
  });

  describe('makeCosmosSignerWithPrefix', () => {
    it('wraps cosmos signer correctly', async () => {
      const mockDydxSigner = {
        getAccounts: vi.fn().mockResolvedValue([{ address: validDydxAddress }]),
        signDirect: vi.fn().mockResolvedValue('direct'),
        signAmino: vi.fn().mockResolvedValue('amino'),
      };
      const signer = makeCosmosSignerWithPrefix(mockDydxSigner, 'osmo');
      const accounts = await signer.getAccounts();
      expect(accounts[0].address).toBe(validOsmoAddress);

      expect(await signer.signDirect(validOsmoAddress, {})).toBe('direct');
      expect(await signer.signAmino(validOsmoAddress, {})).toBe('amino');
    });
  });

  describe('buildCosmosSigner', () => {
    it('returns original signer for dydx-mainnet-1', async () => {
      const rawSigner = { flag: 'raw' };
      const cosmosSignerBuilder = buildCosmosSigner(rawSigner);
      const res = await cosmosSignerBuilder('dydx-mainnet-1');
      expect(res).toBe(rawSigner);
    });

    it('returns custom signer prefix wrapper for others', async () => {
      const mockDydxSigner = {
        getAccounts: vi.fn().mockResolvedValue([{ address: validDydxAddress }]),
      };
      const cosmosSignerBuilder = buildCosmosSigner(mockDydxSigner);
      const res = await cosmosSignerBuilder('osmosis-1');
      const accounts = await res.getAccounts();
      expect(accounts[0].address).toBe(validOsmoAddress);
    });
  });

  describe('deriveCosmosAddress', () => {
    it('derives correct address based on target prefix', () => {
      expect(deriveCosmosAddress(validDydxAddress, 'osmo')).toBe(validOsmoAddress);
    });

    it('throws error for invalid address inputs', () => {
      expect(() => deriveCosmosAddress('invalid_address', 'osmo')).toThrow();
    });
  });

  describe('buildUserAddresses', () => {
    it('maps chain IDs to EVM and Cosmos addresses correctly', () => {
      const requiredChains = ['1', 'osmosis-1', 'noble-1'];
      const addresses = buildUserAddresses(requiredChains, {
        evmAddress: '0xAddress',
        dydxAddress: validDydxAddress,
      });

      expect(addresses).toEqual([
        { chainId: '1', address: '0xAddress' },
        { chainId: 'osmosis-1', address: validOsmoAddress },
        { chainId: 'noble-1', address: validNobleAddress },
      ]);
    });
  });

  describe('isInsufficientGasError', () => {
    it('identifies gas-related error reasons', () => {
      expect(isInsufficientGasError({ message: 'gas required exceeds allowance' })).toBe(true);
      expect(isInsufficientGasError({ message: 'insufficient funds for gas' })).toBe(true);
      expect(isInsufficientGasError({ message: 'some normal error' })).toBe(false);
    });
  });

  describe('fetchDydxWalletUsdcBalance', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('fetches USDC balance correctly from API', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          balances: [
            {
              denom: 'ibc/8E27BA2D5493AF5636760E354E46004562C46AB7EC0CC4C1CA14E9E20E2545B5',
              amount: '50000000',
            },
          ],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const bal = await fetchDydxWalletUsdcBalance('dydx_address');
      expect(bal).toBe(50000000);
    });

    it('returns zero when response is not ok or error happens', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
      const bal = await fetchDydxWalletUsdcBalance('dydx_address');
      expect(bal).toBe(0);
    });
  });

  describe('fetchDydxWalletUsdcBalanceHuman', () => {
    it('returns human-readable balance', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            balances: [
              {
                denom: 'ibc/8E27BA2D5493AF5636760E354E46004562C46AB7EC0CC4C1CA14E9E20E2545B5',
                amount: '12500000',
              },
            ],
          }),
        })
      );
      const bal = await fetchDydxWalletUsdcBalanceHuman('dydx_address');
      expect(bal).toBe(12.5);
    });
  });

  describe('computeSplit', () => {
    it('keeps amount needed to reach gas-reserve target, deposits remaining', () => {
      const split = computeSplit(10_000_000, 500_000); // fresh 10$, existing 0.5$, reserve target 1.25$
      expect(split.keepUusdc).toBe(750_000); // keeps 0.75$ to reach 1.25$
      expect(split.depositUusdc).toBe(9_250_000); // deposits 9.25$
    });
  });

  describe('pollUntilBalance', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('polls until balance condition is satisfied', async () => {
      let balance = 50;
      const fetchBal = vi.fn().mockImplementation(async () => {
        balance += 25;
        return balance;
      });

      const promise = pollUntilBalance(fetchBal, 100, 5000, 1000, 'test');

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);

      const finalBal = await promise;
      expect(finalBal).toBe(100);
    });

    it('throws timeout error if balance is not met before deadline', async () => {
      const fetchBal = vi.fn().mockResolvedValue(50);
      const promise = pollUntilBalance(fetchBal, 100, 3000, 1000, 'test');

      const expectation = expect(promise).rejects.toThrow('Timed out waiting for test balance');

      await vi.advanceTimersByTimeAsync(4000);

      await expectation;
    });
  });

  describe('buildEvmSigner', () => {
    it('throws when no provider is available', async () => {
      const signerBuilder = buildEvmSigner('0xAddress', null);
      await expect(signerBuilder('1')).rejects.toThrow();
    });

    it('creates wallet client and executes transactions with EIP-1559 adjustments', async () => {
      const mockProvider = {
        request: vi.fn().mockImplementation(({ method }) => {
          if (method === 'eth_feeHistory') {
            return Promise.resolve({
              baseFeePerGas: ['0x3b9aca00'], // 1 Gwei
              reward: [['0x3b9aca00']],
            });
          }
          return Promise.resolve(null);
        }),
      };

      const signerBuilder = buildEvmSigner('0xAddress', mockProvider);
      const client = await signerBuilder('1');
      expect(client).toBeDefined();

      const txArgs = { maxFeePerGas: 100000n, maxPriorityFeePerGas: 10000n };
      await client.sendTransaction(txArgs as any);

      expect(mockProvider.request).toHaveBeenCalledWith({
        method: 'eth_feeHistory',
        params: ['0x5', 'latest', [50]],
      });
    });
  });
});
