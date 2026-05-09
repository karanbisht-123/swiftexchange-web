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

// Constants
const LIMIT_ORDER_PROTOCOL = '0x111111125421ca6dc452d289314280a0f8842a65';
const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

// Shared Types
export interface RangoSlippageWarning {
  stepIndex: number;
  stepLabel: string;
  recommendedSlippage: string;
  userSlippage: string;
}

interface RangoCallbacks {
  setStatus: (status: 'idle' | 'preparing' | 'signing' | 'success' | 'error') => void;
  setHash: (hash: string) => void;
  addTransaction: (tx: any) => void;
  onSlippageWarning?: (warning: RangoSlippageWarning) => void;
}

//Safely converts a raw string to BigInt, returns 0n on failure.
function safeValue(raw: string | undefined | null): bigint {
  if (!raw) return 0n;
  try { return BigInt(raw); } catch { return 0n; }
}

// Returns a valid gasLimit bigint from tx fields, or undefined if missing/invalid. 
function safeGasLimit(tx: { gasLimit?: string; gas?: string }): bigint | undefined {
  const raw = tx.gasLimit ?? tx.gas;
  if (!raw) return undefined;
  try {
    const n = BigInt(raw);
    return n > 0n ? n : undefined;
  } catch { return undefined; }
}

// Estimates gas for a tx with 20% buffer. Returns undefined if estimation fails. 
async function estimateGasWithBuffer(
  provider: ethers.BrowserProvider,
  txParams: ethers.TransactionRequest,
): Promise<bigint | undefined> {
  try {
    const estimated = await provider.estimateGas(txParams);
    return (estimated * 120n) / 100n;
  } catch (err) {
    console.warn('[estimateGasWithBuffer] Failed, letting wallet decide:', err);
    return undefined;
  }
}

/**
 * Polls on-chain for a tx receipt until confirmed or timeout.
 * Optionally calls onSlow() after 45s to let the UI surface a "taking longer than usual" message.
 */
async function pollForReceipt(
  provider: ethers.BrowserProvider,
  txHash: string,
  intervalMs = 2_000,
  timeoutMs = 120_000,
  onSlow?: () => void,
): Promise<ethers.TransactionReceipt | null> {
  const start = Date.now();
  let slowFired = false;

  while (Date.now() - start < timeoutMs) {
    if (!slowFired && Date.now() - start > 45_000) {
      onSlow?.();
      slowFired = true;
    }
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt !== null) return receipt;
    } catch {
      // Network hiccup — keep polling
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }

  console.warn('[pollForReceipt] Timed out for:', txHash);
  return null;
}

/**
 * Converts a Rango tx object into eth_sendTransaction-compatible hex params.
 * Handles both EIP-1559 and legacy gas fields.
 */
function buildRangoTxParams(tx: any, fallbackFrom: string): Record<string, string> {
  const params: Record<string, string> = {
    from: tx.from || fallbackFrom,
    to: tx.to,
    data: tx.data || '0x',
    value: tx.value ? '0x' + BigInt(tx.value).toString(16) : '0x0',
  };
  if (tx.gasLimit) params.gas = '0x' + BigInt(tx.gasLimit).toString(16);
  if (tx.maxFeePerGas) params.maxFeePerGas = '0x' + BigInt(tx.maxFeePerGas).toString(16);
  if (tx.maxPriorityFeePerGas) params.maxPriorityFeePerGas = '0x' + BigInt(tx.maxPriorityFeePerGas).toString(16);
  if (!tx.maxFeePerGas && tx.gasPrice) params.gasPrice = '0x' + BigInt(tx.gasPrice).toString(16);
  return params;
}

// Approval
/**
 * Reads on-chain ERC-20 allowance for a given spender.
 * Tries public RPC first (no wallet popup), falls back to injected provider.
 * Returns 0n on any failure.
 */
async function readAllowance(
  tokenAddress: string,
  owner: string,
  spender: string,
  chainId: number | string,
  provider: any,
): Promise<bigint> {
  // public RPC 
  try {
    const rpcUrls = getEVMNetworkConfig(chainId).rpcUrls;
    if (rpcUrls.length > 0) {
      return await rpcManager.fetchWithFallback(chainId, rpcUrls, async (rpcProvider) => {
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, rpcProvider);
        return contract.allowance(owner, spender, { blockTag: 'pending' }) as Promise<bigint>;
      });
    }
  } catch {
    // fall through to injected provider
  }

  // wallet provider
  if (provider) {
    try {
      const ethersProvider = new ethers.BrowserProvider(provider);
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, ethersProvider);
      return await contract.allowance(owner, spender, { blockTag: 'pending' });
    } catch {
      // fall through
    }
  }

  return 0n;
}

/**
 * Sends an ERC-20 approve(spender, MaxUint256) transaction using the injected wallet.
 * Handles EIP-1559 and legacy gas, with 20% buffers on all fee estimates.
 * Returns the confirmed tx hash.
 */
async function sendApprovalTx(
  tokenAddress: string,
  spender: string,
  walletAddress: string,
  provider: any,
): Promise<string> {
  const ethersProvider = new ethers.BrowserProvider(provider);
  const signer = await ethersProvider.getSigner();

  const iface = new ethers.Interface(ERC20_ABI);
  const data = iface.encodeFunctionData('approve', [spender, ethers.MaxUint256]);

  // Gas estimation with 20% buffer; fallback to 100k on failure
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
    if (err.message?.includes('Insufficient funds') || err.message?.includes('insufficient funds')) throw err;
    console.warn('[sendApprovalTx] Gas estimate failed, using 100k fallback');
    gasLimit = 100_000n;
  }

  const feeData = await ethersProvider.getFeeData();
  let gasParams: Partial<ethers.TransactionRequest>;

  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    gasParams = {
      type: 2,
      maxFeePerGas: (feeData.maxFeePerGas * 120n) / 100n,
      maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas * 120n) / 100n,
    };
  } else if (feeData.gasPrice) {
    gasParams = {
      type: 0,
      gasPrice: (feeData.gasPrice * 120n) / 100n,
    };
  } else {
    throw new Error('Could not determine gas price for approval');
  }

  const tx = await signer.sendTransaction({
    from: walletAddress,
    to: tokenAddress,
    data,
    value: 0n,
    gasLimit,
    ...gasParams,
  });

  console.log('[sendApprovalTx] Sent:', tx.hash);
  const receipt = await tx.wait();
  if (!receipt || receipt.status === 0) throw new Error('Approval transaction reverted');
  console.log('[sendApprovalTx] Confirmed:', receipt.hash);
  return receipt.hash;
}

// 1inch Fusion allowance


/**
 * Ensures LIMIT_ORDER_PROTOCOL has enough allowance to spend the sell token.
 * Skips native tokens. Checks on-chain first sends approval only when needed.
 */
export async function ensureFusionAllowance(
  tokenAddress: string,
  walletAddress: string,
  amountBN: bigint,
  provider: any,
  chainId: number | string,
): Promise<{ approvalTxHash?: string }> {
  if (!tokenAddress || tokenAddress.toLowerCase() === NATIVE_ADDRESS.toLowerCase()) {
    return {}; // nativeno approval needed
  }

  const allowance = await readAllowance(tokenAddress, walletAddress, LIMIT_ORDER_PROTOCOL, chainId, provider);

  if (allowance >= amountBN) {
    console.log('[ensureFusionAllowance] Already approved, skipping');
    return {};
  }

  if (!provider) throw new Error('No provider available for approval transaction');

  const approvalTxHash = await sendApprovalTx(tokenAddress, LIMIT_ORDER_PROTOCOL, walletAddress, provider);
  return { approvalTxHash };
}



/** Safely parses a human-readable decimal amount string into raw token units (string). */
export function formatAmount(amount: string, decimals: number): string {
  if (!amount) return '0';
  try {
    const parts = amount.split('.');
    const cleanAmount = parts.length > 1
      ? parts[0] + '.' + parts[1].slice(0, decimals)
      : amount;
    return ethers.parseUnits(cleanAmount, decimals).toString();
  } catch (err) {
    console.warn('[formatAmount] Fallback to raw:', err);
    return amount;
  }
}


// Quote fetching
//Fetches a swap quote from the aggregator, normalizing native token addresses.
export async function fetchEvmQuote(
  chainId: number | string,
  request: SwapQuoteRequest,
  selectedSellAsset: TokenInfo,
  selectedBuyAsset: TokenInfo,
): Promise<SwapQuote> {
  try {
    const normalizedSellAddress =
      request.tokenIn?.address?.toLowerCase() === NATIVE_ADDRESS.toLowerCase()
        ? AGGREGATOR_NATIVE_ADDRESS
        : selectedSellAsset.address;

    const normalizedBuyAddress =
      request.tokenOut?.address?.toLowerCase() === NATIVE_ADDRESS.toLowerCase()
        ? AGGREGATOR_NATIVE_ADDRESS
        : selectedBuyAsset.address;

    const isNativeSell = selectedSellAsset.isNative || normalizedSellAddress === AGGREGATOR_NATIVE_ADDRESS;
    const isNativeBuy = selectedBuyAsset.isNative || normalizedBuyAddress === AGGREGATOR_NATIVE_ADDRESS;

    if (!isNativeSell && !ethers.isAddress(normalizedSellAddress))
      throw new Error(`Invalid sell token address: ${selectedSellAsset.address}`);
    if (!isNativeBuy && !ethers.isAddress(normalizedBuyAddress))
      throw new Error(`Invalid buy token address: ${selectedBuyAsset.address}`);

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
      slippage: request.slippage,
    } as any;

    const quote = await getSwapQuote(chainId, adjustedRequest);
    return {
      ...quote,
      inputToken: selectedSellAsset.symbol,
      outputToken: selectedBuyAsset.symbol,
    };
  } catch (error: any) {
    throw new Error(parseSwapError(error));
  }
}

export async function executeSwap(
  chainId: number | string,
  quote: SwapQuote,
  selectedSellAsset: TokenInfo,
  selectedBuyAsset: TokenInfo,
  senderAddress: string,
  sellAmount: string,
  slippageTolerance: number,
  getProvider: (type: WalletType) => any,
): Promise<string> {
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

  // Build and simulate gas for all txs in parallel before sending any
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
        const { simulateEVMTransaction } = await import('../../evm/utils/evmUtils');
        const sim = await simulateEVMTransaction(
          chainId,
          txParams.from as string,
          txParams.to as string,
          txParams.value?.toString() || '0',
          txParams.data?.toString() || '0x',
        );
        txParams.gasLimit = sim.gasLimit;
      } catch (simError: any) {
        if (simError.message?.includes('Insufficient funds') || simError.message?.includes('insufficient funds')) {
          throw simError;
        }
        console.warn('[executeSwap] Gas sim failed, trying fallback:', simError.message);
        const apiLimit = safeGasLimit(tx);
        txParams.gasLimit = apiLimit ?? await estimateGasWithBuffer(ethersProvider, txParams);
      }

      return txParams;
    }),
  );

  let lastTxHash = '';

  for (let i = 0; i < txParamsList.length; i++) {
    const txResponse = await signer.sendTransaction(txParamsList[i]);
    lastTxHash = txResponse.hash;
    const isLast = i === txParamsList.length - 1;
    console.log(`[executeSwap] tx ${i + 1}/${txParamsList.length} broadcast:`, lastTxHash);

    if (isLast) {
      const receipt = await pollForReceipt(
        ethersProvider,
        txResponse.hash,
        2_000,
        120_000,
        () => console.warn('[executeSwap] Final tx taking longer than expected:', lastTxHash),
      );
      if (!receipt) {
        throw new Error(`Swap transaction timed out. Hash: ${lastTxHash}`);
      }
      if (receipt.status === 0) {
        throw new Error(`Swap transaction reverted on-chain. Hash: ${lastTxHash}`);
      }
    } else {
      // For intermediate transactions (like approvals), we fire-and-forget the receipt polling
      // to avoid blocking the user from signing the next transaction in the sequence.
      pollForReceipt(ethersProvider, txResponse.hash).then(receipt => {
        if (!receipt || receipt.status === 0) {
          console.error(`[executeSwap] Intermediate transaction ${i + 1} failed:`, txResponse.hash);
        }
      });
    }
  }

  return lastTxHash;
}
export async function fetch1InchFusionQuote(
  chain: number | string,
  tokenIn: string,
  tokenOut: string,
  amount: string,
  walletAddress: string,
  decimals: number,
): Promise<any> {
  try {
    return await get1InchFusionQuote(chain, {
      tokenIn,
      tokenOut,
      amount: formatAmount(amount, decimals),
      walletAddress,
    });
  } catch (error: any) {
    throw new Error(parseSwapError(error));
  }
}

export async function execute1InchFusionSwap(
  chainId: number | string,
  quote: any,
  preset: string,
  senderAddress: string,
  sellAsset: TokenInfo,
  buyAsset: TokenInfo,
  sellAmount: string,
  getProvider: (type: WalletType) => any,
  onProgress?: (step: 'approving' | 'signing') => void,
): Promise<string> {
  const provider = getProvider(WalletType.EVM);
  if (!provider) throw new Error('EVM wallet not connected');

  // Reject stale quotes before any on-chain interaction
  if (quote.deadline && Math.floor(Date.now() / 1000) > Number(quote.deadline)) {
    throw new Error('Fusion quote has expired — please refresh and try again');
  }

  const chainConfig = getChainById(chainId);
  const chainSymbol = chainConfig?.nativeCurrency.symbol?.toUpperCase() || 'ETH';
  const amountBN = BigInt(formatAmount(sellAmount, sellAsset.decimals));

  onProgress?.('approving');
  await ensureFusionAllowance(sellAsset.address, senderAddress, amountBN, provider, chainId);

  onProgress?.('signing');

  const fusionOrder = await build1InchFusionOrder({
    quote,
    tokenIn: sellAsset.address,
    tokenOut: buyAsset.address,
    amount: amountBN.toString(),
    walletAddress: senderAddress,
    chain: chainSymbol,
    preset,
    permit: '',
  });

  const { typedData, extension, orderHash } = fusionOrder;
  if (!typedData) throw new Error('No typed data received for signing');
  if (!extension) throw new Error('No extension data received from build order');
  if (!orderHash) throw new Error('No orderHash received from build order');

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


  const MAX_RETRIES = 4;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await submit1InchFusionOrder(submitPayload);
      break;
    } catch (err: any) {
      const msg = err.message?.toLowerCase() ?? '';
      const isTransient =
        msg.includes('allowance') || msg.includes('permit') ||
        msg.includes('balance') || msg.includes('insufficient');

      if (isTransient && attempt < MAX_RETRIES) {
        console.warn(`[execute1InchFusionSwap] Submission failed, retrying (${attempt}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, 4_000));
        continue;
      }
      console.log(err, "fustion errr ")
      throw new Error(parseSwapError(err));
    }
  }

  return orderHash;
}

//Confirms a Rango cross-chain route before execution. 
export async function fetchRangoConfirmRoute(
  requestId: string,
  fromChainId: number | string,
  toChainId: number | string,
  fromAddress: string,
  toAddress: string,
): Promise<any> {
  try {
    return await confirmRangoRoute({
      requestId,
      sourceChain: getChainRangoSymbol(fromChainId),
      destinationChain: getChainRangoSymbol(toChainId),
      fromAddress,
      toAddress,
    });
  } catch (error: any) {
    throw new Error(parseSwapError(error));
  }
}

//Polls Rango to check if an approval tx has been indexed and accepted.
export async function fetchRangoCheckApproval(requestId: string, txId = ''): Promise<any> {
  try {
    return await checkRangoApproval({ requestId, txId });
  } catch (error: any) {
    throw new Error(parseSwapError(error));
  }
}

// Fetches a prepared Rango tx for a given step index. 
export async function fetchRangoPrepareTx(requestId: string, swapsIndex = 1): Promise<any> {
  try {
    return await prepareRangoTx({ requestId, swaps: swapsIndex });
  } catch (error: any) {
    throw new Error(parseSwapError(error));
  }
}

export function validateRangoResult(result: any): void {
  if (!Array.isArray(result?.validationStatus)) return;

  for (const chainStatus of result.validationStatus) {
    for (const wallet of chainStatus.wallets ?? []) {
      for (const asset of wallet.requiredAssets ?? []) {
        if (asset.ok) continue;

        const symbol = asset.asset?.symbol ?? 'token';
        const blockchain = chainStatus.blockchain ?? '';
        const required = asset.requiredAmount?.amount ?? 'unknown';
        const current = asset.currentAmount?.amount ?? '0';

        switch (asset.reason) {
          case 'FEE':
            throw new Error(`Insufficient native tokens for gas on ${blockchain}. Need: ${required}, have: ${current}`);
          case 'INPUT_ASSET':
            throw new Error(`Insufficient ${symbol}. Need: ${required}, have: ${current}`);
          case 'FEE_AND_INPUT_ASSET':
            throw new Error(`Insufficient ${symbol} and native tokens for fees on ${blockchain}.`);
          default:
            throw new Error(
              asset.error ??
              `Rango validation failed: ${asset.reason ?? 'insufficient balance'} for ${symbol} (need: ${required}, have: ${current})`,
            );
        }
      }
    }
  }
}

export function extractRangoSlippageRecommendations(
  rangoQuoteResult: any,
): Array<{ stepIndex: number; stepLabel: string; recommendedSlippage: string }> {
  const results: Array<{ stepIndex: number; stepLabel: string; recommendedSlippage: string }> = [];

  for (const [idx, swap] of (rangoQuoteResult?.swaps ?? []).entries()) {
    if (swap?.recommendedSlippage?.slippage != null && !swap.recommendedSlippage.error) {
      results.push({
        stepIndex: idx,
        stepLabel: swap.swapperId ?? `Step ${idx + 1}`,
        recommendedSlippage: String(swap.recommendedSlippage.slippage),
      });
    }

    for (const iSwap of swap?.internalSwaps ?? []) {
      if (iSwap?.recommendedSlippage?.slippage == null || iSwap.recommendedSlippage.error) continue;
      const val = String(iSwap.recommendedSlippage.slippage);
      if (!results.some(r => r.stepIndex === idx && r.recommendedSlippage === val)) {
        results.push({
          stepIndex: idx,
          stepLabel: `${swap.swapperId ?? `Step ${idx + 1}`} › ${iSwap.swapperId}`,
          recommendedSlippage: val,
        });
      }
    }
  }

  return results;
}

//Returns the highest-severity slippage warning across all steps, or null if user's setting is fine. 
export function getRangoSlippageWarning(
  rangoQuoteResult: any,
  userSlippage: number,
): RangoSlippageWarning | null {
  const recs = extractRangoSlippageRecommendations(rangoQuoteResult);
  let worst: (typeof recs)[0] | null = null;

  for (const rec of recs) {
    const val = parseFloat(rec.recommendedSlippage);
    if (isNaN(val) || val <= userSlippage) continue;
    if (!worst || val > parseFloat(worst.recommendedSlippage)) worst = rec;
  }

  return worst ? { ...worst, userSlippage: String(userSlippage) } : null;
}

/**
 * Polls Rango's /checkApproval until isApproved=true or timeout.
 * Resolves true on success, never throws — caller races this against on-chain polling.
 */
async function pollRangoApprovalStatus(
  requestId: string,
  txId: string,
  timeoutMs: number,
  intervalMs = 3_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, intervalMs));
    try {
      const status = await checkRangoApproval({ requestId, txId });
      if (status?.isApproved) return true;
    } catch {
      // Rango API flaky keep polling
    }
  }
  return false;
}

async function waitForApprovalConfirmation(
  ethersProvider: ethers.BrowserProvider,
  requestId: string,
  approvalTxHash: string,
  timeoutMs = 90_000,
): Promise<boolean> {
  const rangoRace = pollRangoApprovalStatus(requestId, approvalTxHash, timeoutMs);

  const onChainRace = pollForReceipt(ethersProvider, approvalTxHash, 3_000, timeoutMs).then(
    (receipt) => {
      if (receipt && receipt.status === 1) return true;
      if (receipt && receipt.status === 0) throw new Error(`Approval tx reverted: ${approvalTxHash}`);
      return false;
    },
  );
  try {
    return await Promise.any([
      rangoRace.then(v => { if (!v) throw new Error('not yet'); return true; }),
      onChainRace.then(v => { if (!v) throw new Error('not yet'); return true; }),
    ]);
  } catch {
    return false;
  }
}

let _rangoExecutionLock = false;


export async function executeRangoSwap(
  requestId: string,
  fromChainId: number | string,
  evmAddress: string,
  currentNetwork: string,
  sellAssetSymbol: string,
  buyAssetSymbol: string,
  getProvider: (type: WalletType) => any,
  callbacks: RangoCallbacks,
  userSlippage = 1,
): Promise<void> {
  if (_rangoExecutionLock) {
    throw new Error('A Rango swap is already in progress. Please wait.');
  }
  _rangoExecutionLock = true;

  try {
    await _runRangoSteps(
      requestId, fromChainId, evmAddress, currentNetwork,
      sellAssetSymbol, buyAssetSymbol, getProvider, callbacks, userSlippage,
    );
  } finally {
    _rangoExecutionLock = false;
  }
}

async function _runRangoSteps(
  requestId: string,
  fromChainId: number | string,
  evmAddress: string,
  currentNetwork: string,
  sellAssetSymbol: string,
  buyAssetSymbol: string,
  getProvider: (type: WalletType) => any,
  callbacks: RangoCallbacks,
  userSlippage: number,
): Promise<void> {
  const provider = getProvider(WalletType.EVM);
  if (!provider) throw new Error('EVM wallet not connected');

  const ethersProvider = new ethers.BrowserProvider(provider);

  callbacks.setStatus('preparing');

  // Fetch step 1 to discover total step count 
  const firstRaw = await fetchRangoPrepareTx(requestId, 1);
  const firstItems: any[] = Array.isArray(firstRaw) ? firstRaw : [firstRaw];

  const firstError = firstItems.find((item: any) => item && !item.ok && item.error);
  if (firstError) throw new Error(firstError.error);

  const firstResult = firstItems.find((item: any) => item?.ok);
  if (!firstResult) throw new Error('Rango returned no valid transaction for step 1');

  // Derive stepCount
  const swapsFromRoute: any[] = firstResult.route?.swaps ?? [];
  const stepCount = Math.max(1, firstResult.stepsCount ?? swapsFromRoute.length);

  console.log(`[executeRangoSwap] Route has ${stepCount} step(s)`);

  //Process each step
  for (let step = 1; step <= stepCount; step++) {
    callbacks.setStatus('preparing');

    const stepRaw = step === 1 ? firstRaw : await fetchRangoPrepareTx(requestId, step);
    const stepItems: any[] = Array.isArray(stepRaw) ? stepRaw : [stepRaw];

    const stepError = stepItems.find((item: any) => item && !item.ok && item.error);
    if (stepError) throw new Error(stepError.error);

    const stepResult = stepItems.find((item: any) => item?.ok && item?.transaction);
    if (!stepResult) throw new Error(`Rango returned no transaction for step ${step}/${stepCount}`);

    const stepTx = stepResult.transaction;

    //Per-step slippage warning
    const routeSwap = swapsFromRoute[step - 1];
    if (routeSwap?.recommendedSlippage?.slippage != null && !routeSwap.recommendedSlippage.error) {
      const recommended = parseFloat(routeSwap.recommendedSlippage.slippage);
      if (!isNaN(recommended) && recommended > userSlippage) {
        callbacks.onSlippageWarning?.({
          stepIndex: step - 1,
          stepLabel: routeSwap.swapperId ?? `Step ${step}`,
          recommendedSlippage: String(recommended),
          userSlippage: String(userSlippage),
        });
      }
    }

    // isApprovalTx check

    if (stepTx.isApprovalTx) {
      console.log(`[executeRangoSwap] Step ${step}: approval tx required`);
      callbacks.setStatus('signing');

      // Send approval tx — user signs once in their wallet
      const approvalTxHash: string = await provider.request({
        method: 'eth_sendTransaction',
        params: [buildRangoTxParams(stepTx, evmAddress)],
      });

      console.log(`[executeRangoSwap] Step ${step}: approval sent`, approvalTxHash);

      callbacks.addTransaction({
        hash: approvalTxHash,
        chainId: fromChainId,
        type: 'approval',
        timestamp: Date.now(),
        description: `Approve ${sellAssetSymbol} for Swap (Step ${step}/${stepCount})`,
        from: evmAddress,
        status: 'pending',
        network: currentNetwork,
      });

      callbacks.setStatus('preparing');

      // Wait for approval
      const approved = await waitForApprovalConfirmation(
        ethersProvider,
        requestId,
        approvalTxHash,
        90_000,
      );

      if (!approved) {
        throw new Error(
          `Approval not confirmed within 90s (step ${step}/${stepCount}). ` +
          `Tx: ${approvalTxHash}`,
        );
      }

      console.log(`[executeRangoSwap] Step ${step}: approval confirmed`);

      // Re-fetch the swap tx for this step.
      // Guard: Rango may still return isApprovalTx=true if it hasn't indexed
      // the approval yet — retry with backoff until we get a real swap tx.
      const MAX_REFETCH = 3;
      let swapTx: any = null;

      for (let attempt = 0; attempt < MAX_REFETCH; attempt++) {
        const refetchRaw = await fetchRangoPrepareTx(requestId, step);
        const refetchItems: any[] = Array.isArray(refetchRaw) ? refetchRaw : [refetchRaw];

        const refetchError = refetchItems.find((item: any) => item && !item.ok && item.error);
        if (refetchError) throw new Error(refetchError.error);

        const refetchResult = refetchItems.find((item: any) => item?.ok && item?.transaction);
        if (!refetchResult) throw new Error(`No tx returned after approval for step ${step}`);

        if (!refetchResult.transaction.isApprovalTx) {
          swapTx = refetchResult.transaction;
          break;
        }

        // Rango still returning approval tx — indexing lag, wait and retry
        console.warn(
          `[executeRangoSwap] Step ${step}: Rango still returning approval tx after confirmation, ` +
          `waiting 4s (attempt ${attempt + 1}/${MAX_REFETCH})`,
        );
        await new Promise(r => setTimeout(r, 4_000));
      }

      if (!swapTx) {
        throw new Error(
          `Rango still returning approval tx after ${MAX_REFETCH} re-fetches for step ${step}. ` +
          `Approval may not be indexed yet — please retry the swap.`,
        );
      }

      // Send the actual swap tx
      callbacks.setStatus('signing');

      const swapTxHash: string = await provider.request({
        method: 'eth_sendTransaction',
        params: [buildRangoTxParams(swapTx, evmAddress)],
      });

      console.log(`[executeRangoSwap] Step ${step}: swap tx sent`, swapTxHash);

      callbacks.setHash(swapTxHash);
      callbacks.addTransaction({
        hash: swapTxHash,
        chainId: fromChainId,
        type: 'swap',
        timestamp: Date.now(),
        description: `Rango Swap: ${sellAssetSymbol} → ${buyAssetSymbol} (Step ${step}/${stepCount})`,
        from: evmAddress,
        status: 'pending',
        network: currentNetwork,
      });
      // For multi-step routes: confirm this step before proceeding to the next.
      // The next step's contract needs the output tokens from this step.
      if (step < stepCount) {
        callbacks.setStatus('preparing');
        console.log(`[executeRangoSwap] Step ${step}: waiting for swap tx confirmation before step ${step + 1}`);
        const receipt = await pollForReceipt(ethersProvider, swapTxHash, 3_000, 120_000);
        if (!receipt || receipt.status === 0) {
          throw new Error(
            `Step ${step} swap tx failed or timed out. Tx: ${swapTxHash}`,
          );
        }
      }

    } else {
      // No approval needed — send swap tx directly
      console.log(`[executeRangoSwap] Step ${step}: no approval needed, sending swap directly`);
      callbacks.setStatus('signing');

      const swapTxHash: string = await provider.request({
        method: 'eth_sendTransaction',
        params: [buildRangoTxParams(stepTx, evmAddress)],
      });

      console.log(`[executeRangoSwap] Step ${step}: swap tx sent`, swapTxHash);

      callbacks.setHash(swapTxHash);
      callbacks.addTransaction({
        hash: swapTxHash,
        chainId: fromChainId,
        type: 'swap',
        timestamp: Date.now(),
        description: `Rango Swap: ${sellAssetSymbol} → ${buyAssetSymbol} (Step ${step}/${stepCount})`,
        from: evmAddress,
        status: 'pending',
        network: currentNetwork,
      });

      if (step < stepCount) {
        callbacks.setStatus('preparing');
        console.log(`[executeRangoSwap] Step ${step}: waiting for confirmation before step ${step + 1}`);
        const receipt = await pollForReceipt(ethersProvider, swapTxHash, 3_000, 120_000);
        if (!receipt || receipt.status === 0) {
          throw new Error(
            `Step ${step} tx failed or timed out. Tx: ${swapTxHash}`,
          );
        }
      }
    }
  }

  callbacks.setStatus('success');
}