import { ethers } from 'ethers';

import type { SwapQuote, SwapQuoteRequest, SwapType } from '../../../types/evm/swap.types';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { getSwapQuote, prepareSwapTransaction } from '../service/evmSwapService';
import type { TokenInfo } from '../service/tokenListService';
import { getChainById } from './Chainregistry';
import { parseSwapError } from './swapErrorHandler';



export function determineSwapType(sellAsset: TokenInfo, buyAsset: TokenInfo): SwapType {
  const isSellNative = sellAsset.isNative;
  const isBuyNative = buyAsset.isNative;
  const isSellUsdc = sellAsset.symbol.toUpperCase() === 'USDC';
  const isBuyUsdc = buyAsset.symbol.toUpperCase() === 'USDC';

  if (isSellNative && isBuyUsdc) return 'EthToUsdc';
  if (isSellUsdc && isBuyNative) return 'UsdcToWeth';
  if (isSellNative) return 'EthToToken';
  if (isBuyNative) return 'TokenToEth';
  
  return 'TokenToToken';
}

/**
 * Safely parse a value field from the API into a BigInt.
 * Without this guard, `BigInt(undefined)` throws a TypeError at runtime.
 */
function safeValue(raw: string | undefined | null): bigint {
  if (raw === undefined || raw === null || raw === '') return 0n;
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

/**
 * Build a gasLimit BigInt from a transaction object returned by the API.
 */
function safeGasLimit(tx: { gasLimit?: string; gas?: string }): bigint | undefined {
  const raw = tx.gasLimit ?? tx.gas;
  if (raw === undefined || raw === null || raw === '') return undefined;
  try {
    const parsed = BigInt(raw);
    return parsed > 0n ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Estimate gas for a transaction, adding a 20% buffer.
 * Returns undefined if estimation fails so the caller can decide what to do.
 */
async function estimateGasWithBuffer(
  provider: ethers.BrowserProvider,
  txParams: ethers.TransactionRequest
): Promise<bigint | undefined> {
  try {
    const estimated = await provider.estimateGas(txParams);
    return (estimated * 120n) / 100n;
  } catch (err) {
    console.warn('[executeSwap] Gas estimation failed, will let wallet decide:', err);
    return undefined;
  }
}

//Manually poll for a transaction receipt using getTransactionReceipt
async function pollForReceipt(
  provider: ethers.BrowserProvider,
  txHash: string,
  intervalMs = 2000,
  timeoutMs = 120_000
): Promise<ethers.TransactionReceipt | null> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt !== null) {
        return receipt;
      }
    } catch (err) {
      console.warn('[pollForReceipt] Error fetching receipt, retrying:', err);
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  console.warn('[pollForReceipt] Timed out waiting for receipt:', txHash);
  return null;
}

export async function fetchEvmQuote(
  chainId: number,
  request: SwapQuoteRequest,
  selectedSellAsset: TokenInfo,
  selectedBuyAsset: TokenInfo
): Promise<SwapQuote> {
  try {
    if (!selectedSellAsset.isNative && !ethers.isAddress(selectedSellAsset.address)) {
      throw new Error(`Invalid sell token address: ${selectedSellAsset.address}`);
    }
    if (!selectedBuyAsset.isNative && !ethers.isAddress(selectedBuyAsset.address)) {
      throw new Error(`Invalid buy token address: ${selectedBuyAsset.address}`);
    }

    const swapType = determineSwapType(selectedSellAsset, selectedBuyAsset);

    const chainConfig = getChainById(chainId);
    const nativeSymbol = chainConfig?.nativeCurrency.symbol || 'ETH';

    const adjustedRequest: any = {
      ...request,
      nativeSymbol, // Pass native symbol as requested by user for dynamic API
      tokenIn: {
        symbol: selectedSellAsset.symbol,
        name: selectedSellAsset.name,
        decimals: selectedSellAsset.decimals,
        address: selectedSellAsset.address,
        balance: selectedSellAsset.balance || '0',
        logoUri: selectedSellAsset.logoURI || null,
      },
      tokenOut: {
        symbol: selectedBuyAsset.symbol,
        name: selectedBuyAsset.name,
        decimals: selectedBuyAsset.decimals,
        address: selectedBuyAsset.address,
        balance: selectedBuyAsset.balance || '0',
        logoUri: selectedBuyAsset.logoURI || null,
      },
      swapType,
    };

    const quote = await getSwapQuote(chainId, adjustedRequest);

    return {
      ...quote,
      inputToken: selectedSellAsset.symbol,
      outputToken: selectedBuyAsset.symbol,
    };
  } catch (error: any) {
    const message = parseSwapError(error);
    throw new Error(message);
  }
}

export async function executeSwap(
  chainId: number,
  quote: SwapQuote,
  selectedSellAsset: TokenInfo,
  selectedBuyAsset: TokenInfo,
  senderAddress: string,
  sellAmount: string,
  slippageTolerance: number,
  getProvider: (type: WalletType) => any
): Promise<string> {
  try {
    const provider = getProvider(WalletType.EVM);
    if (!provider) {
      throw new Error('EVM wallet not connected');
    }

    const swapRequest = {
      chainId,
      quote,
      tokenIn: {
        address: selectedSellAsset.address,
        symbol: selectedSellAsset.symbol,
        decimals: selectedSellAsset.decimals,
        isNative: selectedSellAsset.isNative,
      },
      tokenOut: {
        address: selectedBuyAsset.address,
        symbol: selectedBuyAsset.symbol,
        decimals: selectedBuyAsset.decimals,
        isNative: selectedBuyAsset.isNative,
      },
      senderAddress,
      amount: sellAmount,
      slippageTolerance,
    };

    const transactions = await prepareSwapTransaction(swapRequest);

    if (!transactions || transactions.length === 0) {
      throw new Error('No transactions received from API');
    }

    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    let lastTxHash = '';

    for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        const isLastTx = i === transactions.length - 1;

        const gasLimitFromApi = safeGasLimit(tx);

        const txParams: ethers.TransactionRequest = {
            from: tx.from || senderAddress,
            to: tx.to,
            data: tx.data,
            value: safeValue(tx.value),
        };

        if (gasLimitFromApi !== undefined) {
            txParams.gasLimit = gasLimitFromApi;
        } else {
            const estimated = await estimateGasWithBuffer(ethersProvider, txParams);
            if (estimated !== undefined) {
                txParams.gasLimit = estimated;
            }
        }

        if (tx.maxFeePerGas) {
            txParams.maxFeePerGas = BigInt(tx.maxFeePerGas);
        }
        if (tx.maxPriorityFeePerGas) {
            txParams.maxPriorityFeePerGas = BigInt(tx.maxPriorityFeePerGas);
        }

        console.log('[executeSwap] Sending transaction:', {
            to: txParams.to,
            value: txParams.value?.toString(),
            gasLimit: txParams.gasLimit?.toString(),
            maxFeePerGas: txParams.maxFeePerGas?.toString(),
            maxPriorityFeePerGas: txParams.maxPriorityFeePerGas?.toString(),
        });

        const txResponse = await signer.sendTransaction(txParams);
        lastTxHash = txResponse.hash;

        if (!isLastTx) {
            console.log('[executeSwap] Transaction sent, polling for confirmation:', txResponse.hash);
            const receipt = await pollForReceipt(ethersProvider, txResponse.hash);
            if (!receipt || receipt.status === 0) {
                throw new Error('Transaction failed or reverted on-chain');
            }
            console.log('[executeSwap] Transaction confirmed, continuing to next.');
        } else {
            console.log('[executeSwap] Final swap tx sent, returning hash immediately:', txResponse.hash);

            pollForReceipt(ethersProvider, txResponse.hash).then(receipt => {
                if (!receipt || receipt.status === 0) {
                    console.error('[executeSwap] Final tx reverted on-chain:', txResponse.hash);
                } else {
                    console.log('[executeSwap] Final tx confirmed on-chain:', txResponse.hash);
                }
            });
        }
    }

    return lastTxHash;
  } catch (error: any) {
    console.error('[executeSwap] Error:', error);
    const message = parseSwapError(error);
    throw new Error(message);
  }
}


