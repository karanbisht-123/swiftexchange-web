import { IndexerClient } from '@dydxprotocol/v4-client-js';

export async function getPositions(indexerClient: IndexerClient, address: string): Promise<any[]> {
  try {
    const response = await indexerClient.account.getSubaccounts(address);
    return response?.subaccounts?.[0]?.openPerpetualPositions || [];
  } catch (error) {
    return [];
  }
}
