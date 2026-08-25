import { ethers } from 'ethers';

import { type NetworkKey, getEVMNetworkConfig } from '../utils/evmUtils';
import { rpcManager } from '../utils/rpcProvider';

export interface SimulationResult {
  success: boolean;
  canProceed: boolean;
  warnings: string[];
  errors: string[];
  estimatedGas?: string;
  revertReason?: string;
  simulationProvider?: string;
}

export interface SimulationParams {
  networkKey: NetworkKey;
  from: string;
  to: string;
  data?: string;
  value?: string | bigint;
}

function extractRevertReason(error: any): string | null {
  if (error.reason) return error.reason;
  if (error.info?.error?.message) return error.info.error.message;
  if (error.error?.message) return error.error.message;

  const msg = error.message || '';
  const match = msg.match(/revert(?:ed with reason string)? ["'](.*?)["']/i);
  if (match) return match[1];

  if (msg.includes('revert')) return 'execution reverted';
  if (msg.includes('insufficient funds')) return 'insufficient funds';

  return null;
}

function isNetworkOrRpcError(error: any): boolean {
  const msg = (error?.message || String(error)).toLowerCase();
  const code = (error?.code || '').toUpperCase();
  const status =
    error?.status ?? error?.info?.status ?? error?.response?.status ?? error?.statusCode;

  if (code === 'TIMEOUT' || code === 'NETWORK_ERROR' || code === 'SERVER_ERROR') return true;
  if (status === 402 || status === 429 || status === 502 || status === 503 || status === 504)
    return true;

  const patterns = [
    'unavailable',
    'failed to fetch',
    'load failed',
    'network request failed',
    'networkerror',
    'net::err',
    'could not detect network',
    'timeout',
    'all rpcs failed',
    'no available rpcs',
    'cors',
    'cross-origin',
    'payment required',
  ];
  return patterns.some(p => msg.includes(p));
}

export async function simulateSwapTransaction(params: SimulationParams): Promise<SimulationResult> {
  const result: SimulationResult = {
    success: false,
    canProceed: false,
    warnings: [],
    errors: [],
    simulationProvider: 'Local RPC',
  };

  try {
    const { rpcUrls } = getEVMNetworkConfig(params.networkKey) as any;
    const valueBN =
      typeof params.value === 'string' ? BigInt(params.value || '0') : params.value || 0n;

    await rpcManager.fetchWithFallback(
      params.networkKey,
      rpcUrls,
      async (provider: ethers.AbstractProvider) => {
        const tx = {
          from: params.from,
          to: params.to,
          data: params.data || '0x',
          value: valueBN,
        };

        const balance = await provider.getBalance(params.from);

        if (balance < valueBN) {
          result.errors.push('Insufficient native token balance for transaction value.');
        }

        try {
          await provider.call(tx);
        } catch (callError: any) {
          if (isNetworkOrRpcError(callError)) {
            throw callError;
          }
          result.errors.push('Transaction execution will fail (Revert detected).');
          const reason = extractRevertReason(callError);
          if (reason) {
            result.revertReason = reason;

            if (reason.toLowerCase().includes('slippage')) {
              result.warnings.push('Slippage tolerance may be too low for this route.');
            } else if (
              reason.toLowerCase().includes('allowance') ||
              reason.toLowerCase().includes('approve')
            ) {
              result.errors.push('Missing token approval or insufficient allowance.');
            } else if (reason.toLowerCase().includes('expired')) {
              result.errors.push('The swap quote or route has expired.');
            } else {
              result.errors.push(`Revert reason: ${reason}`);
            }
          }
        }

        if (result.errors.length === 0) {
          try {
            const estimatedGas = await provider.estimateGas(tx);
            result.estimatedGas = estimatedGas.toString();

            const feeData = await provider.getFeeData();
            const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || BigInt(20000000000);
            const estimatedCost = estimatedGas * gasPrice;

            if (balance < valueBN + estimatedCost) {
              result.warnings.push(
                'Insufficient native token balance to cover estimated gas fees.'
              );
            }
          } catch (gasError: any) {
            if (isNetworkOrRpcError(gasError)) {
              throw gasError;
            }
            result.warnings.push(
              'Gas estimation failed. The transaction might revert or require a higher gas limit.'
            );
            const reason = extractRevertReason(gasError);
            if (reason && !result.revertReason) {
              result.revertReason = reason;
            }
          }
        }
      }
    );

    if (result.errors.length === 0) {
      result.success = true;
      result.canProceed = true;
    } else {
      result.success = false;
      result.canProceed = false;
    }

    return result;
  } catch (error: any) {
    if (isNetworkOrRpcError(error)) {
      console.warn(
        '[simulateSwapTransaction] Network/RPC error during simulation, allowing transaction to proceed:',
        error
      );
      result.warnings.push(
        `Simulation could not be completed due to a network provider issue: ${error.message || 'Network error'}`
      );
      result.success = false;
      result.canProceed = true;
    } else {
      result.errors.push(`Simulation failed: ${error.message || 'Unknown error'}`);
      result.success = false;
      result.canProceed = false;
    }
    return result;
  }
}
