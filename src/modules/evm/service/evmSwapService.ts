//
import { fetchApiResponseFromProxy } from '../../../service/apiService';
import type { SwapQuoteRequest } from '../../../types/evm/swap.types';

export async function getSwapQuote(chainId: any, request: SwapQuoteRequest): Promise<any> {
  console.log(chainId, 'chainId in evmSwapService');
  const endpoint = `/eth/swap-quote`;

  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', request);

  return {
    inputAmount: request.amount,
    inputToken: res.data.inputToken,
    outputAmount: res.data.outputAmount,
    outputToken: res.data.outputToken,
    pricePerToken: res.data.pricePerToken,
    fee: parseInt(res.data.fee, 10),
    poolAddress: res.data.poolAddress,
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
