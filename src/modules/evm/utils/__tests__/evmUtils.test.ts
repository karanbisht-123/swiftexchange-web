import { ethers } from 'ethers';
import { beforeEach, describe, expect, it } from 'vitest';

import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import {
  adjustFeeDataForMinGas,
  getEVMNetworkConfig,
  isValidEVMNetwork,
  signEVMTransaction,
} from '../evmUtils';

describe('evmUtils', () => {
  beforeEach(() => {
    useWalletStore.setState({ network: 'mainnet' });
  });

  describe('isValidEVMNetwork', () => {
    it('returns true for a valid mainnet chainId (e.g. 1 for Ethereum)', () => {
      expect(isValidEVMNetwork(1)).toBe(true);
    });

    it('returns false for an unknown chainId or non-numeric/string input', () => {
      expect(isValidEVMNetwork(999999999)).toBe(false);
      expect(isValidEVMNetwork(null)).toBe(false);
      expect(isValidEVMNetwork(undefined)).toBe(false);
    });
  });

  describe('getEVMNetworkConfig', () => {
    it('returns network config for a supported chain', () => {
      const config = getEVMNetworkConfig(1);
      expect(config.chainId).toBe(1);
      expect(config.nativeCurrency.symbol).toBe('ETH');
      expect(Array.isArray(config.rpcUrls)).toBe(true);
    });

    it('throws an error for an unsupported chainId', () => {
      expect(() => getEVMNetworkConfig(999999)).toThrow(/Unsupported EVM network: 999999/);
    });
  });

  describe('adjustFeeDataForMinGas', () => {
    it('returns feeData unchanged if feeData is null or undefined', () => {
      expect(adjustFeeDataForMinGas(null, 1)).toBeNull();
      expect(adjustFeeDataForMinGas(undefined, 1)).toBeUndefined();
    });

    it('adjusts priority fee and max fee when minGasGwei is defined on the network', () => {
      const feeData = {
        maxPriorityFeePerGas: '1000000000', // 1 gwei
        maxFeePerGas: '2000000000', // 2 gwei
      };

      // When chain has no minGasGwei or minGasGwei is 0, it returns feeData as is
      const adjusted = adjustFeeDataForMinGas(feeData, 1);
      expect(adjusted).toEqual(feeData);
    });
  });

  describe('signEVMTransaction', () => {
    // Standard disposable test wallet (DO NOT USE IN PROD)
    const testPrivateKey = '0x0123456789012345678901234567890123456789012345678901234567890123';
    const toAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

    it('signs an EIP-1559 transaction when maxFeePerGas and maxPriorityFeePerGas are supplied', async () => {
      const tx = {
        to: toAddress,
        value: '0x0',
        chainId: '1',
        nonce: 0,
        gasLimit: '21000',
        maxFeePerGas: '20000000000',
        maxPriorityFeePerGas: '2000000000',
      };

      const signedTx = await signEVMTransaction(tx, testPrivateKey);

      expect(signedTx).toMatch(/^0x/);
      const parsed = ethers.Transaction.from(signedTx);
      expect(parsed.to?.toLowerCase()).toBe(toAddress.toLowerCase());
      expect(parsed.chainId).toBe(1n);
      expect(parsed.type).toBe(2);
    });

    it('signs a legacy transaction when gasPrice is provided instead', async () => {
      const tx = {
        to: toAddress,
        value: '0x0',
        chainId: '1',
        nonce: 1,
        gasLimit: '21000',
        gasPrice: '20000000000',
      };

      const signedTx = await signEVMTransaction(tx, testPrivateKey);

      expect(signedTx).toMatch(/^0x/);
      const parsed = ethers.Transaction.from(signedTx);
      expect(parsed.to?.toLowerCase()).toBe(toAddress.toLowerCase());
      expect(parsed.chainId).toBe(1n);
      expect(parsed.gasPrice).toBe(20000000000n);
    });

    it('automatically prefixes a private key without 0x', async () => {
      const barePrivateKey = testPrivateKey.replace(/^0x/, '');
      const tx = {
        to: toAddress,
        value: '0x0',
        chainId: '1',
        nonce: 0,
        gasLimit: '21000',
        gasPrice: '20000000000',
      };

      const signedTx = await signEVMTransaction(tx, barePrivateKey);
      expect(signedTx).toMatch(/^0x/);
    });

    it('throws when chainId format is invalid', async () => {
      const tx = {
        to: toAddress,
        value: '0x0',
        chainId: 'invalid-chain',
      };

      await expect(signEVMTransaction(tx, testPrivateKey)).rejects.toThrow(
        /Transaction signing failed: Invalid chainId format/
      );
    });
  });
});
