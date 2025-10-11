import { CompositeClient, IndexerClient, LocalWallet, Network } from '@dydxprotocol/v4-client-js';
import * as bip39 from 'bip39';
import { keccak256 } from 'ethers';

import { type DydxNetwork } from '../types/wallet.types';
import { getFills } from './fills';
import { getMarkets } from './markets';
import { getPositions } from './positions';

/**
 * Service for managing dYdX wallet operations
 * Handles wallet derivation, initialization, and trading operations
 */
class WalletService {
  private compositeClient: CompositeClient | null = null;
  private indexerClient: IndexerClient | null = null;
  private wallet: LocalWallet | null = null;
  private currentNetwork: DydxNetwork = 'testnet';
  private mnemonic: string | null = null;

  /**
   * Derives a dYdX address from an EVM wallet signature
   * @param evmAddress - The EVM wallet address
   * @param signMessage - Function to sign messages with the EVM wallet
   * @returns Object containing dYdX address, public key, and mnemonic
   */
  async deriveDydxAddress(
    evmAddress: string,
    signMessage: (msg: string) => Promise<any>
  ): Promise<{ address: string; publicKey: string; mnemonic: string }> {
    try {
      console.log('🔐 Starting dYdX address derivation...');

      // Create onboarding message
      const onboardingMessage = this.createOnboardingMessage(evmAddress);
      console.log('📝 Requesting signature...');

      // Get signature from wallet
      let signature = await signMessage(onboardingMessage);
      console.log('✅ Signature received');

      // Normalize signature format
      signature = this.normalizeSignature(signature);

      // Derive mnemonic from signature
      const derivedMnemonic = this.deriveMnemonicFromSignature(signature);
      console.log('🔑 Mnemonic derived from signature');

      // Create local wallet
      const localWallet = await LocalWallet.fromMnemonic(derivedMnemonic, 'dydx');

      if (!localWallet.address) {
        throw new Error('Failed to generate wallet address');
      }

      // Extract public key
      const publicKey = this.extractPublicKey(localWallet);

      // Store wallet and mnemonic
      this.wallet = localWallet;
      this.mnemonic = derivedMnemonic;

      console.log('✅ dYdX wallet created:', localWallet.address);

      return {
        address: localWallet.address,
        publicKey,
        mnemonic: derivedMnemonic,
      };
    } catch (error) {
      console.error('❌ Error deriving dYdX address:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to derive dYdX address');
    }
  }

  /**
   * Creates the onboarding message for signature
   */
  private createOnboardingMessage(evmAddress: string): string {
    return `dYdX Onboarding\n\nBy signing this message, you are generating a dYdX Chain wallet.\n\nEVM Address: ${evmAddress.toLowerCase()}`;
  }

  /**
   * Normalizes signature to hex string format
   */
  private normalizeSignature(signature: any): string {
    // Handle object signatures
    if (typeof signature === 'object' && signature !== null) {
      // Check for .signature property
      if (signature.signature) {
        return signature.signature;
      }

      // Handle { r, s, v } format
      if (signature.r && signature.s && signature.v !== undefined) {
        return (
          '0x' +
          signature.r.replace(/^0x/, '') +
          signature.s.replace(/^0x/, '') +
          Number(signature.v).toString(16).padStart(2, '0')
        );
      }

      throw new Error('Unsupported signature format from wallet');
    }

    // Validate string signature
    if (typeof signature !== 'string' || !signature.startsWith('0x')) {
      throw new Error('Invalid signature format: must be hex string starting with 0x');
    }

    return signature;
  }

  /**
   * Derives a BIP-39 mnemonic from a signature
   */
  private deriveMnemonicFromSignature(signature: string): string {
    try {
      // Clean signature
      const cleanSignature = signature.startsWith('0x') ? signature.slice(2) : signature;

      // Validate hex format
      if (!/^[0-9a-fA-F]+$/.test(cleanSignature)) {
        throw new Error('Invalid signature: contains non-hex characters');
      }

      // Hash signature to get entropy
      const hash = keccak256('0x' + cleanSignature);
      const entropy = hash.slice(2);

      // Validate entropy
      if (!/^[0-9a-fA-F]{64}$/.test(entropy)) {
        throw new Error('Invalid entropy derived from signature');
      }

      // Generate mnemonic
      const mnemonic = bip39.entropyToMnemonic(entropy);

      // Validate mnemonic
      if (!bip39.validateMnemonic(mnemonic)) {
        throw new Error('Generated mnemonic is invalid');
      }

      return mnemonic;
    } catch (error) {
      console.error('❌ Error deriving mnemonic:', error);
      throw error;
    }
  }

  /**
   * Extracts public key from LocalWallet in hex format
   */
  private extractPublicKey(localWallet: LocalWallet): string {
    if (!localWallet.pubKey) {
      throw new Error('Public key not available in wallet');
    }

    const pubKey = localWallet.pubKey;

    // Handle different public key formats
    if (pubKey instanceof Uint8Array) {
      return Buffer.from(pubKey).toString('hex');
    }

    if (Buffer.isBuffer(pubKey)) {
      return pubKey.toString('hex');
    }

    if (typeof pubKey === 'string') {
      return pubKey;
    }

    // Handle object format
    return Buffer.from(Object.values(pubKey as any)).toString('hex');
  }

  /**
   * Initializes the wallet service with a network and mnemonic
   * @param network - The dYdX network to connect to
   * @param mnemonic - The BIP-39 mnemonic phrase
   */
  async initialize(network: DydxNetwork, mnemonic: string): Promise<void> {
    try {
      // Validate inputs
      if (!mnemonic || typeof mnemonic !== 'string') {
        throw new Error('Invalid mnemonic: must be a non-empty string');
      }

      if (!bip39.validateMnemonic(mnemonic)) {
        throw new Error('Invalid BIP-39 mnemonic');
      }

      console.log(`🔄 Initializing wallet for ${network}...`);

      // Set network
      this.currentNetwork = network;

      // Create wallet from mnemonic
      this.wallet = await LocalWallet.fromMnemonic(mnemonic, 'dydx');
      this.mnemonic = mnemonic;

      console.log(`✅ Wallet created: ${this.wallet.address}`);

      // Get the Network instance using SDK factory methods
      const networkInstance = this.getNetworkInstance(network);

      // console.log("🌐 Network configuration:", {
      //   chainId: networkInstance.chainId,
      //   indexerUrl: networkInstance.indexerConfig.restEndpoint,
      //   wsUrl: networkInstance.indexerConfig.websocketEndpoint,
      //   validatorUrl: networkInstance.validatorConfig.restEndpoint,
      // });

      // CRITICAL: Initialize IndexerClient with indexerConfig object, not string
      this.indexerClient = new IndexerClient(networkInstance.indexerConfig);
      console.log(`✅ Indexer client initialized`);

      // Initialize CompositeClient
      this.compositeClient = await CompositeClient.connect(networkInstance);
      console.log('✅ CompositeClient connected successfully');

      console.log('✅ Wallet service fully initialized');
    } catch (error) {
      console.error('❌ Wallet initialization error:', error);
      this.disconnect(); // Clean up on error
      throw error;
    }
  }

  /**
   * Gets the Network instance for the specified network
   * Uses SDK's factory methods to ensure proper configuration
   */
  private getNetworkInstance(network: DydxNetwork): Network {
    if (network === 'mainnet') {
      return Network.mainnet();
    } else {
      return Network.testnet();
    }
  }

  /**
   * Gets account balances
   */
  async getBalances(address: string) {
    if (!this.indexerClient) {
      throw new Error('Indexer client not initialized');
    }

    try {
      const response = await this.indexerClient.account.getSubaccounts(address);
      const subaccount = response?.subaccounts?.[0];

      return {
        equity: subaccount?.equity || '0',
        freeCollateral: subaccount?.freeCollateral || '0',
        marginUsage: subaccount?.marginUsage || '0',
      };
    } catch (error) {
      console.error('❌ Error fetching balances:', error);
      return {
        equity: '0',
        freeCollateral: '0',
        marginUsage: '0',
      };
    }
  }

  /**
   * Gets open positions
   */
  async getPositions(address: string) {
    if (!this.indexerClient) {
      throw new Error('Indexer client not initialized');
    }
    return getPositions(this.indexerClient, address);
  }

  /**
   * Gets available markets
   */
  async getMarkets() {
    if (!this.indexerClient) {
      throw new Error('Indexer client not initialized');
    }
    return getMarkets(this.indexerClient);
  }

  /**
   * Gets fill history
   */
  async getFills(address: string, subaccountNumber: number = 0) {
    if (!this.indexerClient) {
      throw new Error('Indexer client not initialized');
    }
    return getFills(this.indexerClient, address, subaccountNumber);
  }

  /**
   * Places a market order (not yet fully implemented)
   */
  async placeMarketOrder() {
    if (!this.compositeClient || !this.wallet) {
      throw new Error('Client not initialized');
    }

    throw new Error('Order placement not yet implemented - requires validator connection');
  }

  /**
   * Gets the current wallet instance
   */
  getWallet(): LocalWallet | null {
    return this.wallet;
  }

  /**
   * Gets the current mnemonic
   */
  getMnemonic(): string | null {
    return this.mnemonic;
  }

  /**
   * Gets the current network
   */
  getNetwork(): DydxNetwork {
    return this.currentNetwork;
  }

  /**
   * Gets the current wallet address
   */
  getAddress(): string | null {
    return this.wallet?.address || null;
  }

  /**
   * Checks if the wallet is initialized
   */
  isInitialized(): boolean {
    return !!(this.wallet && this.indexerClient && this.compositeClient);
  }

  /**
   * Switches to a different network
   */
  async switchNetwork(network: DydxNetwork): Promise<void> {
    if (!this.mnemonic) {
      throw new Error('No mnemonic available - wallet not initialized');
    }

    console.log(`🔄 Switching network from ${this.currentNetwork} to ${network}`);
    await this.initialize(network, this.mnemonic);
  }

  /**
   * Disconnects and cleans up all clients
   */
  disconnect(): void {
    console.log('🔌 Disconnecting wallet service...');
    this.compositeClient = null;
    this.indexerClient = null;
    this.wallet = null;
    this.mnemonic = null;
  }
}

// Export singleton instance
export const walletService = new WalletService();
