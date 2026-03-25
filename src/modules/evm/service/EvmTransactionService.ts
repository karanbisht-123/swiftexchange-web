import { fetchApiResponseFromProxy } from '../../../service/apiService';
import { type ChainType, type NetworkType, chainTypeToId } from '../utils/Chainregistry';

export type { ChainType };

export interface TransactionItem {
  blockNum: string;
  uniqueId: string;
  hash: string;
  from: string;
  to: string;
  value: number;
  erc721TokenId: string | null;
  erc1155Metadata: any[];
  tokenId: string | null;
  asset: string;
  category: string;
  rawContract: {
    value: string;
    address: string | null;
    decimal: string;
  };
  metadata: any | null;
  formattedAmount: string;
  chainId: number;
}

export interface TransactionPagination {
  nextSentPageKey: string | null;
  nextReceivedPageKey: string | null;
  hasSentNextPage: boolean;
  hasReceivedNextPage: boolean;
  hasNextPage: boolean;
}

export interface TransactionHistoryResponse {
  data: TransactionItem[];
  pagination: TransactionPagination;
}

export const getEvmTransactionHistory = async (
  address: string,
  chain: ChainType,
  network: NetworkType,
  sentPageKey?: string,
  receivedPageKey?: string
): Promise<TransactionHistoryResponse> => {
  let endpoint = `/transaction-history/${address}/${chain}`;
  if (sentPageKey || receivedPageKey) {
    const params = new URLSearchParams();
    if (sentPageKey) params.append('sentPageKey', sentPageKey);
    if (receivedPageKey) params.append('receivedPageKey', receivedPageKey);
    endpoint += `?${params.toString()}`;
  }

  const response = await fetchApiResponseFromProxy<TransactionHistoryResponse>(endpoint, 'GET');

  const resolvedChainId = chainTypeToId(chain, network);
  const data = (response.data.data ?? []).map(tx => ({
    ...tx,
    chainId: resolvedChainId,
  }));

  return { ...response.data, data };
};