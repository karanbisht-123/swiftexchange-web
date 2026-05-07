// import { ethers } from 'ethers';

// import type { SwapQuote, SwapQuoteRequest } from '../../../types/evm/swap.types';
// import { WalletType } from '../../walletconnect/constants/Wallet';
// import {
//   getSwapQuote,
//   prepareSwapTransaction,
//   get1InchFusionQuote,
//   build1InchFusionOrder,
//   submit1InchFusionOrder,
//   confirmRangoRoute,
//   checkRangoApproval,
//   prepareRangoTx,
// } from '../service/evmSwapService';

// import type { TokenInfo } from '../service/tokenListService';
// import { getChainById, getChainRangoSymbol } from './Chainregistry';
// import { parseSwapError } from './swapErrorHandler';
// import { NATIVE_ADDRESS, AGGREGATOR_NATIVE_ADDRESS } from './assetmanagement/constants';
// import { rpcManager } from './rpcProvider';
// import { getEVMNetworkConfig } from './evmUtils';

// const LIMIT_ORDER_PROTOCOL = '0x111111125421ca6dc452d289314280a0f8842a65';
// const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// const ERC20_ALLOWANCE_ABI = [
//   'function allowance(address owner, address spender) view returns (uint256)',
//   'function approve(address spender, uint256 amount) returns (bool)',
// ];

// export async function ensureFusionAllowance(
//   tokenAddress: string,
//   walletAddress: string,
//   amountBN: bigint,
//   provider: any,
//   chainId: number | string,
// ): Promise<{
//   usedPermit2: boolean;
//   approvalTxHash?: string;
//   permit?: string;
// }> {
//   if (!tokenAddress || tokenAddress.toLowerCase() === NATIVE_ADDRESS.toLowerCase()) {
//     return { usedPermit2: false };
//   }

//   // For Fusion, always check against Permit2 first
//   // Fall back to Limit Order Protocol for classic approval
//   let allowance: bigint = 0n;
//   let rpcUrls: string[] = [];

//   try {
//     rpcUrls = getEVMNetworkConfig(chainId).rpcUrls;
//   } catch { }

//   // Check Permit2 allowance first
//   if (rpcUrls.length > 0) {
//     try {
//       allowance = await rpcManager.fetchWithFallback(chainId, rpcUrls, async (rpcProvider) => {
//         const contract = new ethers.Contract(tokenAddress, ERC20_ALLOWANCE_ABI, rpcProvider);
//         return contract.allowance(walletAddress, PERMIT2_ADDRESS, { blockTag: 'pending' }) as Promise<bigint>;
//       });
//     } catch (err) {
//       console.warn('[ensureFusionAllowance] RPC fallback failed, trying injected provider:', err);
//     }
//   }

//   if (allowance === 0n && provider) {
//     try {
//       const ethersProvider = new ethers.BrowserProvider(provider);
//       const contract = new ethers.Contract(tokenAddress, ERC20_ALLOWANCE_ABI, ethersProvider);
//       allowance = await contract.allowance(walletAddress, PERMIT2_ADDRESS, { blockTag: 'pending' });
//     } catch (err) {
//       console.warn('[ensureFusionAllowance] Injected provider Permit2 allowance check failed:', err);
//     }
//   }

//   // Permit2 allowance is sufficient — no approval needed
//   if (BigInt(allowance) >= amountBN) {
//     return { usedPermit2: true };
//   }

//   // No sufficient allowance found — build and send approval tx
//   if (provider) {
//     try {
//       const ethersProvider = new ethers.BrowserProvider(provider);
//       const signer = await ethersProvider.getSigner();


//       const spender = allowance === 0n ? PERMIT2_ADDRESS : LIMIT_ORDER_PROTOCOL;

//       const tokenContract = new ethers.Contract(tokenAddress, ERC20_ALLOWANCE_ABI, signer);

//       const approveTx = await tokenContract.approve(spender, ethers.MaxUint256);
//       const receipt = await approveTx.wait();

//       console.log('[ensureFusionAllowance] Approval tx confirmed:', receipt.hash);

//       return {
//         usedPermit2: spender === PERMIT2_ADDRESS,
//         approvalTxHash: receipt.hash,
//         permit: undefined,
//       };
//     } catch (err: any) {
//       console.error('[ensureFusionAllowance] Approval tx failed:', err);
//       throw new Error(`Token approval failed: ${err.message}`);
//     }
//   }


//   return {
//     usedPermit2: true,
//     permit: undefined,
//   };
// }

// export function formatAmount(amount: string, decimals: number): string {
//   if (!amount) return '0';
//   try {
//     const parts = amount.split('.');
//     let cleanAmount = amount;
//     if (parts.length > 1) {
//       cleanAmount = parts[0] + '.' + parts[1].slice(0, decimals);
//     }
//     return ethers.parseUnits(cleanAmount, decimals).toString();
//   } catch (err) {
//     console.warn('[formatAmount] Fallback to raw amount due to error:', err);
//     return amount;
//   }
// }

// function safeValue(raw: string | undefined | null): bigint {
//   if (raw === undefined || raw === null || raw === '') return 0n;
//   try {
//     return BigInt(raw);
//   } catch {
//     return 0n;
//   }
// }

// function safeGasLimit(tx: { gasLimit?: string; gas?: string }): bigint | undefined {
//   const raw = tx.gasLimit ?? tx.gas;
//   if (raw === undefined || raw === null || raw === '') return undefined;
//   try {
//     const parsed = BigInt(raw);
//     return parsed > 0n ? parsed : undefined;
//   } catch {
//     return undefined;
//   }
// }

// async function estimateGasWithBuffer(
//   provider: ethers.BrowserProvider,
//   txParams: ethers.TransactionRequest
// ): Promise<bigint | undefined> {
//   try {
//     const estimated = await provider.estimateGas(txParams);
//     return (estimated * 120n) / 100n;
//   } catch (err) {
//     console.warn('[executeSwap] Gas estimation failed, will let wallet decide:', err);
//     return undefined;
//   }
// }

// async function pollForReceipt(
//   provider: ethers.BrowserProvider,
//   txHash: string,
//   intervalMs = 2000,
//   timeoutMs = 120_000,
//   onSlow?: () => void
// ): Promise<ethers.TransactionReceipt | null> {
//   const start = Date.now();
//   let notifiedSlow = false;

//   while (Date.now() - start < timeoutMs) {
//     if (!notifiedSlow && Date.now() - start > 45_000) {
//       onSlow?.();
//       notifiedSlow = true;
//     }

//     try {
//       const receipt = await provider.getTransactionReceipt(txHash);
//       if (receipt !== null) {
//         return receipt;
//       }
//     } catch (err) {
//       console.warn('[pollForReceipt] Error fetching receipt, retrying:', err);
//     }
//     await new Promise(resolve => setTimeout(resolve, intervalMs));
//   }

//   console.warn('[pollForReceipt] Timed out waiting for receipt:', txHash);
//   return null;
// }


// export async function fetchEvmQuote(
//   chainId: number | string,
//   request: SwapQuoteRequest,
//   selectedSellAsset: TokenInfo,
//   selectedBuyAsset: TokenInfo
// ): Promise<SwapQuote> {
//   try {
//     console.log(request, "-------------");

//     const normalizedSellAddress = request.tokenIn?.address?.toLowerCase() === NATIVE_ADDRESS.toLowerCase() ? AGGREGATOR_NATIVE_ADDRESS : selectedSellAsset.address;
//     const normalizedBuyAddress = request.tokenOut?.address?.toLowerCase() === NATIVE_ADDRESS.toLowerCase() ? AGGREGATOR_NATIVE_ADDRESS : selectedBuyAsset.address;

//     console.log(normalizedBuyAddress, "bueksnfkd")
//     console.log(normalizedSellAddress, "-----")
//     const isNativeSell = selectedSellAsset.isNative || normalizedSellAddress === AGGREGATOR_NATIVE_ADDRESS;
//     const isNativeBuy = selectedBuyAsset.isNative || normalizedBuyAddress === AGGREGATOR_NATIVE_ADDRESS;

//     if (!isNativeSell && !ethers.isAddress(normalizedSellAddress)) {
//       throw new Error(`Invalid sell token address: ${selectedSellAsset.address}`);
//     }
//     if (!isNativeBuy && !ethers.isAddress(normalizedBuyAddress)) {
//       throw new Error(`Invalid buy token address: ${selectedBuyAsset.address}`);
//     }

//     const adjustedRequest: SwapQuoteRequest = {
//       ...request,
//       tokenIn: {
//         ...selectedSellAsset,
//         address: normalizedSellAddress,
//         balance: selectedSellAsset.balance || '0',
//         logoUri: selectedSellAsset.logoURI || null,
//         chainId,
//       },
//       tokenOut: {
//         ...selectedBuyAsset,
//         address: normalizedBuyAddress,
//         balance: selectedBuyAsset.balance || '0',
//         logoUri: selectedBuyAsset.logoURI || null,
//         chainId: selectedBuyAsset.chainId || chainId,
//       },
//     } as any;

//     const quote = await getSwapQuote(chainId, adjustedRequest);

//     return {
//       ...quote,
//       inputToken: selectedSellAsset.symbol,
//       outputToken: selectedBuyAsset.symbol,
//     };
//   } catch (error: any) {
//     const message = parseSwapError(error);
//     throw new Error(message);
//   }
// }


// export async function executeSwap(
//   chainId: number | string,
//   quote: SwapQuote,
//   selectedSellAsset: TokenInfo,
//   selectedBuyAsset: TokenInfo,
//   senderAddress: string,
//   sellAmount: string,
//   slippageTolerance: number,
//   getProvider: (type: WalletType) => any
// ): Promise<string> {
//   try {
//     const provider = getProvider(WalletType.EVM);
//     if (!provider) throw new Error('EVM wallet not connected');

//     const transactions = await prepareSwapTransaction({
//       chainId,
//       quote,
//       tokenIn: { ...selectedSellAsset, chainId },
//       tokenOut: { ...selectedBuyAsset, chainId: selectedBuyAsset.chainId || chainId },
//       senderAddress,
//       amount: sellAmount,
//       slippageTolerance,
//     } as any);

//     if (!transactions?.length) throw new Error('No transactions received from API');

//     const ethersProvider = new ethers.BrowserProvider(provider);
//     const signer = await ethersProvider.getSigner();
//     const txParamsList = await Promise.all(
//       transactions.map(async (tx) => {
//         const txParams: ethers.TransactionRequest = {
//           from: tx.from || senderAddress,
//           to: tx.to,
//           data: tx.data,
//           value: safeValue(tx.value),
//           type: tx.type === 2 ? 2 : undefined,
//         };

//         if (tx.maxFeePerGas) txParams.maxFeePerGas = BigInt(tx.maxFeePerGas);
//         if (tx.maxPriorityFeePerGas) txParams.maxPriorityFeePerGas = BigInt(tx.maxPriorityFeePerGas);
//         if (tx.nonce != null) txParams.nonce = Number(tx.nonce);

//         try {
//           const { simulateEVMTransaction } = await import('../../evm/utils/evmUtils');
//           const sim = await simulateEVMTransaction(
//             chainId,
//             txParams.from as string,
//             txParams.to as string,
//             txParams.value?.toString() || '0',
//             txParams.data?.toString() || '0x'
//           );
//           txParams.gasLimit = sim.gasLimit;
//         } catch (simError: any) {
//           if (simError.message.includes('Insufficient funds')) throw simError;
//           console.warn('[executeSwap] Gas sim failed, using fallback:', simError.message);
//           const apiLimit = safeGasLimit(tx);
//           txParams.gasLimit = apiLimit !== undefined
//             ? apiLimit
//             : await estimateGasWithBuffer(ethersProvider, txParams);
//         }

//         return txParams;
//       })
//     );

//     let lastTxHash = '';

//     for (let i = 0; i < txParamsList.length; i++) {
//       const txResponse = await signer.sendTransaction(txParamsList[i]);
//       lastTxHash = txResponse.hash;

//       const isLast = i === txParamsList.length - 1;
//       console.log(`[executeSwap] tx ${i + 1}/${txParamsList.length} broadcast:`, lastTxHash);

//       if (isLast) {
//         pollForReceipt(ethersProvider, txResponse.hash).then(receipt => {
//           if (!receipt || receipt.status === 0) {
//             console.error('[executeSwap] Final tx reverted or timed out:', lastTxHash);
//           }
//         });
//       }
//     }

//     return lastTxHash;

//   } catch (error: any) {
//     console.error('[executeSwap] Error:', error);
//     throw new Error(parseSwapError(error));
//   }
// }

// export async function fetch1InchFusionQuote(
//   chain: number | string,
//   tokenIn: string,
//   tokenOut: string,
//   amount: string,
//   walletAddress: string,
//   decimals: number,
// ): Promise<any> {

//   console.log("[fetch1InchFusionQuote] chain:", chain);
//   console.log("[fetch1InchFusionQuote] tokenIn:", tokenIn);
//   console.log("[fetch1InchFusionQuote] tokenOut:", tokenOut);
//   console.log("[fetch1InchFusionQuote] amount:", amount);
//   console.log("[fetch1InchFusionQuote] walletAddress:", walletAddress);
//   console.log("[fetch1InchFusionQuote] decimals:", decimals);
//   try {
//     const quote = await get1InchFusionQuote(chain, {
//       tokenIn,
//       tokenOut,
//       amount: formatAmount(amount, decimals),
//       walletAddress,
//     });
//     return quote;
//   } catch (error: any) {
//     const message = parseSwapError(error);
//     throw new Error(message);
//   }
// }

// export async function execute1InchFusionSwap(
//   chainId: number | string,
//   quote: any,
//   preset: string,
//   senderAddress: string,
//   sellAsset: TokenInfo,
//   buyAsset: TokenInfo,
//   sellAmount: string,
//   getProvider: (type: WalletType) => any,
//   onProgress?: (step: 'approving' | 'signing') => void
// ): Promise<string> {
//   try {
//     const provider = getProvider(WalletType.EVM);
//     if (!provider) throw new Error('EVM wallet not connected');

//     if (quote.deadline && Math.floor(Date.now() / 1000) > Number(quote.deadline)) {
//       throw new Error('Fusion quote has expired — please refresh the quote and try again');
//     }

//     const chainConfig = getChainById(chainId);
//     const chainSymbol = chainConfig?.nativeCurrency.symbol?.toUpperCase() || 'ETH';

//     const amountBN = BigInt(formatAmount(sellAmount, sellAsset.decimals));

//     onProgress?.('approving');

//     const allowanceResult = await ensureFusionAllowance(
//       sellAsset.address,
//       senderAddress,
//       amountBN,
//       provider,
//       chainId
//     );

//     onProgress?.('signing');

//     const buildRequest = {
//       quote,
//       tokenIn: sellAsset.address,
//       tokenOut: buyAsset.address,
//       amount: amountBN.toString(),
//       walletAddress: senderAddress,
//       chain: chainSymbol,
//       preset,
//       isPermit2: allowanceResult.usedPermit2,
//       permit: allowanceResult.permit || '',
//     };

//     const fusionOrder = await build1InchFusionOrder(buildRequest);
//     const { typedData, extension, orderHash } = fusionOrder;

//     if (!typedData) throw new Error('No typed data received for signing');
//     if (!extension) throw new Error('No extension data received from build order');
//     if (!orderHash) throw new Error('No orderHash received from build order');

//     const signature: string = await provider.request({
//       method: 'eth_signTypedData_v4',
//       params: [senderAddress, JSON.stringify(typedData)],
//     });

//     if (!signature) throw new Error('Signature cancelled or failed');

//     const orderMessage = typedData.message;

//     const submitPayload = {
//       chain: chainSymbol,
//       order: {
//         maker: orderMessage.maker,
//         makerAsset: orderMessage.makerAsset,
//         takerAsset: orderMessage.takerAsset,
//         makerTraits: orderMessage.makerTraits,
//         salt: orderMessage.salt,
//         makingAmount: orderMessage.makingAmount,
//         takingAmount: orderMessage.takingAmount,
//         receiver: orderMessage.receiver || senderAddress,
//       },
//       quoteId: quote.quoteId,
//       extension,
//       signature,
//       isPermit2: allowanceResult.usedPermit2,
//       permit: allowanceResult.permit || '',
//     };

//     let retries = 0;
//     const maxRetries = 4;

//     while (retries < maxRetries) {
//       try {
//         await submit1InchFusionOrder(submitPayload);
//         break;
//       } catch (err: any) {
//         retries++;
//         const errMsg = err.message?.toLowerCase() || '';
//         const isAllowanceError =
//           errMsg.includes('allowance') ||
//           errMsg.includes('permit') ||
//           errMsg.includes('balance') ||
//           errMsg.includes('insufficient');

//         if (isAllowanceError && retries < maxRetries) {
//           console.warn(`[execute1InchFusionSwap] Submission failed. Retrying... (${retries}/${maxRetries})`);
//           await new Promise(resolve => setTimeout(resolve, 4000));
//           continue;
//         }
//         throw err;
//       }
//     }

//     return orderHash;
//   } catch (error: any) {
//     console.error('[execute1InchFusionSwap] Error:', error);
//     const message = parseSwapError(error);
//     throw new Error(message);
//   }
// }

// export async function fetchRangoConfirmRoute(
//   requestId: string,
//   fromChainId: number | string,
//   toChainId: number | string,
//   fromAddress: string,
//   toAddress: string
// ): Promise<any> {
//   try {
//     const payload = {
//       requestId,
//       sourceChain: getChainRangoSymbol(fromChainId),
//       destinationChain: getChainRangoSymbol(toChainId),
//       fromAddress,
//       toAddress,
//     };
//     return await confirmRangoRoute(payload);
//   } catch (error: any) {
//     const message = parseSwapError(error);
//     throw new Error(message);
//   }
// }

// export async function fetchRangoCheckApproval(
//   requestId: string,
//   txId: string = ''
// ): Promise<any> {
//   try {
//     return await checkRangoApproval({ requestId, txId });
//   } catch (error: any) {
//     const message = parseSwapError(error);
//     throw new Error(message);
//   }
// }

// export async function fetchRangoPrepareTx(
//   requestId: string,
//   swapsIndex: number = 1
// ): Promise<any> {
//   try {
//     return await prepareRangoTx({ requestId, swaps: swapsIndex });
//   } catch (error: any) {
//     const message = parseSwapError(error);
//     throw new Error(message);
//   }
// }

// export function validateRangoResult(result: any): void {
//   const validationStatus = result?.validationStatus;
//   if (validationStatus && Array.isArray(validationStatus)) {
//     for (const chainStatus of validationStatus) {
//       for (const wallet of (chainStatus.wallets || [])) {
//         for (const asset of (wallet.requiredAssets || [])) {
//           if (!asset.ok) {
//             const symbol = asset.asset?.symbol || 'token';
//             const reason = asset.reason;
//             const required = asset.requiredAmount?.amount || 'unknown';
//             const current = asset.currentAmount?.amount || '0';

//             if (reason === 'FEE') {
//               throw new Error(`Insufficient native tokens for gas fees on ${chainStatus.blockchain}. Required: ${required}, Current: ${current}`);
//             }
//             if (reason === 'INPUT_ASSET') {
//               throw new Error(`Insufficient ${symbol} balance for swap. Required: ${required}, Current: ${current}`);
//             }
//             if (reason === 'FEE_AND_INPUT_ASSET') {
//               throw new Error(`Insufficient ${symbol} and native tokens for fees on ${chainStatus.blockchain}.`);
//             }
//             throw new Error(
//               asset.error ||
//               `Rango validation failed: ${reason || 'Insufficient balance'} for ${symbol} (Required: ${required}, Current: ${current})`
//             );
//           }
//         }
//       }
//     }
//   }
// }

// export async function executeRangoSwap(
//   requestId: string,
//   fromChainId: number | string,
//   evmAddress: string,
//   currentNetwork: string,
//   sellAssetSymbol: string,
//   buyAssetSymbol: string,
//   getProvider: (type: WalletType) => any,
//   callbacks: {
//     setStatus: (status: 'idle' | 'preparing' | 'signing' | 'success' | 'error') => void;
//     setHash: (hash: string) => void;
//     addTransaction: (tx: any) => void;
//   }
// ): Promise<void> {
//   const provider = getProvider(WalletType.EVM);
//   if (!provider) throw new Error('EVM wallet not connected');

//   const buildTxParams = (tx: any) => ({
//     from: tx.from || evmAddress,
//     to: tx.to,
//     data: tx.data || '0x',
//     value: tx.value ? '0x' + BigInt(tx.value).toString(16) : '0x0',
//     ...(tx.gasLimit ? { gas: '0x' + BigInt(tx.gasLimit).toString(16) } : {}),
//     ...(tx.maxFeePerGas ? { maxFeePerGas: '0x' + BigInt(tx.maxFeePerGas).toString(16) } : {}),
//     ...(tx.maxPriorityFeePerGas ? { maxPriorityFeePerGas: '0x' + BigInt(tx.maxPriorityFeePerGas).toString(16) } : {}),
//   });

//   callbacks.setStatus('preparing');

//   const firstResponse = await fetchRangoPrepareTx(requestId, 1);
//   const firstItems = Array.isArray(firstResponse) ? firstResponse : [firstResponse];
//   const firstError = firstItems.find((item: any) => item && !item.ok && item.error);
//   if (firstError) throw new Error(firstError.error);
//   const firstResult = firstItems.find((item: any) => item && item.ok);
//   if (!firstResult) throw new Error('Failed to prepare Rango transaction');

//   const stepCount: number = firstResult.stepsCount ?? firstResult.route?.swaps?.length ?? 1;

//   for (let stepIndex = 1; stepIndex <= stepCount; stepIndex++) {
//     callbacks.setStatus('preparing');

//     const stepResponse = stepIndex === 1 ? firstResponse : await fetchRangoPrepareTx(requestId, stepIndex);
//     const stepItems = Array.isArray(stepResponse) ? stepResponse : [stepResponse];

//     const stepError = stepItems.find((item: any) => item && !item.ok && item.error);
//     if (stepError) throw new Error(stepError.error);

//     const stepResult = stepItems.find((item: any) => item && item.ok && item.transaction);
//     if (!stepResult) throw new Error(`Failed to prepare Rango transaction for step ${stepIndex}`);

//     const stepTx = stepResult.transaction;

//     if (stepTx.isApprovalTx) {
//       callbacks.setStatus('signing');
//       const approvalTxId = await provider.request({
//         method: 'eth_sendTransaction',
//         params: [buildTxParams(stepTx)],
//       });

//       callbacks.addTransaction({
//         hash: approvalTxId,
//         chainId: fromChainId,
//         type: 'approval',
//         timestamp: Date.now(),
//         description: `Approve ${sellAssetSymbol} for Swap`,
//         from: evmAddress,
//         status: 'pending',
//         network: currentNetwork,
//       });

//       callbacks.setStatus('preparing');

//       let isApproved = false;
//       let approvalAttempts = 0;
//       while (!isApproved && approvalAttempts < 20) {
//         await new Promise(resolve => setTimeout(resolve, 3000));
//         try {
//           const approvalStatus = await fetchRangoCheckApproval(requestId, approvalTxId);
//           if (approvalStatus?.isApproved) {
//             isApproved = true;
//             break;
//           }
//         } catch (e) {
//           console.warn('Rango checkApproval poll failed:', e);
//         }
//         approvalAttempts++;
//       }

//       if (!isApproved) {
//         throw new Error('Approval transaction was not confirmed in time');
//       }

//       const swapTxResponse = await fetchRangoPrepareTx(requestId, stepIndex);
//       const swapTxItems = Array.isArray(swapTxResponse) ? swapTxResponse : [swapTxResponse];

//       const swapTxError = swapTxItems.find((item: any) => item && !item.ok && item.error);
//       if (swapTxError) throw new Error(swapTxError.error);

//       const swapTxResult = swapTxItems.find((item: any) => item && item.ok && item.transaction);
//       if (!swapTxResult) throw new Error(`Failed to prepare Rango swap transaction for step ${stepIndex} after approval`);

//       callbacks.setStatus('signing');
//       const swapTxId = await provider.request({
//         method: 'eth_sendTransaction',
//         params: [buildTxParams(swapTxResult.transaction)],
//       });

//       callbacks.setHash(swapTxId);
//       callbacks.addTransaction({
//         hash: swapTxId,
//         chainId: fromChainId,
//         type: 'swap',
//         timestamp: Date.now(),
//         description: `Rango Swap: ${sellAssetSymbol} \u2192 ${buyAssetSymbol}`,
//         from: evmAddress,
//         status: 'pending',
//         network: currentNetwork,
//       });
//     } else {
//       callbacks.setStatus('signing');
//       const swapTxId = await provider.request({
//         method: 'eth_sendTransaction',
//         params: [buildTxParams(stepTx)],
//       });

//       callbacks.setHash(swapTxId);
//       callbacks.addTransaction({
//         hash: swapTxId,
//         chainId: fromChainId,
//         type: 'swap',
//         timestamp: Date.now(),
//         description: `Rango Swap: ${sellAssetSymbol} \u2192 ${buyAssetSymbol}`,
//         from: evmAddress,
//         status: 'pending',
//         network: currentNetwork,
//       });
//     }
//   }

//   callbacks.setStatus('success');
// }





import { ethers } from 'ethers';

import type { SwapQuote, SwapQuoteRequest } from '../../../types/evm/swap.types';
import { WalletType } from '../../walletconnect/constants/Wallet';
import {
  getSwapQuote,
  prepareSwapTransaction,
  get1InchFusionQuote,
  build1InchFusionOrder,
  submit1InchFusionOrder,
  confirmRangoRoute,
  checkRangoApproval,
  prepareRangoTx,
} from '../service/evmSwapService';

import type { TokenInfo } from '../service/tokenListService';
import { getChainById, getChainRangoSymbol } from './Chainregistry';
import { parseSwapError } from './swapErrorHandler';
import { NATIVE_ADDRESS, AGGREGATOR_NATIVE_ADDRESS } from './assetmanagement/constants';
import { rpcManager } from './rpcProvider';
import { getEVMNetworkConfig } from './evmUtils';

const LIMIT_ORDER_PROTOCOL = '0x111111125421ca6dc452d289314280a0f8842a65';

const ERC20_ALLOWANCE_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

// Ensures the LIMIT_ORDER_PROTOCOL has enough allowance to spend tokens on behalf of the wallet.
// Skips native tokens, checks existing allowance, and sends approval tx only if needed.
export async function ensureFusionAllowance(
  tokenAddress: string,
  walletAddress: string,
  amountBN: bigint,
  provider: any,
  chainId: number | string,
): Promise<{
  approvalTxHash?: string;
}> {
  // // skip native tokens — no approval needed
  if (!tokenAddress || tokenAddress.toLowerCase() === NATIVE_ADDRESS.toLowerCase()) {
    return {};
  }

  let allowance: bigint = 0n;
  let rpcUrls: string[] = [];

  try {
    rpcUrls = getEVMNetworkConfig(chainId).rpcUrls;
  } catch { }

  // // check allowance via public RPC first (more reliable, no wallet popup)
  if (rpcUrls.length > 0) {
    try {
      allowance = await rpcManager.fetchWithFallback(chainId, rpcUrls, async (rpcProvider) => {
        const contract = new ethers.Contract(tokenAddress, ERC20_ALLOWANCE_ABI, rpcProvider);
        return contract.allowance(walletAddress, LIMIT_ORDER_PROTOCOL, { blockTag: 'pending' }) as Promise<bigint>;
      });
    } catch (err) {
      console.warn('[ensureFusionAllowance] RPC fallback failed, trying injected provider:', err);
    }
  }

  // // fall back to injected wallet provider if RPC check failed or returned 0
  if (allowance === 0n && provider) {
    try {
      const ethersProvider = new ethers.BrowserProvider(provider);
      const contract = new ethers.Contract(tokenAddress, ERC20_ALLOWANCE_ABI, ethersProvider);
      allowance = await contract.allowance(walletAddress, LIMIT_ORDER_PROTOCOL, { blockTag: 'pending' });
    } catch (err) {
      console.warn('[ensureFusionAllowance] Injected provider allowance check failed:', err);
    }
  }

  // // already approved — skip sending tx
  if (BigInt(allowance) >= amountBN) {
    return {};
  }

  if (!provider) {
    throw new Error('No provider available for approval transaction');
  }

  try {
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    // // encode approve(spender, MaxUint256) calldata
    const iface = new ethers.Interface(ERC20_ALLOWANCE_ABI);
    const data = iface.encodeFunctionData('approve', [LIMIT_ORDER_PROTOCOL, ethers.MaxUint256]);

    // // estimate gas with 20% buffer, fallback to 100000 if estimation fails
    let gasLimit: bigint;
    try {
      const estimated = await ethersProvider.estimateGas({
        from: walletAddress,
        to: tokenAddress,
        data,
        value: 0n,
      });
      gasLimit = (estimated * 120n) / 100n;
    } catch (err: any) {
      console.warn('[ensureFusionAllowance] Gas estimation failed, using fallback:', err);
      if (err.message?.includes('Insufficient funds')) throw err;
      gasLimit = 100000n;
    }

    const feeData = await ethersProvider.getFeeData();
    console.log(feeData, 'fee dataaaaa');

    let gasParams: Partial<ethers.TransactionRequest> = {};

    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      // // EIP-1559 chain — use maxFeePerGas + maxPriorityFeePerGas with 20% buffer
      gasParams = {
        type: 2,
        maxFeePerGas: (feeData.maxFeePerGas * 120n) / 100n,
        maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas * 120n) / 100n,
      };
    } else if (feeData.gasPrice) {
      // // legacy chain — use gasPrice with 20% buffer
      gasParams = {
        type: 0,
        gasPrice: (feeData.gasPrice * 120n) / 100n,
      };
    } else {
      throw new Error('Could not determine gas price');
    }

    const approveTx = await signer.sendTransaction({
      from: walletAddress,
      to: tokenAddress,
      data,
      value: 0n,
      gasLimit,
      ...gasParams,
    });

    console.log('[ensureFusionAllowance] Approval tx sent:', approveTx.hash);
    const receipt = await approveTx.wait();
    console.log('[ensureFusionAllowance] Approval tx confirmed:', receipt?.hash);

    return {
      approvalTxHash: receipt?.hash,
    };
  } catch (err: any) {
    console.error('[ensureFusionAllowance] Approval tx failed:', err);
    throw new Error(`Token approval failed: ${err.message}`);
  }
}

// Safely parses a decimal amount string into raw token units (BigInt-compatible string).
export function formatAmount(amount: string, decimals: number): string {
  if (!amount) return '0';
  try {
    const parts = amount.split('.');
    let cleanAmount = amount;
    if (parts.length > 1) {
      // // trim decimals to token precision to avoid parseUnits overflow
      cleanAmount = parts[0] + '.' + parts[1].slice(0, decimals);
    }
    return ethers.parseUnits(cleanAmount, decimals).toString();
  } catch (err) {
    console.warn('[formatAmount] Fallback to raw amount due to error:', err);
    return amount;
  }
}

// Safely converts a raw string to BigInt, returns 0n on failure.
function safeValue(raw: string | undefined | null): bigint {
  if (raw === undefined || raw === null || raw === '') return 0n;
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

// Returns a valid gasLimit from tx fields, or undefined if missing/invalid.
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

// Estimates gas for a tx and applies 20% buffer. Returns undefined if estimation fails.
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

// Polls for a tx receipt until confirmed or timeout (default 2min).
// Calls onSlow after 45s if still pending.
async function pollForReceipt(
  provider: ethers.BrowserProvider,
  txHash: string,
  intervalMs = 2000,
  timeoutMs = 120_000,
  onSlow?: () => void
): Promise<ethers.TransactionReceipt | null> {
  const start = Date.now();
  let notifiedSlow = false;

  while (Date.now() - start < timeoutMs) {
    if (!notifiedSlow && Date.now() - start > 45_000) {
      onSlow?.();
      notifiedSlow = true;
    }

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

// Fetches a swap quote from the aggregator, normalizing native token addresses.
export async function fetchEvmQuote(
  chainId: number | string,
  request: SwapQuoteRequest,
  selectedSellAsset: TokenInfo,
  selectedBuyAsset: TokenInfo
): Promise<SwapQuote> {
  try {
    console.log(request, "-------------");

    // // map native address to aggregator-compatible address
    const normalizedSellAddress = request.tokenIn?.address?.toLowerCase() === NATIVE_ADDRESS.toLowerCase() ? AGGREGATOR_NATIVE_ADDRESS : selectedSellAsset.address;
    const normalizedBuyAddress = request.tokenOut?.address?.toLowerCase() === NATIVE_ADDRESS.toLowerCase() ? AGGREGATOR_NATIVE_ADDRESS : selectedBuyAsset.address;

    console.log(normalizedBuyAddress, "bueksnfkd");
    console.log(normalizedSellAddress, "-----");

    const isNativeSell = selectedSellAsset.isNative || normalizedSellAddress === AGGREGATOR_NATIVE_ADDRESS;
    const isNativeBuy = selectedBuyAsset.isNative || normalizedBuyAddress === AGGREGATOR_NATIVE_ADDRESS;

    if (!isNativeSell && !ethers.isAddress(normalizedSellAddress)) {
      throw new Error(`Invalid sell token address: ${selectedSellAsset.address}`);
    }
    if (!isNativeBuy && !ethers.isAddress(normalizedBuyAddress)) {
      throw new Error(`Invalid buy token address: ${selectedBuyAsset.address}`);
    }

    const adjustedRequest: SwapQuoteRequest = {
      ...request,
      tokenIn: {
        ...selectedSellAsset,
        address: normalizedSellAddress,
        balance: selectedSellAsset.balance || '0',
        logoUri: selectedSellAsset.logoURI || null,
        chainId,
      },
      tokenOut: {
        ...selectedBuyAsset,
        address: normalizedBuyAddress,
        balance: selectedBuyAsset.balance || '0',
        logoUri: selectedBuyAsset.logoURI || null,
        chainId: selectedBuyAsset.chainId || chainId,
      },
    } as any;

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

// Executes a standard aggregator swap — prepares txs, simulates gas, and sends sequentially.
// Returns the hash of the last (swap) transaction.
export async function executeSwap(
  chainId: number | string,
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
    if (!provider) throw new Error('EVM wallet not connected');

    const transactions = await prepareSwapTransaction({
      chainId,
      quote,
      tokenIn: { ...selectedSellAsset, chainId },
      tokenOut: { ...selectedBuyAsset, chainId: selectedBuyAsset.chainId || chainId },
      senderAddress,
      amount: sellAmount,
      slippageTolerance,
    } as any);

    if (!transactions?.length) throw new Error('No transactions received from API');

    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    // // build and simulate each tx in parallel before sending
    const txParamsList = await Promise.all(
      transactions.map(async (tx) => {
        const txParams: ethers.TransactionRequest = {
          from: tx.from || senderAddress,
          to: tx.to,
          data: tx.data,
          value: safeValue(tx.value),
          type: tx.type === 2 ? 2 : undefined,
        };

        if (tx.maxFeePerGas) txParams.maxFeePerGas = BigInt(tx.maxFeePerGas);
        if (tx.maxPriorityFeePerGas) txParams.maxPriorityFeePerGas = BigInt(tx.maxPriorityFeePerGas);
        if (tx.nonce != null) txParams.nonce = Number(tx.nonce);

        try {
          // // simulate tx to get accurate gasLimit
          const { simulateEVMTransaction } = await import('../../evm/utils/evmUtils');
          const sim = await simulateEVMTransaction(
            chainId,
            txParams.from as string,
            txParams.to as string,
            txParams.value?.toString() || '0',
            txParams.data?.toString() || '0x'
          );
          txParams.gasLimit = sim.gasLimit;
        } catch (simError: any) {
          if (simError.message.includes('Insufficient funds')) throw simError;
          console.warn('[executeSwap] Gas sim failed, using fallback:', simError.message);
          // // fallback: use API-provided gasLimit, then ethers estimate, then let wallet decide
          const apiLimit = safeGasLimit(tx);
          txParams.gasLimit = apiLimit !== undefined
            ? apiLimit
            : await estimateGasWithBuffer(ethersProvider, txParams);
        }

        return txParams;
      })
    );

    let lastTxHash = '';

    // // send txs sequentially (approval first, then swap)
    for (let i = 0; i < txParamsList.length; i++) {
      const txResponse = await signer.sendTransaction(txParamsList[i]);
      lastTxHash = txResponse.hash;

      const isLast = i === txParamsList.length - 1;
      console.log(`[executeSwap] tx ${i + 1}/${txParamsList.length} broadcast:`, lastTxHash);

      if (isLast) {
        // // fire-and-forget receipt poll for the final swap tx
        pollForReceipt(ethersProvider, txResponse.hash).then(receipt => {
          if (!receipt || receipt.status === 0) {
            console.error('[executeSwap] Final tx reverted or timed out:', lastTxHash);
          }
        });
      }
    }

    return lastTxHash;

  } catch (error: any) {
    console.error('[executeSwap] Error:', error);
    throw new Error(parseSwapError(error));
  }
}

// Fetches a 1inch Fusion quote (gasless intent-based swap).
export async function fetch1InchFusionQuote(
  chain: number | string,
  tokenIn: string,
  tokenOut: string,
  amount: string,
  walletAddress: string,
  decimals: number,
): Promise<any> {
  console.log("[fetch1InchFusionQuote] chain:", chain);
  console.log("[fetch1InchFusionQuote] tokenIn:", tokenIn);
  console.log("[fetch1InchFusionQuote] tokenOut:", tokenOut);
  console.log("[fetch1InchFusionQuote] amount:", amount);
  console.log("[fetch1InchFusionQuote] walletAddress:", walletAddress);
  console.log("[fetch1InchFusionQuote] decimals:", decimals);

  try {
    const quote = await get1InchFusionQuote(chain, {
      tokenIn,
      tokenOut,
      amount: formatAmount(amount, decimals),
      walletAddress,
    });
    return quote;
  } catch (error: any) {
    const message = parseSwapError(error);
    throw new Error(message);
  }
}

// Executes a 1inch Fusion (gasless) swap:
// 1. Ensures token allowance
// 2. Builds and signs a typed order (EIP-712)
// 3. Submits the signed order, with retries on allowance-related errors
// Returns the orderHash (not a tx hash — Fusion orders are filled off-chain by resolvers).
export async function execute1InchFusionSwap(
  chainId: number | string,
  quote: any,
  preset: string,
  senderAddress: string,
  sellAsset: TokenInfo,
  buyAsset: TokenInfo,
  sellAmount: string,
  getProvider: (type: WalletType) => any,
  onProgress?: (step: 'approving' | 'signing') => void
): Promise<string> {
  try {
    const provider = getProvider(WalletType.EVM);
    if (!provider) throw new Error('EVM wallet not connected');

    // // reject stale quotes early before any on-chain interaction
    if (quote.deadline && Math.floor(Date.now() / 1000) > Number(quote.deadline)) {
      throw new Error('Fusion quote has expired — please refresh the quote and try again');
    }

    const chainConfig = getChainById(chainId);
    const chainSymbol = chainConfig?.nativeCurrency.symbol?.toUpperCase() || 'ETH';

    const amountBN = BigInt(formatAmount(sellAmount, sellAsset.decimals));

    onProgress?.('approving');

    // // ensure LIMIT_ORDER_PROTOCOL is approved to spend the sell token
    await ensureFusionAllowance(
      sellAsset.address,
      senderAddress,
      amountBN,
      provider,
      chainId
    );

    onProgress?.('signing');

    const buildRequest = {
      quote,
      tokenIn: sellAsset.address,
      tokenOut: buyAsset.address,
      amount: amountBN.toString(),
      walletAddress: senderAddress,
      chain: chainSymbol,
      preset,
      permit: '',
    };

    const fusionOrder = await build1InchFusionOrder(buildRequest);
    const { typedData, extension, orderHash } = fusionOrder;

    if (!typedData) throw new Error('No typed data received for signing');
    if (!extension) throw new Error('No extension data received from build order');
    if (!orderHash) throw new Error('No orderHash received from build order');

    // // request EIP-712 signature from wallet (no on-chain tx, just a signature)
    const signature: string = await provider.request({
      method: 'eth_signTypedData_v4',
      params: [senderAddress, JSON.stringify(typedData)],
    });

    if (!signature) throw new Error('Signature cancelled or failed');

    const orderMessage = typedData.message;

    const submitPayload = {
      chain: chainSymbol,
      order: {
        maker: orderMessage.maker,
        makerAsset: orderMessage.makerAsset,
        takerAsset: orderMessage.takerAsset,
        makerTraits: orderMessage.makerTraits,
        salt: orderMessage.salt,
        makingAmount: orderMessage.makingAmount,
        takingAmount: orderMessage.takingAmount,
        receiver: orderMessage.receiver || senderAddress,
      },
      quoteId: quote.quoteId,
      extension,
      signature,
      permit: '',
    };

    let retries = 0;
    const maxRetries = 4;

    // // retry submission if resolver rejects due to allowance/balance propagation delay
    while (retries < maxRetries) {
      try {
        await submit1InchFusionOrder(submitPayload);
        break;
      } catch (err: any) {
        retries++;
        const errMsg = err.message?.toLowerCase() || '';
        const isAllowanceError =
          errMsg.includes('allowance') ||
          errMsg.includes('permit') ||
          errMsg.includes('balance') ||
          errMsg.includes('insufficient');

        if (isAllowanceError && retries < maxRetries) {
          console.warn(`[execute1InchFusionSwap] Submission failed. Retrying... (${retries}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 4000));
          continue;
        }
        throw err;
      }
    }

    return orderHash;
  } catch (error: any) {
    console.error('[execute1InchFusionSwap] Error:', error);
    const message = parseSwapError(error);
    throw new Error(message);
  }
}

// Confirms a Rango cross-chain route before execution.
export async function fetchRangoConfirmRoute(
  requestId: string,
  fromChainId: number | string,
  toChainId: number | string,
  fromAddress: string,
  toAddress: string
): Promise<any> {
  try {
    const payload = {
      requestId,
      sourceChain: getChainRangoSymbol(fromChainId),
      destinationChain: getChainRangoSymbol(toChainId),
      fromAddress,
      toAddress,
    };
    return await confirmRangoRoute(payload);
  } catch (error: any) {
    const message = parseSwapError(error);
    throw new Error(message);
  }
}

// Polls Rango to check if an approval tx has been indexed and accepted.
export async function fetchRangoCheckApproval(
  requestId: string,
  txId: string = ''
): Promise<any> {
  try {
    return await checkRangoApproval({ requestId, txId });
  } catch (error: any) {
    const message = parseSwapError(error);
    throw new Error(message);
  }
}

// Fetches a prepared Rango tx for a given step index in the swap route.
export async function fetchRangoPrepareTx(
  requestId: string,
  swapsIndex: number = 1
): Promise<any> {
  try {
    return await prepareRangoTx({ requestId, swaps: swapsIndex });
  } catch (error: any) {
    const message = parseSwapError(error);
    throw new Error(message);
  }
}

// Throws a human-readable error if Rango's validation check finds any asset shortfall.
export function validateRangoResult(result: any): void {
  const validationStatus = result?.validationStatus;
  if (validationStatus && Array.isArray(validationStatus)) {
    for (const chainStatus of validationStatus) {
      for (const wallet of (chainStatus.wallets || [])) {
        for (const asset of (wallet.requiredAssets || [])) {
          if (!asset.ok) {
            const symbol = asset.asset?.symbol || 'token';
            const reason = asset.reason;
            const required = asset.requiredAmount?.amount || 'unknown';
            const current = asset.currentAmount?.amount || '0';

            if (reason === 'FEE') {
              throw new Error(`Insufficient native tokens for gas fees on ${chainStatus.blockchain}. Required: ${required}, Current: ${current}`);
            }
            if (reason === 'INPUT_ASSET') {
              throw new Error(`Insufficient ${symbol} balance for swap. Required: ${required}, Current: ${current}`);
            }
            if (reason === 'FEE_AND_INPUT_ASSET') {
              throw new Error(`Insufficient ${symbol} and native tokens for fees on ${chainStatus.blockchain}.`);
            }
            throw new Error(
              asset.error ||
              `Rango validation failed: ${reason || 'Insufficient balance'} for ${symbol} (Required: ${required}, Current: ${current})`
            );
          }
        }
      }
    }
  }
}

// Executes a Rango multi-step cross-chain swap.
// Handles approval txs inline per step, polls for confirmation, then sends the swap tx.
export async function executeRangoSwap(
  requestId: string,
  fromChainId: number | string,
  evmAddress: string,
  currentNetwork: string,
  sellAssetSymbol: string,
  buyAssetSymbol: string,
  getProvider: (type: WalletType) => any,
  callbacks: {
    setStatus: (status: 'idle' | 'preparing' | 'signing' | 'success' | 'error') => void;
    setHash: (hash: string) => void;
    addTransaction: (tx: any) => void;
  }
): Promise<void> {
  const provider = getProvider(WalletType.EVM);
  if (!provider) throw new Error('EVM wallet not connected');

  // // converts Rango tx fields to eth_sendTransaction-compatible hex params
  const buildTxParams = (tx: any) => ({
    from: tx.from || evmAddress,
    to: tx.to,
    data: tx.data || '0x',
    value: tx.value ? '0x' + BigInt(tx.value).toString(16) : '0x0',
    ...(tx.gasLimit ? { gas: '0x' + BigInt(tx.gasLimit).toString(16) } : {}),
    ...(tx.maxFeePerGas ? { maxFeePerGas: '0x' + BigInt(tx.maxFeePerGas).toString(16) } : {}),
    ...(tx.maxPriorityFeePerGas ? { maxPriorityFeePerGas: '0x' + BigInt(tx.maxPriorityFeePerGas).toString(16) } : {}),
  });

  callbacks.setStatus('preparing');

  // // fetch step 1 first to get total step count for the route
  const firstResponse = await fetchRangoPrepareTx(requestId, 1);
  const firstItems = Array.isArray(firstResponse) ? firstResponse : [firstResponse];
  const firstError = firstItems.find((item: any) => item && !item.ok && item.error);
  if (firstError) throw new Error(firstError.error);
  const firstResult = firstItems.find((item: any) => item && item.ok);
  if (!firstResult) throw new Error('Failed to prepare Rango transaction');

  const stepCount: number = firstResult.stepsCount ?? firstResult.route?.swaps?.length ?? 1;

  // // iterate each route step — some steps may require an approval tx before the swap tx
  for (let stepIndex = 1; stepIndex <= stepCount; stepIndex++) {
    callbacks.setStatus('preparing');

    // // reuse step 1 response to avoid double-fetching
    const stepResponse = stepIndex === 1 ? firstResponse : await fetchRangoPrepareTx(requestId, stepIndex);
    const stepItems = Array.isArray(stepResponse) ? stepResponse : [stepResponse];

    const stepError = stepItems.find((item: any) => item && !item.ok && item.error);
    if (stepError) throw new Error(stepError.error);

    const stepResult = stepItems.find((item: any) => item && item.ok && item.transaction);
    if (!stepResult) throw new Error(`Failed to prepare Rango transaction for step ${stepIndex}`);

    const stepTx = stepResult.transaction;

    if (stepTx.isApprovalTx) {
      // // send approval tx and wait for Rango to confirm it before proceeding
      callbacks.setStatus('signing');
      const approvalTxId = await provider.request({
        method: 'eth_sendTransaction',
        params: [buildTxParams(stepTx)],
      });

      callbacks.addTransaction({
        hash: approvalTxId,
        chainId: fromChainId,
        type: 'approval',
        timestamp: Date.now(),
        description: `Approve ${sellAssetSymbol} for Swap`,
        from: evmAddress,
        status: 'pending',
        network: currentNetwork,
      });

      callbacks.setStatus('preparing');

      // // poll Rango approval status (max ~60s) before fetching the actual swap tx
      let isApproved = false;
      let approvalAttempts = 0;
      while (!isApproved && approvalAttempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        try {
          const approvalStatus = await fetchRangoCheckApproval(requestId, approvalTxId);
          if (approvalStatus?.isApproved) {
            isApproved = true;
            break;
          }
        } catch (e) {
          console.warn('Rango checkApproval poll failed:', e);
        }
        approvalAttempts++;
      }

      if (!isApproved) {
        throw new Error('Approval transaction was not confirmed in time');
      }

      // // re-fetch swap tx for this step now that approval is confirmed
      const swapTxResponse = await fetchRangoPrepareTx(requestId, stepIndex);
      const swapTxItems = Array.isArray(swapTxResponse) ? swapTxResponse : [swapTxResponse];

      const swapTxError = swapTxItems.find((item: any) => item && !item.ok && item.error);
      if (swapTxError) throw new Error(swapTxError.error);

      const swapTxResult = swapTxItems.find((item: any) => item && item.ok && item.transaction);
      if (!swapTxResult) throw new Error(`Failed to prepare Rango swap transaction for step ${stepIndex} after approval`);

      callbacks.setStatus('signing');
      const swapTxId = await provider.request({
        method: 'eth_sendTransaction',
        params: [buildTxParams(swapTxResult.transaction)],
      });

      callbacks.setHash(swapTxId);
      callbacks.addTransaction({
        hash: swapTxId,
        chainId: fromChainId,
        type: 'swap',
        timestamp: Date.now(),
        description: `Rango Swap: ${sellAssetSymbol} \u2192 ${buyAssetSymbol}`,
        from: evmAddress,
        status: 'pending',
        network: currentNetwork,
      });
    } else {
      // // no approval needed for this step — send swap tx directly
      callbacks.setStatus('signing');
      const swapTxId = await provider.request({
        method: 'eth_sendTransaction',
        params: [buildTxParams(stepTx)],
      });

      callbacks.setHash(swapTxId);
      callbacks.addTransaction({
        hash: swapTxId,
        chainId: fromChainId,
        type: 'swap',
        timestamp: Date.now(),
        description: `Rango Swap: ${sellAssetSymbol} \u2192 ${buyAssetSymbol}`,
        from: evmAddress,
        status: 'pending',
        network: currentNetwork,
      });
    }
  }

  callbacks.setStatus('success');
}