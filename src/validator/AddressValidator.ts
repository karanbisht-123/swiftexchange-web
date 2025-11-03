import { isAddress } from 'ethers';
import { Keypair, StrKey } from 'stellar-sdk';

export const validateAddress = (
  address: string,
  asset: any | { addressType: 'evm' | 'cosmos' | 'stellar'; network?: string }
): boolean => {
  try {
    let type = asset?.addressType;
    console.log(`Validating address for type: ${type}, address: ${address}`);
    if (!type) {
      if (address.startsWith('0x')) {
        type = 'evm';
        console.log('Fallback: Detected EVM type from address prefix');
      } else if (address.length === 56 && address[0] === 'G') {
        type = 'stellar';
        console.log('Fallback: Detected Stellar type from address prefix');
      } else if (
        address.startsWith('cosmos') ||
        address.startsWith('osmo') ||
        address.startsWith('dydx')
      ) {
        type = 'cosmos';
        console.log('Fallback: Detected Cosmos type from address prefix');
      } else {
        console.log('Fallback: Could not detect address type, treating as invalid');
        return false;
      }
    }

    if (type === 'evm') {
      const valid = isAddress(address);
      console.log(`EVM validation result: ${valid}`);
      return valid;
    }
    if (type === 'stellar') {
      if (address.length !== 56 || address[0] !== 'G') {
        console.log('Stellar: Invalid length or prefix');
        return false;
      }
      if (!StrKey.isValidEd25519PublicKey(address)) {
        console.log('Stellar: Invalid Ed25519 public key');
        return false;
      }
      try {
        Keypair.fromPublicKey(address);
        console.log('Stellar validation: Passed');
        return true;
      } catch (stellarError) {
        console.log('Stellar: Keypair creation failed:', stellarError);
        return false;
      }
    }
    if (type === 'cosmos') {
      const valid =
        address.startsWith('cosmos') || address.startsWith('osmo') || address.startsWith('dydx');
      console.log(`Cosmos validation result: ${valid}`);
      return valid;
    }

    console.log(`Unknown type: ${type}, treating as invalid`);
    return false;
  } catch (e) {
    console.error('Address validation error:', e);
    return false;
  }
};
