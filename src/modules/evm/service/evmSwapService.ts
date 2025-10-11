import type { NetworkKey } from '../../../config/swapConfigs';
import { fetchApiResponseFromProxy } from '../../../service/apiService';
import type {
  ExecuteRequest,
  // SwapQuoteRequest,
  // SwapQuote,
  PrepareRequest,
} from '../../../types/evm/swap.types';
import { getNetworkPrefix } from '../../../utils/transactionUtils';

export async function getSwapQuote(chain: NetworkKey, request: any): Promise<any> {
  const prefix = getNetworkPrefix(chain);
  const endpoint = `${prefix}/swap-quote`;
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

export async function prepareSwapTransaction(
  chain: NetworkKey,
  request: PrepareRequest
): Promise<any[]> {
  const prefix = getNetworkPrefix(chain);
  const endpoint = `${prefix}/swap-transaction/prepare`;
  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', request);
  return res.data;
}

export async function executeSwapTransaction(
  chain: NetworkKey,
  request: ExecuteRequest
): Promise<any[]> {
  const prefix = getNetworkPrefix(chain);
  const endpoint = `${prefix}/swap-transaction/execute`;
  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', request);
  return res.data;
}
