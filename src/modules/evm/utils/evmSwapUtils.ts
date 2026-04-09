import { ethers } from 'ethers';

import type { SwapQuote, SwapQuoteRequest, SwapType } from '../../../types/evm/swap.types';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { getSwapQuote, prepareSwapTransaction } from '../service/evmSwapService';
import type { TokenInfo } from '../service/tokenListService';
import { parseSwapError } from './swapErrorHandler';

function isMainnet(): boolean {
  return useWalletStore.getState().network === 'mainnet';
}

export function determineSwapType(sellAsset: TokenInfo, buyAsset: TokenInfo): SwapType {
  const isSellNative = sellAsset.isNative;
  const isBuyNative = buyAsset.isNative;
  const isSellUsdc = sellAsset.symbol.toUpperCase() === 'USDC';
  const isBuyUsdc = buyAsset.symbol.toUpperCase() === 'USDC';
  if (isSellNative && isBuyUsdc) return 'EthToUsdc';
  if (isSellUsdc && isBuyNative) return 'UsdcToWeth';
  return 'TokenToToken';
}

/**
 * Safely parse a value field from the API into a BigInt.
 *
 * Some APIs return:
 *   - undefined / null         → treat as 0
 *   - "0" (decimal string)     → BigInt(0)
 *   - "0x0" (hex string)       → BigInt works directly
 *   - "1000000000000000" (wei) → BigInt works directly
 *
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
 *
 * Priority:
 *   1. tx.gasLimit  — ethers v6 field name
 *   2. tx.gas       — JSON-RPC / legacy field name (many DEX aggregators use this)
 *   3. undefined    — caller will fall back to on-chain estimation
 *
 * We return undefined (not 0n) when neither field is present so the caller
 * knows to estimate gas rather than pass an invalid 0 gasLimit.
 */
function safeGasLimit(tx: { gasLimit?: string; gas?: string }): bigint | undefined {
  const raw = tx.gasLimit ?? tx.gas;
  if (raw === undefined || raw === null || raw === '') return undefined;
  try {
    const parsed = BigInt(raw);
    // A gasLimit of 0 is invalid — treat as absent so we fall back to estimation
    return parsed > 0n ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Estimate gas for a transaction, adding a 20 % buffer.
 * Returns undefined if estimation fails so the caller can decide what to do.
 */
async function estimateGasWithBuffer(
  provider: ethers.BrowserProvider,
  txParams: ethers.TransactionRequest
): Promise<bigint | undefined> {
  try {
    const estimated = await provider.estimateGas(txParams);
    // Add 20 % buffer to avoid out-of-gas on complex swaps
    return (estimated * 120n) / 100n;
  } catch (err) {
    console.warn('[executeSwap] Gas estimation failed, will let wallet decide:', err);
    return undefined;
  }
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

    const adjustedRequest: SwapQuoteRequest = {
      ...request,
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

    if (isMainnet()) {
      for (const tx of transactions) {
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
        const receipt = await txResponse.wait();

        if (!receipt || receipt.status === 0) {
          throw new Error('Transaction reverted on-chain');
        }

        lastTxHash = txResponse.hash;
      }
    } else {
      // ── Testnet / fallback path ─────────────────────────────────────────────
      const txData = transactions[0];

      // Handle ERC-20 approval if required
      if (!selectedSellAsset.isNative && (txData as any).requiresApproval) {
        const erc20Abi = [
          'function approve(address spender, uint256 amount) public returns (bool)',
          'function allowance(address owner, address spender) public view returns (uint256)',
        ];
        const tokenContract = new ethers.Contract(selectedSellAsset.address, erc20Abi, signer);
        const amountIn = ethers.parseUnits(sellAmount, selectedSellAsset.decimals);
        const currentAllowance = await tokenContract.allowance(
          senderAddress,
          (txData as any).spenderAddress
        );

        if (currentAllowance < amountIn) {
          const approveTx = await tokenContract.approve((txData as any).spenderAddress, amountIn);
          await approveTx.wait();
        }
      }

      const gasLimitFromApi = safeGasLimit(txData as any);

      const tx: ethers.TransactionRequest = {
        from: senderAddress,
        to: txData.to,
        data: txData.data,
        value: safeValue(txData.value),
      };

      if (gasLimitFromApi !== undefined) {
        tx.gasLimit = gasLimitFromApi;
      } else {
        const estimated = await estimateGasWithBuffer(ethersProvider, tx);
        if (estimated !== undefined) {
          tx.gasLimit = estimated;
        }
      }

      console.log('[executeSwap] Sending fallback transaction:', {
        to: tx.to,
        value: tx.value?.toString(),
        gasLimit: tx.gasLimit?.toString(),
      });

      const txResponse = await signer.sendTransaction(tx);
      const receipt = await txResponse.wait();

      if (!receipt || receipt.status === 0) {
        throw new Error('Transaction reverted on-chain');
      }

      lastTxHash = txResponse.hash;
    }

    return lastTxHash;
  } catch (error: any) {
    console.error('[executeSwap] Error:', error);
    const message = parseSwapError(error);
    throw new Error(message);
  }
}










//  if (isMainnet()) {

//       console.log(transactions, "transactions")
//       for (const tx of transactions) {
//         const gasLimitFromApi = safeGasLimit(tx);

//         const txParams: ethers.TransactionRequest = {
//           from: tx.from || senderAddress,
//           to: tx.to,
//           data: tx.data,
//           value: safeValue(tx.value),
//         };
//         // if (gasLimitFromApi !== undefined) {
//         //   txParams.gasLimit = gasLimitFromApi;
//         // } else {
//         //   const estimated = await estimateGasWithBuffer(ethersProvider, txParams);
//         //   if (estimated !== undefined) {
//         //     txParams.gasLimit = estimated;
//         //   }

//         // }

//         const GAS_BUFFER_MULTIPLIER = 1.3;
//         if (gasLimitFromApi !== undefined) {
//           txParams.gasLimit = BigInt(
//             Math.floor(Number(gasLimitFromApi) * GAS_BUFFER_MULTIPLIER)
//           );
//         } else {
//           const estimated = await estimateGasWithBuffer(ethersProvider, txParams);
//           if (estimated !== undefined) {
//             txParams.gasLimit = BigInt(
//               Math.floor(Number(estimated) * GAS_BUFFER_MULTIPLIER)
//             );
//           }
//         }

//         if (tx.maxFeePerGas) {
//           txParams.maxFeePerGas = BigInt(Math.floor(Number(tx.maxFeePerGas) * GAS_BUFFER_MULTIPLIER))
//         }
//         if (tx.maxPriorityFeePerGas) {
//           txParams.maxPriorityFeePerGas = BigInt(Math.floor(Number(tx.maxPriorityFeePerGas) * GAS_BUFFER_MULTIPLIER))
//         }

//         console.log('[executeSwap] Sending transaction:', {
//           to: txParams.to,
//           value: txParams.value?.toString(),
//           gasLimit: txParams.gasLimit?.toString(),
//           maxFeePerGas: txParams.maxFeePerGas?.toString(),
//           maxPriorityFeePerGas: txParams.maxPriorityFeePerGas?.toString(),
//         });

//         const txResponse = await signer.sendTransaction(txParams);
//         console.log(txResponse, "---------")
//         const receipt = await txResponse.wait();
//         console.log(receipt, "------------")

//         if (!receipt || receipt.status === 0) {
//           throw new Error('Transaction reverted on-chain');
//         }

//         lastTxHash = txResponse.hash;
//       }
//     } else {
//       const txData = transactions[0];
//       if (!selectedSellAsset.isNative && (txData as any).requiresApproval) {
//         const erc20Abi = [
//           'function approve(address spender, uint256 amount) public returns (bool)',
//           'function allowance(address owner, address spender) public view returns (uint256)',
//         ];
//         const tokenContract = new ethers.Contract(selectedSellAsset.address, erc20Abi, signer);
//         const amountIn = ethers.parseUnits(sellAmount, selectedSellAsset.decimals);
//         const currentAllowance = await tokenContract.allowance(
//           senderAddress,
//           (txData as any).spenderAddress
//         );

//         if (currentAllowance < amountIn) {
//           const approveTx = await tokenContract.approve((txData as any).spenderAddress, amountIn);
//           await approveTx.wait();
//         }
//       }


//       const gasLimitFromApi = safeGasLimit(txData as any);

//       const tx: ethers.TransactionRequest = {
//         from: senderAddress,
//         to: txData.to,
//         data: txData.data,
//         value: safeValue(txData.value),
//       };

//       if (gasLimitFromApi !== undefined) {
//         tx.gasLimit = gasLimitFromApi;
//       } else {
//         const estimated = await estimateGasWithBuffer(ethersProvider, tx);
//         if (estimated !== undefined) {
//           tx.gasLimit = estimated;
//         }
//       }

//       console.log('[executeSwap] Sending fallback transaction:', {
//         to: tx.to,
//         value: tx.value?.toString(),
//         gasLimit: tx.gasLimit?.toString(),
//       });

//       const txResponse = await signer.sendTransaction(tx);
//       const receipt = await txResponse.wait();

//       if (!receipt || receipt.status === 0) {
//         throw new Error('Transaction reverted on-chain');
//       }

//       lastTxHash = txResponse.hash;
//     }