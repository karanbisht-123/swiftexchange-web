import { fetchApiResponseFromProxy } from '../../../service/apiService';
import type { SwapQuote, SwapQuoteRequest } from '../../../types/evm/swap.types';

interface SwapTransactionRequest {
  chainId: number;
  quote: SwapQuote;
  tokenIn: {
    address: string;
    symbol: string;
    decimals: number;
    isNative?: boolean;
  };
  tokenOut: {
    address: string;
    symbol: string;
    decimals: number;
    isNative?: boolean;
  };
  senderAddress: string;
  amount: string;
  slippageTolerance: number;
}

interface SwapTransactionData {
  to: string;
  data: string;
  value?: bigint;
  requiresApproval: boolean;
  spenderAddress?: string;
}

export async function getSwapQuote(chainId: number, request: SwapQuoteRequest): Promise<SwapQuote> {
  console.log('Fetching quote for chain:', chainId, request);

  const endpoint = `/eth/swap-quote`;

  const payload = {
    chainId,
    ...request,
  };

  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', payload);

  return {
    inputAmount: request.amount,
    inputToken: res.data.inputToken || request.tokenIn.symbol,
    outputAmount: res.data.outputAmount,
    outputToken: res.data.outputToken || request.tokenOut.symbol,
    pricePerToken: res.data.pricePerToken,
    fee: parseInt(res.data.fee, 10),
    poolAddress: res.data.poolAddress,
    priceImpact: res.data.priceImpact || '0',
    rawQuote: res.data,
  };
}

export async function executeSwapTransaction(
  request: SwapTransactionRequest
): Promise<SwapTransactionData> {
  console.log('Getting transaction data for swap:', request);

  const endpoint = `/eth/swap-execute`;

  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', request);

  return {
    to: res.data.to,
    data: res.data.data,
    value: res.data.value ? BigInt(res.data.value) : 0n,
    requiresApproval: res.data.requiresApproval || false,
    spenderAddress: res.data.spenderAddress,
  };
}

export async function getBridgeQuote(amount: string, chainType: string): Promise<any> {
  const endpoint = '/bridge/swap-quotes';

  const request = {
    amount,
    chainType,
  };

  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', request);
  return res.data;
}
