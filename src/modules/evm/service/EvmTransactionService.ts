import { fetchApiResponseFromProxy } from '../../../service/apiService';
import { type NetworkType, CHAIN_REGISTRY } from '../utils/Chainregistry';

export type ChainType = number;

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
  chainId: ChainType,
  network: NetworkType,
  sentPageKey?: string,
  receivedPageKey?: string
): Promise<TransactionHistoryResponse> => {
  const chain = CHAIN_REGISTRY.find(
    (c) => c.chainId === chainId && c.networkType === network
  );

  if (!chain) {
    throw new Error(`Unsupported chain: chainId=${chainId} network=${network}`);
  }

  let endpoint = `/transaction-history/${address}/${chain.slug}`;

  if (sentPageKey || receivedPageKey) {
    const params = new URLSearchParams();
    if (sentPageKey) params.append('sentPageKey', sentPageKey);
    if (receivedPageKey) params.append('receivedPageKey', receivedPageKey);
    endpoint += `?${params.toString()}`;
  }

  const response = await fetchApiResponseFromProxy<TransactionHistoryResponse>(endpoint, 'GET');

  const data: TransactionItem[] = (response.data.data ?? []).map((tx) => ({
    ...tx,
    chainId,
  }));

  return {
    pagination: response.data.pagination,
    data,
  };
};