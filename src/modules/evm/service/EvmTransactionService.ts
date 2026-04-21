import { fetchApiResponseFromProxy } from '../../../service/apiService';
import { type NetworkType, CHAIN_REGISTRY } from '../utils/Chainregistry';

export type ChainType = number;

export interface TransactionItem {
  blockNum: string;
  uniqueId: string;
  hash: string;
  from: string;
  to: string;
  value: number | null;
  erc721TokenId: string | null;
  erc1155Metadata: any[] | null;
  tokenId: string | null;
  asset: string | null;
  category: string;
  rawContract: {
    value: string | null;
    address: string | null;
    decimal: string | null;
  };
  metadata: any | null;
  formattedAmount: string | null;
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
  const endpoint = `/transaction-history`;
  const body: any = {
    walletAddress: address,
    chain: chain.nativeCurrency.symbol.toLowerCase(),
  };

  if (sentPageKey) body.sentPageKey = sentPageKey;
  if (receivedPageKey) body.receivedPageKey = receivedPageKey;

  const response = await fetchApiResponseFromProxy<TransactionHistoryResponse>(endpoint, 'POST', body);

  const data: TransactionItem[] = (response.data.data ?? []).map((tx) => ({
    ...tx,
    chainId,
  }));

  return {
    pagination: response.data.pagination,
    data,
  };
};