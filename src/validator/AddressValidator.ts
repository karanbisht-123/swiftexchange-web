import { StrKey } from '@stellar/stellar-sdk';
import { isAddress } from 'ethers';

export const validateAddress = (
  address: string,
  asset?: { addressType: 'evm' | 'cosmos' | 'stellar'; network?: string }
): boolean => {
  if (!address || typeof address !== 'string') return false;

  try {
    let type = asset?.addressType;

    if (!type) {
      if (address.startsWith('0x') && address.length === 42) {
        type = 'evm';
      } else if (address.length === 56 && address.startsWith('G')) {
        type = 'stellar';
      } else if (/^(cosmos|osmo|dydx)1[a-z0-9]{38,58}$/.test(address)) {
        type = 'cosmos';
      } else {
        return false;
      }
    }
    if (type === 'evm') {
      return isAddress(address);
    }
    if (type === 'stellar') {
      return StrKey.isValidEd25519PublicKey(address);
    }

    if (type === 'cosmos') {
      return /^(cosmos|osmo|dydx)1[a-z0-9]{38,58}$/.test(address);
    }

    return false;
  } catch (e) {
    console.error('Validation error:', e);
    return false;
  }
};
