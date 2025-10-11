import { isAddress } from 'ethers';
import { Keypair, StrKey } from 'stellar-sdk';

export const validateAddress = (address: string, network: string): boolean => {
  try {
    switch (network) {
      case 'Stellar':
        if (address.length !== 56 || address[0] !== 'G') {
          return false;
        }
        if (!StrKey.isValidEd25519PublicKey(address)) {
          return false;
        }
        Keypair.fromPublicKey(address);
        return true;

      case 'Ethereum Mainnet':
      case 'Ethereum (ERC-20)':
      case 'Ethereum Sepolia':
      case 'BNB Smart Chain':
      case 'BSC Testnet':
        return isAddress(address);

      default:
        console.warn(`Unsupported network for validation: ${network}`);
        return false;
    }
  } catch (error) {
    console.error(`Address validation failed for ${network}:`, error);
    return false;
  }
};
