import {
  BECH32_PREFIX,
  IndexerClient,
  // CompositeClient,
  IndexerConfig,
  LocalWallet,
  SubaccountInfo,
} from '@dydxprotocol/v4-client-js';

export interface DemoWalletConfig {
  mnemonic: string;
  indexerConfig: IndexerConfig;
}

export interface SubaccountData {
  address: string;
  subaccountNumber: number;
  subaccountId: string;
  equity?: string;
  freeCollateral?: string;
  marginUsage?: string;
  openPositions?: number;
}

export interface SubaccountBalance {
  equity: string;
  freeCollateral: string;
  marginUsage: string;
  positions: any[];
}

export class DydxDemoWalletService {
  private wallet: LocalWallet | null = null;
  private mnemonic: string;
  private indexerConfig: IndexerConfig;
  private indexerClient: IndexerClient | null = null;
  private subaccounts: Map<number, SubaccountData> = new Map();

  constructor(config: DemoWalletConfig) {
    this.mnemonic = config.mnemonic;
    this.indexerConfig = config.indexerConfig;
  }

  async initializeWallet(): Promise<void> {
    try {
      // Initialize wallet
      this.wallet = await LocalWallet.fromMnemonic(this.mnemonic, BECH32_PREFIX);

      // Initialize indexer client for subaccount queries
      this.indexerClient = new IndexerClient(this.indexerConfig);

      console.log('✅ Wallet initialized successfully');
      console.log('📍 Address:', this.wallet.address);
    } catch (error) {
      console.error('❌ Failed to initialize wallet:', error);
      throw new Error(`Wallet initialization failed: ${error}`);
    }
  }

  getWalletAddress(): string {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Call initializeWallet() first.');
    }
    return this.wallet.address || '';
  }

  getWallet(): LocalWallet {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Call initializeWallet() first.');
    }
    return this.wallet;
  }

  /**
   * Fetch subaccount data from dYdX Indexer
   * This checks if the subaccount exists on-chain and retrieves its balance/positions
   */
  async fetchSubaccountFromIndexer(subaccountNumber: number): Promise<SubaccountBalance | null> {
    if (!this.indexerClient) {
      throw new Error('Indexer client not initialized');
    }

    const address = this.getWalletAddress();

    try {
      const response = await this.indexerClient.account.getSubaccount(address, subaccountNumber);

      if (response && response.subaccount) {
        const { equity, freeCollateral, marginUsage, openPerpetualPositions } = response.subaccount;

        return {
          equity: equity || '0',
          freeCollateral: freeCollateral || '0',
          marginUsage: marginUsage || '0',
          positions: openPerpetualPositions || [],
        };
      }

      return null; // Subaccount doesn't exist yet
    } catch (error) {
      console.warn(`Subaccount ${subaccountNumber} not found on-chain (new account)`, error);
      return null;
    }
  }

  /**
   * Generate subaccount locally and optionally fetch its on-chain data
   */
  async generateSubaccount(
    subaccountNumber: number = 0,
    fetchFromChain: boolean = true
  ): Promise<SubaccountData> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Call initializeWallet() first.');
    }

    const address = this.wallet.address || '';
    const subaccountId = `${address}/${subaccountNumber}`;

    const subaccountData: SubaccountData = {
      address,
      subaccountNumber,
      subaccountId,
    };

    // Fetch on-chain data if requested
    if (fetchFromChain && this.indexerClient) {
      try {
        const onChainData = await this.fetchSubaccountFromIndexer(subaccountNumber);

        if (onChainData) {
          subaccountData.equity = onChainData.equity;
          subaccountData.freeCollateral = onChainData.freeCollateral;
          subaccountData.marginUsage = onChainData.marginUsage;
          subaccountData.openPositions = onChainData.positions.length;

          console.log(`✅ Subaccount #${subaccountNumber} fetched from chain:`, {
            equity: onChainData.equity,
            positions: onChainData.positions.length,
          });
        } else {
          console.log(`ℹ️ Subaccount #${subaccountNumber} is new (not on-chain yet)`);
        }
      } catch (error) {
        console.warn(`Could not fetch subaccount #${subaccountNumber} from chain:`, error);
      }
    }

    this.subaccounts.set(subaccountNumber, subaccountData);

    console.log(`✅ Generated subaccount #${subaccountNumber}:`, subaccountId);

    return subaccountData;
  }

  /**
   * Get all existing subaccounts for this wallet from the Indexer
   */
  async fetchAllSubaccountsFromIndexer(): Promise<SubaccountData[]> {
    if (!this.indexerClient) {
      throw new Error('Indexer client not initialized');
    }

    const address = this.getWalletAddress();
    const subaccounts: SubaccountData[] = [];

    try {
      // Query parent subaccounts (main subaccount endpoint)
      const response = await this.indexerClient.account.getSubaccounts(address);

      if (response && response.subaccounts) {
        for (const subaccount of response.subaccounts) {
          const subaccountNumber = subaccount.subaccountNumber || 0;
          const subaccountId = `${address}/${subaccountNumber}`;

          const subaccountData: SubaccountData = {
            address,
            subaccountNumber,
            subaccountId,
            equity: subaccount.equity || '0',
            freeCollateral: subaccount.freeCollateral || '0',
            marginUsage: subaccount.marginUsage || '0',
            openPositions: subaccount.openPerpetualPositions?.length || 0,
          };

          subaccounts.push(subaccountData);
          this.subaccounts.set(subaccountNumber, subaccountData);
        }

        console.log(`✅ Fetched ${subaccounts.length} subaccounts from chain`);
      }
    } catch (error) {
      console.error('Failed to fetch subaccounts from indexer:', error);
      throw new Error(`Failed to fetch subaccounts: ${error}`);
    }

    return subaccounts;
  }

  /**
   * Initialize wallet with subaccount 0 and fetch from chain
   */
  async initializeWithDefaultSubaccount(): Promise<SubaccountData> {
    await this.initializeWallet();
    return await this.generateSubaccount(0, true);
  }

  getSubaccount(subaccountNumber: number): SubaccountData | undefined {
    return this.subaccounts.get(subaccountNumber);
  }

  getAllSubaccounts(): SubaccountData[] {
    return Array.from(this.subaccounts.values());
  }

  getSubaccountInfo(subaccountNumber: number = 0): SubaccountInfo {
    const address = this.getWalletAddress();
    return {
      address,
      subaccountNumber,
      signingWallet: new LocalWallet(),
      isPermissionedWallet: false,
      cloneWithSubaccount: function (): SubaccountInfo {
        throw new Error('Function not implemented.');
      },
    };
  }

  async generateMultipleSubaccounts(
    count: number,
    fetchFromChain: boolean = true
  ): Promise<SubaccountData[]> {
    const generated: SubaccountData[] = [];

    for (let i = 0; i < count; i++) {
      const subaccount = await this.generateSubaccount(i, fetchFromChain);
      generated.push(subaccount);
    }

    return generated;
  }

  getWalletSummary(): {
    address: string;
    network: string;
    chainId: string;
    subaccountCount: number;
    subaccounts: SubaccountData[];
    totalEquity: string;
  } {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Call initializeWallet() first.');
    }

    const subaccounts = this.getAllSubaccounts();
    const totalEquity = subaccounts
      .reduce((sum, sub) => sum + parseFloat(sub.equity || '0'), 0)
      .toFixed(2);

    return {
      address: this.getWalletAddress(),
      network: this.indexerConfig.restEndpoint,
      chainId: this.indexerConfig.websocketEndpoint,
      subaccountCount: this.subaccounts.size,
      subaccounts,
      totalEquity,
    };
  }

  hasSubaccount(subaccountNumber: number): boolean {
    return this.subaccounts.has(subaccountNumber);
  }

  async refreshSubaccount(subaccountNumber: number): Promise<SubaccountData> {
    return await this.generateSubaccount(subaccountNumber, true);
  }

  removeSubaccount(subaccountNumber: number): boolean {
    return this.subaccounts.delete(subaccountNumber);
  }

  clearSubaccounts(): void {
    this.subaccounts.clear();
  }

  getIndexerClient(): IndexerClient | null {
    return this.indexerClient;
  }
}

// Factory functions
export async function createDydxDemoWallet(
  config: DemoWalletConfig
): Promise<DydxDemoWalletService> {
  const service = new DydxDemoWalletService(config);
  await service.initializeWallet();
  return service;
}

export const DemoWalletHelpers = {
  /**
   * Create wallet with default subaccount (0) and fetch from chain
   */
  async createWithDefaultSubaccount(
    config: DemoWalletConfig
  ): Promise<{ service: DydxDemoWalletService; subaccount: SubaccountData }> {
    const service = new DydxDemoWalletService(config);
    const subaccount = await service.initializeWithDefaultSubaccount();
    return { service, subaccount };
  },

  /**
   * Create wallet and fetch all existing subaccounts from chain
   */
  async createAndFetchAllSubaccounts(config: DemoWalletConfig): Promise<{
    service: DydxDemoWalletService;
    subaccounts: SubaccountData[];
  }> {
    const service = await createDydxDemoWallet(config);
    const subaccounts = await service.fetchAllSubaccountsFromIndexer();

    // If no subaccounts exist, create default one
    if (subaccounts.length === 0) {
      const defaultSubaccount = await service.generateSubaccount(0, true);
      subaccounts.push(defaultSubaccount);
    }

    return { service, subaccounts };
  },

  /**
   * Create wallet with multiple subaccounts and fetch their data
   */
  async createWithMultipleSubaccounts(
    config: DemoWalletConfig,
    count: number = 5
  ): Promise<{
    service: DydxDemoWalletService;
    subaccounts: SubaccountData[];
  }> {
    const service = await createDydxDemoWallet(config);
    const subaccounts = await service.generateMultipleSubaccounts(count, true);
    return { service, subaccounts };
  },
};
