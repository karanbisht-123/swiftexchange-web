import { IndexerClient } from '@dydxprotocol/v4-client-js';

import { type Position } from '../types/types';

export interface PositionServiceConfig {
  indexerClient: IndexerClient;
}

export class PositionService {
  private indexerClient: IndexerClient;

  constructor(config: PositionServiceConfig) {
    this.indexerClient = config.indexerClient;
  }

  /**
   * Get all open perpetual positions for a subaccount
   * @param address Wallet address
   * @param subaccountNumber Subaccount number (default 0)
   * @returns Array of open positions
   */
  async getOpenPositions(address: string, subaccountNumber: number = 0): Promise<Position[]> {
    try {
      const response = await this.indexerClient.account.getSubaccount(address, subaccountNumber);

      if (!response?.subaccount?.openPerpetualPositions) {
        return [];
      }

      // Map to your Position interface (adjust based on your existing Position type)
      return Object.entries(response.subaccount.openPerpetualPositions).map(
        ([market, pos]: [string, any]) => ({
          market,
          status: pos.status || 'OPEN',
          side: pos.side,
          size: pos.size,
          entryPrice: pos.entryPrice,
          unrealizedPnl: pos.unrealizedPnl,
          realizedPnl: pos.realizedPnl,
          netFunding: pos.netFunding,
        })
      );
    } catch (error) {
      console.error('Failed to fetch open positions:', error);
      throw new Error(`Failed to get open positions: ${error}`);
    }
  }

  /**
   * Get a specific open position by market
   * @param address Wallet address
   * @param subaccountNumber Subaccount number
   * @param market Market symbol (e.g., "BTC-USD")
   * @returns Position or null if not found
   */
  async getPositionByMarket(
    address: string,
    subaccountNumber: number = 0,
    market: string
  ): Promise<Position | null> {
    const positions = await this.getOpenPositions(address, subaccountNumber);
    return positions.find(pos => pos.market === market) || null;
  }
}
