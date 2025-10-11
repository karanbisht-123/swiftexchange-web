import { IndexerClient } from '@dydxprotocol/v4-client-js';

export async function getFills(
  indexerClient: IndexerClient,
  address: string,
  subaccountNumber: number = 0
): Promise<any[]> {
  try {
    const response = await indexerClient.account.getSubaccountFills(address, subaccountNumber);
    return response?.fills || [];
  } catch (error) {
    return [];
  }
}
