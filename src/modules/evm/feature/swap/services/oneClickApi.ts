import { ethers } from 'ethers';

import { findChain } from '../../../utils/Chainregistry';

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

export const DUMMY_STELLAR_ADDRESS = 'GA222A4L4FY52R67PGYL5TBCUKQVJUUDGROKUOMKF2AZWLXQPMY6MIFY';
export const DUMMY_EVM_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

export const BLOCKCHAIN_TO_CHAIN_ID: Record<string, number> = {
  ethereum: 1,
  eth: 1,
  arbitrum: 42161,
  arb: 42161,
  polygon: 137,
  pol: 137,
  matic: 137,
  bsc: 56,
  'binance-smart-chain': 56,
  bnb: 56,
  base: 8453,
  optimism: 10,
  op: 10,
  avalanche: 43114,
  avax: 43114,
  fantom: 250,
  ftm: 250,
  gnosis: 100,
  xdai: 100,
  celo: 42220,
  zksync: 324,
  'zksync-era': 324,
  linea: 59144,
  scroll: 534352,
  mantle: 5000,
};

export function getEvmChainId(token: NearIntentToken): number | null {
  const cleanBlockchain = (token.blockchain || '')
    .toLowerCase()
    .replace(/^(evm:|mainnet:|pubnet:)/, '')
    .split(':')[0];
  const fromField =
    BLOCKCHAIN_TO_CHAIN_ID[cleanBlockchain] ||
    BLOCKCHAIN_TO_CHAIN_ID[token.blockchain?.toLowerCase() ?? ''];
  if (fromField) return fromField;

  const match =
    token.assetId.match(/nep141:([a-z0-9]+)-0x/i) || token.assetId.match(/nep245:[^:]+:(\d+)_/i);
  if (match) {
    const num = Number(match[1]);
    if (!isNaN(num) && num > 0) return num;
    const fromPrefix = BLOCKCHAIN_TO_CHAIN_ID[match[1].toLowerCase()];
    if (fromPrefix) return fromPrefix;
  }
  return (findChain(token.blockchain, 'mainnet')?.chainId as number) ?? null;
}

export const isStellarChain = (chainId: number | string): boolean => {
  const c = String(chainId).toLowerCase();
  return c === 'pubnet' || c === 'testnet' || c === 'stellar';
};

export const isStellarBlockchain = (blockchain: string): boolean => {
  if (!blockchain) return false;
  const b = blockchain.toLowerCase();
  return b === 'stellar' || b.startsWith('stellar:') || b.includes('stellar');
};

export function safeParseUnits(amount: string, decimals: number): string {
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return '0';
  const [whole, frac = ''] = amount.split('.');
  const safeFrac = (frac || '').slice(0, decimals);
  const safeAmount = safeFrac ? `${whole}.${safeFrac}` : whole;
  try {
    return ethers.parseUnits(safeAmount || '0', decimals).toString();
  } catch {
    return '0';
  }
}

export const matchNearIntentToken = (
  tokens: NearIntentToken[],
  symbol?: string,
  address?: string,
  chainId?: number | string
): NearIntentToken | undefined => {
  if (!tokens || tokens.length === 0 || (!symbol && !address)) return undefined;
  const isTargetStellar = chainId !== undefined && isStellarChain(chainId);

  if (address && address !== 'native' && address !== '0x0000000000000000000000000000000000000000') {
    const addrLower = address.toLowerCase();
    const addrMatch = tokens.find(t => {
      const isTokenStellar = isStellarBlockchain(t.blockchain);
      if (isTargetStellar !== isTokenStellar) return false;
      if (!isTargetStellar && chainId !== undefined) {
        const tChainId = getEvmChainId(t);
        if (tChainId && String(tChainId) !== String(chainId)) return false;
      }
      if (t.contractAddress && t.contractAddress.toLowerCase() === addrLower) return true;
      if (t.assetId && t.assetId.toLowerCase().includes(addrLower)) return true;
      return false;
    });
    if (addrMatch) return addrMatch;
  }

  if (symbol) {
    const s1 = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const symMatch = tokens.find(t => {
      const isTokenStellar = isStellarBlockchain(t.blockchain);
      if (isTargetStellar !== isTokenStellar) return false;
      if (!isTargetStellar && chainId !== undefined) {
        const tChainId = getEvmChainId(t);
        if (tChainId && String(tChainId) !== String(chainId)) return false;
      }

      const s2 = (t.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (s1 === s2) return true;
      if ((s1 === 'USDT' && s2 === 'USDT0') || (s1 === 'USDT0' && s2 === 'USDT')) return true;
      if (
        (s1 === 'USDC' && (s2 === 'SUSDC' || s2 === 'USDCX' || s2 === 'USDCE')) ||
        (s2 === 'USDC' && (s1 === 'SUSDC' || s1 === 'USDCX' || s1 === 'USDCE'))
      )
        return true;
      if ((s1 === 'ETH' && s2 === 'WETH') || (s1 === 'WETH' && s2 === 'ETH')) return true;
      if (
        (s1 === 'BTC' && (s2 === 'WBTC' || s2 === 'CBBTC' || s2 === 'XBTC')) ||
        ((s1 === 'WBTC' || s1 === 'CBBTC' || s1 === 'XBTC') && s2 === 'BTC')
      )
        return true;
      return false;
    });
    if (symMatch) return symMatch;
  }

  return undefined;
};

const getHeaders = () => {
  return {
    'Content-Type': 'application/json',
  };
};

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
  memo?: string
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/v0/deposit/submit`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ txHash, depositAddress, ...(memo ? { memo } : {}) }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to submit deposit: ${errText}`);
  }
};

export const pollNearIntentStatus = async (
  quoteHash: string,
  depositAddress?: string,
  depositMemo?: string
): Promise<any> => {
  let url = `${API_BASE_URL}/v0/status?quoteHash=${encodeURIComponent(quoteHash)}`;
  if (depositAddress) {
    url += `&depositAddress=${encodeURIComponent(depositAddress)}`;
  }
  if (depositMemo) {
    url += `&depositMemo=${encodeURIComponent(depositMemo)}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch status`);
  }
  return response.json();
};
