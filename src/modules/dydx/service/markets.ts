import { IndexerClient } from '@dydxprotocol/v4-client-js';

export async function getMarkets(indexerClient: IndexerClient): Promise<Record<string, any>> {
  try {
    const response = await indexerClient.markets.getPerpetualMarkets();
    return response?.markets || {};
  } catch (error) {
    return {};
  }
}
