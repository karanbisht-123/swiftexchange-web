import { ethers } from 'ethers';
import { getEVMNetworkConfig, type NetworkKey } from '../utils/evmUtils';
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

export async function simulateSwapTransaction(params: SimulationParams): Promise<SimulationResult> {
  const result: SimulationResult = {
    success: false,
    canProceed: false,
    warnings: [],
    errors: [],
    simulationProvider: 'Local RPC'
  };

  try {
    const { rpcUrls } = getEVMNetworkConfig(params.networkKey) as any;
    const valueBN = typeof params.value === 'string' ? BigInt(params.value || '0') : (params.value || 0n);

    await rpcManager.fetchWithFallback(
      params.networkKey,
      rpcUrls,
      async (provider: ethers.JsonRpcProvider) => {
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
          result.errors.push('Transaction execution will fail (Revert detected).');
          const reason = extractRevertReason(callError);
          if (reason) {
            result.revertReason = reason;
            
            if (reason.toLowerCase().includes('slippage')) {
              result.warnings.push('Slippage tolerance may be too low for this route.');
            } else if (reason.toLowerCase().includes('allowance') || reason.toLowerCase().includes('approve')) {
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
            
            if (balance < (valueBN + estimatedCost)) {
                result.warnings.push('Insufficient native token balance to cover estimated gas fees.');
            }
          } catch (gasError: any) {
            result.warnings.push('Gas estimation failed. The transaction might revert or require a higher gas limit.');
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
    result.errors.push(`Simulation failed: ${error.message || 'Unknown error'}`);
    return result;
  }
}
