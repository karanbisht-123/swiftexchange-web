import { ethers } from 'ethers';

import type { SwapQuote, SwapQuoteRequest, SwapType } from '../../../types/evm/swap.types';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { getSwapQuote, prepareSwapTransaction, get1InchFusionQuote, build1InchFusionOrder, submit1InchFusionOrder, getRangoBestRoute, confirmRangoRoute, checkRangoApproval, prepareRangoTx } from '../service/evmSwapService';
import type { TokenInfo } from '../service/tokenListService';
import { getChainById, getChainRangoSymbol } from './Chainregistry';
import { parseSwapError } from './swapErrorHandler';
import { NATIVE_ADDRESS, AGGREGATOR_NATIVE_ADDRESS } from './assetmanagement/constants';
import { rpcManager } from './rpcProvider';
import { getEVMNetworkConfig } from './evmUtils';


// 1inch limit order_PROTOCOL 
const LIMIT_ORDER_PROTOCOL = '0x111111125421ca6dc452d289314280a0f8842a65';

const ERC20_ALLOWANCE_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

// Fetches the pending nonce to prevent nonce collisions on fast sequential submissions.
export async function ensureFusionAllowance(
  tokenAddress: string,
  walletAddress: string,
  amountBN: bigint,
  provider: any,
  chainId: number | string,
): Promise<void> {
  const spender = LIMIT_ORDER_PROTOCOL;
  if (!tokenAddress || tokenAddress.toLowerCase() === NATIVE_ADDRESS.toLowerCase()) return;

  let rpcUrls: string[] = [];
  try {
    rpcUrls = getEVMNetworkConfig(chainId).rpcUrls;
  } catch { }

  // Use 'pending' block tag so an in-flight approval is counted and we don't double-approve.
  let allowance: bigint = 0n;
  if (rpcUrls.length > 0) {
    try {
      allowance = await rpcManager.fetchWithFallback(chainId, rpcUrls, async (rpcProvider) => {
        const contract = new ethers.Contract(tokenAddress, ERC20_ALLOWANCE_ABI, rpcProvider);
        // Pass {blockTag: 'pending'} so a pending approval tx is reflected immediately
        return contract.allowance(walletAddress, spender, { blockTag: 'pending' }) as Promise<bigint>;
      });
    } catch (err) {
      console.warn('[ensureFusionAllowance] Failed to fetch allowance, proceeding with approval fallback:', err);
    }
  }

  if (BigInt(allowance) >= amountBN) return;

  const iface = new ethers.Interface(ERC20_ALLOWANCE_ABI);
  const data = iface.encodeFunctionData('approve', [spender, ethers.MaxUint256]);

  let gasHex = '0x186a0'; // Default 100k
  try {
    const { simulateEVMTransaction } = await import('../../evm/utils/evmUtils');
    const sim = await simulateEVMTransaction(chainId, walletAddress, tokenAddress, 0n, data);
    gasHex = '0x' + sim.gasLimit.toString(16);
  } catch (err: any) {
    console.warn('[ensureFusionAllowance] Gas simulation failed for approval:', err);
    if (err.message.includes('Insufficient funds')) throw err;
  }

  // Fetch the pending nonce via rpcManager to prevent nonce collisions
  // when multiple transactions are submitted back-to-back.
  let nonceHex: string | undefined;
  if (rpcUrls.length > 0) {
    try {
      const pendingNonce = await rpcManager.fetchWithFallback(chainId, rpcUrls, async (rpcProvider) => {
        return rpcProvider.getTransactionCount(walletAddress, 'pending');
      });
      nonceHex = '0x' + pendingNonce.toString(16);
    } catch (err) {
      console.warn('[ensureFusionAllowance] Failed to fetch pending nonce, wallet will assign nonce:', err);
    }
  }

  const approveTxParams: Record<string, string> = {
    from: walletAddress,
    to: tokenAddress,
    data,
    gas: gasHex,
  };
  if (nonceHex !== undefined) {
    approveTxParams.nonce = nonceHex;
  }

  const approveTxHash: string = await provider.request({
    method: 'eth_sendTransaction',
    params: [approveTxParams],
  });

  console.log('[ensureFusionAllowance] Approval transaction sent:', approveTxHash);
}


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


function safeValue(raw: string | undefined | null): bigint {
  if (raw === undefined || raw === null || raw === '') return 0n;
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

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

// Estimates gas for a transaction and adds a 20% safety buffer.
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

// Polls the blockchain for a transaction receipt with a configurable timeout and 'slow' notification hook. 
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

// Fetches a standard EVM swap quote from the internal swap service. 
export async function fetchEvmQuote(
  chainId: number | string,
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
      nativeSymbol,
      tokenIn: {
        symbol: selectedSellAsset.symbol,
        name: selectedSellAsset.name,
        decimals: selectedSellAsset.decimals,
        address: selectedSellAsset.address,
        balance: selectedSellAsset.balance ?? undefined,
        logoUri: selectedSellAsset.logoURI || null,
      },
      tokenOut: {
        symbol: selectedBuyAsset.symbol,
        name: selectedBuyAsset.name,
        decimals: selectedBuyAsset.decimals,
        address: selectedBuyAsset.address,
        balance: selectedBuyAsset.balance ?? undefined,
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

// Executes a sequence of transactions (e.g., approval + swap) for a standard EVM exchange. 
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
        type: tx.type === 2 ? 2 : undefined,
      };

      // Apply EIP-1559 fees if provided by proxy
      if (tx.maxFeePerGas) txParams.maxFeePerGas = BigInt(tx.maxFeePerGas);
      if (tx.maxPriorityFeePerGas) txParams.maxPriorityFeePerGas = BigInt(tx.maxPriorityFeePerGas);

      // Use proxy-provided nonce to allow fast sequential submission
      if (tx.nonce !== undefined && tx.nonce !== null) {
        txParams.nonce = Number(tx.nonce);
      }

      // Simulation/Gas Estimation logic
      try {
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
        console.warn('[executeSwap] Gas simulation failed, falling back to estimation:', simError);
        if (simError.message.includes('Insufficient funds')) throw simError;
        if (gasLimitFromApi !== undefined) {
          txParams.gasLimit = gasLimitFromApi;
        } else {
          const estimated = await estimateGasWithBuffer(ethersProvider, txParams);
          if (estimated !== undefined) {
            txParams.gasLimit = estimated;
          }
        }
      }

      console.log('[executeSwap] Sending transaction:', {
        to: txParams.to,
        nonce: txParams.nonce,
        gasLimit: txParams.gasLimit?.toString(),
      });

      const txResponse = await signer.sendTransaction(txParams);
      lastTxHash = txResponse.hash;
      if (!isLastTx) {
        console.log('[executeSwap] Intermediate transaction sent:', lastTxHash);
      } else {
        console.log('[executeSwap] Final transaction sent:', lastTxHash);
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
    const message = parseSwapError(error);
    throw new Error(message);
  }
}

// Fetches a gasless Fusion quote from 1inch. 
export async function fetch1InchFusionQuote(
  chainId: number | string,
  tokenIn: string,
  tokenOut: string,
  amount: string,
  walletAddress: string,
  decimals?: number
): Promise<any> {
  try {
    const quote = await get1InchFusionQuote(chainId, {
      tokenIn,
      tokenOut,
      amount,
      walletAddress,
      decimals
    });
    return quote;
  } catch (error: any) {
    const message = parseSwapError(error);
    throw new Error(message);
  }
}

// Handles the full 1inch Fusion flow: check allowance -> sign typed data -> submit order. 
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

    // Guard against expired Fusion quotes before doing any work.
    // Fusion quotes have a short TTL; building an order on a stale quote wastes gas on the approval
    // and produces a guaranteed submission rejection from the relayer.
    if (quote.deadline && Math.floor(Date.now() / 1000) > Number(quote.deadline)) {
      throw new Error('Fusion quote has expired — please refresh the quote and try again');
    }

    const chainConfig = getChainById(chainId);
    const chainSymbol = chainConfig?.nativeCurrency.symbol?.toUpperCase() || 'ETH';

    const amountStr = sellAmount.includes('.')
      ? sellAmount.split('.')[0] + '.' + sellAmount.split('.')[1].slice(0, sellAsset.decimals)
      : sellAmount;

    const amountBN = ethers.parseUnits(amountStr, sellAsset.decimals);

    //  check and approve before building the order.
    // ensureFusionAllowance now uses the 'pending' block tag and pending nonce internally,
    // so back-to-back calls are safe without waiting for the approval receipt.
    onProgress?.('approving');
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
    };

    const fusionOrder = await build1InchFusionOrder(buildRequest);
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
    };

    // retry if allowance hasn't propagated to the relayer yet.
    // The pending-block-tag allowance check in ensureFusionAllowance reduces how often
    // we hit this path, but the retry remains as a true safety net.
    let retries = 0;
    const maxRetries = 4;
    while (retries < maxRetries) {
      try {
        await submit1InchFusionOrder(submitPayload);
        break;
      } catch (err: any) {
        retries++;
        const errMsg = err.message?.toLowerCase() || '';
        const isAllowanceError = errMsg.includes('allowance') || errMsg.includes('balance') || errMsg.includes('insufficient');
        if (isAllowanceError && retries < maxRetries) {
          console.warn(`[execute1InchFusionSwap] Submission failed (likely allowance delay). Retrying in 4s... (${retries}/${maxRetries})`);
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

function toRangoAddress(address: string | null | undefined): string {
  if (!address || address.toLowerCase() === NATIVE_ADDRESS.toLowerCase()) return AGGREGATOR_NATIVE_ADDRESS;
  return address;
}

// Finds the most efficient cross-chain route using the Rango aggregator. 
export async function fetchRangoBestRoute(
  fromChainId: number | string,
  fromSymbol: string,
  fromAddress: string | null,
  toChainId: number | string,
  toSymbol: string,
  toAddress: string | null,
  amount: string,
  slippage: string = "1.0"
): Promise<any> {
  try {
    const payload = {
      from: { blockchain: getChainRangoSymbol(fromChainId), symbol: fromSymbol, address: toRangoAddress(fromAddress) },
      to: { blockchain: getChainRangoSymbol(toChainId), symbol: toSymbol, address: toRangoAddress(toAddress) },
      amount,
      slippage
    };
    return await getRangoBestRoute(payload);
  } catch (error: any) {
    const message = parseSwapError(error);
    throw new Error(message);
  }
}

// Confirms a selected Rango route to lock in the quote and prepare for execution. 
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
      toAddress
    };
    return await confirmRangoRoute(payload);
  } catch (error: any) {
    const message = parseSwapError(error);
    throw new Error(message);
  }
}

// Checks if an approval is still required for a specific Rango swap step. 
export async function fetchRangoCheckApproval(
  requestId: string,
  txId: string = ""
): Promise<any> {
  try {
    return await checkRangoApproval({ requestId, txId });
  } catch (error: any) {
    const message = parseSwapError(error);
    throw new Error(message);
  }
}

// Retrieves the raw transaction data for a specific step in a Rango cross-chain swap. 
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

// Validates the Rango route response for balance, fee, and input asset requirements. 
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
            throw new Error(asset.error || `Rango validation failed: ${reason || 'Insufficient balance'} for ${symbol} (Required: ${required}, Current: ${current})`);
          }
        }
      }
    }
  }
}

// Coordinates the multi-step execution of a Rango cross-chain swap, including approvals and bridge calls. 
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

  const firstResponse = await fetchRangoPrepareTx(requestId, 1);
  const firstItems = Array.isArray(firstResponse) ? firstResponse : [firstResponse];
  const firstError = firstItems.find((item: any) => item && !item.ok && item.error);
  if (firstError) throw new Error(firstError.error);
  const firstResult = firstItems.find((item: any) => item && item.ok);
  if (!firstResult) throw new Error('Failed to prepare Rango transaction');

  const stepCount: number = firstResult.stepsCount ?? firstResult.route?.swaps?.length ?? 1;

  for (let stepIndex = 1; stepIndex <= stepCount; stepIndex++) {
    callbacks.setStatus('preparing');

    // For step 1 we already have the response; for subsequent steps fetch fresh.
    const stepResponse = stepIndex === 1 ? firstResponse : await fetchRangoPrepareTx(requestId, stepIndex);
    const stepItems = Array.isArray(stepResponse) ? stepResponse : [stepResponse];

    const stepError = stepItems.find((item: any) => item && !item.ok && item.error);
    if (stepError) throw new Error(stepError.error);

    const stepResult = stepItems.find((item: any) => item && item.ok && item.transaction);
    if (!stepResult) throw new Error(`Failed to prepare Rango transaction for step ${stepIndex}`);

    const stepTx = stepResult.transaction;

    if (stepTx.isApprovalTx) {
      callbacks.setStatus('signing');
      const approvalTxId = await provider.request({
        method: 'eth_sendTransaction',
        params: [buildTxParams(stepTx)]
      });

      callbacks.addTransaction({
        hash: approvalTxId,
        chainId: fromChainId,
        type: 'approval',
        timestamp: Date.now(),
        description: `Approve ${sellAssetSymbol} for Swap`,
        from: evmAddress,
        status: 'pending',
        network: currentNetwork
      });

      // No receipt wait — proceed directly to fetch the main swap tx for this same step.
      console.log(`[executeRangoSwap] Step ${stepIndex} approval sent:`, approvalTxId);
      callbacks.setStatus('preparing');

      const swapTxResponse = await fetchRangoPrepareTx(requestId, stepIndex);
      const swapTxItems = Array.isArray(swapTxResponse) ? swapTxResponse : [swapTxResponse];

      const swapTxError = swapTxItems.find((item: any) => item && !item.ok && item.error);
      if (swapTxError) throw new Error(swapTxError.error);

      const swapTxResult = swapTxItems.find((item: any) => item && item.ok && item.transaction);
      if (!swapTxResult) throw new Error(`Failed to prepare Rango swap transaction for step ${stepIndex} after approval`);

      callbacks.setStatus('signing');
      const swapTxId = await provider.request({
        method: 'eth_sendTransaction',
        params: [buildTxParams(swapTxResult.transaction)]
      });

      callbacks.setHash(swapTxId);
      callbacks.addTransaction({
        hash: swapTxId,
        chainId: fromChainId,
        type: 'crosschain-swap',
        timestamp: Date.now(),
        description: `Rango Swap: ${sellAssetSymbol} \u2192 ${buyAssetSymbol}`,
        from: evmAddress,
        status: 'pending',
        network: currentNetwork
      });
    } else {
      callbacks.setStatus('signing');
      const swapTxId = await provider.request({
        method: 'eth_sendTransaction',
        params: [buildTxParams(stepTx)]
      });

      callbacks.setHash(swapTxId);
      callbacks.addTransaction({
        hash: swapTxId,
        chainId: fromChainId,
        type: 'crosschain-swap',
        timestamp: Date.now(),
        description: `Rango Swap: ${sellAssetSymbol} \u2192 ${buyAssetSymbol}`,
        from: evmAddress,
        status: 'pending',
        network: currentNetwork
      });
    }
  }

  callbacks.setStatus('success');
}