export interface NearIntentQuoteRequest {
  dry: boolean;
  depositMode?: 'SIMPLE' | 'MEMO';
  swapType: 'EXACT_INPUT' | 'EXACT_OUTPUT';
  slippageTolerance: number;
  originAsset: string;
  depositType: string;
  destinationAsset: string;
  amount: string;
  recipient: string;
  recipientType: 'DESTINATION_CHAIN' | 'INTENTS' | 'CONFIDENTIAL_INTENTS';
  refundTo: string;
  refundType: string;
  deadline: string;
}

export interface NearIntentQuote {
  depositAddress: string;
  depositMemo?: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd?: string;
  amountIn: string;
  amountInFormatted?: string;
  amountInUsd?: string;
  minAmountOut?: string;
  timeEstimate: number;
  withdrawFee?: string;
  refundFee?: string;
}

export interface NearIntentQuoteResponse {
  quote: NearIntentQuote;
  signature: string;
  correlationId: string;
}

export interface NearIntentToken {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price?: number;
  priceUpdatedAt?: string;
  contractAddress?: string;
  coingeckoId?: string;
}

const API_BASE_URL = 'https://1click.chaindefuser.com';

const getHeaders = () => {
  return {
    'Content-Type': 'application/json',
  };
};

// Stellar requires MEMO mode — the deposit address alone is not enough,
// the user must also include a memo field in their Stellar payment.
export const isStellarBlockchain = (blockchain: string): boolean => blockchain === 'stellar';

let cachedNearIntentTokens: NearIntentToken[] | null = null;
let lastNearIntentTokensFetch = 0;
const NEAR_INTENT_TOKENS_TTL = 5 * 60 * 1000; // 5 minutes
let fetchNearIntentTokensPromise: Promise<NearIntentToken[]> | null = null;

export const fetchNearIntentTokens = async (): Promise<NearIntentToken[]> => {
  const now = Date.now();
  if (cachedNearIntentTokens && now - lastNearIntentTokensFetch < NEAR_INTENT_TOKENS_TTL) {
    return cachedNearIntentTokens;
  }

  if (fetchNearIntentTokensPromise) {
    return fetchNearIntentTokensPromise;
  }

  fetchNearIntentTokensPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v0/tokens`, {
        method: 'GET',
        headers: getHeaders(),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch tokens: ${response.statusText}`);
      }
      const data = await response.json();
      cachedNearIntentTokens = data;
      lastNearIntentTokensFetch = Date.now();
      return data;
    } finally {
      fetchNearIntentTokensPromise = null;
    }
  })();

  return fetchNearIntentTokensPromise;
};

export const getNearIntentQuote = async (
  request: NearIntentQuoteRequest
): Promise<NearIntentQuoteResponse> => {
  const response = await fetch(`${API_BASE_URL}/v0/quote`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to fetch quote: ${errText}`);
  }
  return response.json();
};

export const submitNearIntentDeposit = async (
  txHash: string,
  depositAddress: string,
  depositMemo?: string
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/v0/deposit/submit`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ txHash, depositAddress, ...(depositMemo ? { depositMemo } : {}) }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to submit deposit: ${errText}`);
  }
};

export const pollNearIntentStatus = async (quoteHash: string): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/v0/status?quoteHash=${quoteHash}`, {
    method: 'GET',
    headers: getHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch status`);
  }
  return response.json();
};
