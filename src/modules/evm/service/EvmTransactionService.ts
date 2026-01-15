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

export type TransactionHistoryResponse = TransactionItem[];

export const getEvmTransactionHistory = async (
    address: string,
    chain: ChainType
): Promise<TransactionHistoryResponse> => {
    const endpoint = `/transaction-history/${address}/${chain}`;
    const response = await fetchApiResponseFromProxy<TransactionHistoryResponse>(endpoint, 'GET');
    return response.data;
};
