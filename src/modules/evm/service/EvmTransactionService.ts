import { fetchApiResponseFromProxy } from '../../../service/apiService';

export type ChainType = 'eth' | 'bsc';

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
    return response.data;
};
