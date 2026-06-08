import { ethers } from 'ethers';
import type { SwapQuote, SwapQuoteRequest } from '../../../types/evm/swap.types';
import { WalletType } from '../../walletconnect/constants/Wallet';
import {
  getSwapQuote,
  prepareSwapTransaction,
  get1InchFusionQuote,
  build1InchFusionOrder,
  submit1InchFusionOrder,
} from '../service/evmSwapService';
import type { TokenInfo } from '../service/tokenListService';
import { getChainById } from './Chainregistry';
import { parseSwapError } from './swapErrorHandler';
import { NATIVE_ADDRESS, AGGREGATOR_NATIVE_ADDRESS } from './assetmanagement/constants';
import { rpcManager } from './rpcProvider';
import { getEVMNetworkConfig } from './evmUtils';
import { simulateSwapTransaction } from '../service/evmSimulationService';

// Constants
const LIMIT_ORDER_PROTOCOL = '0x111111125421ca6dc452d289314280a0f8842a65';

const isNativeAddress = (address: string | undefined | null): boolean => {
  if (!address) return true;
  const lowAddress = address.toLowerCase();
  return lowAddress === 'native' || lowAddress === NATIVE_ADDRESS.toLowerCase();
};
const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];



// Safely converts a raw string to BigInt, returns 0n on failure.
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
  } catch (err: any) {
    if (err.message?.includes('execution reverted') || err.info?.error?.message?.includes('execution reverted')) {
      throw new Error(`Transaction will fail: ${err.info?.error?.message || err.message}`);
    }
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
 *
 * NOTE: EIP-1559 (type 2) fields are commented out below.
 * Many wallets (especially on Polygon) reject type 2 txns with:
 * "unsupported transaction type: 0x2"
 * We use legacy gasPrice instead for universal wallet compatibility.
 *
 * TO RE-ENABLE EIP-1559 in future:
 *   1. Uncomment the maxFeePerGas / maxPriorityFeePerGas lines below
 *   2. Remove the legacy gasPrice fallback line
 *   3. Add chain detection if you want EIP-1559 only on supported chains
 */


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
 *
 * NOTE: EIP-1559 (type 2) gas params are commented out below.
 * Using legacy gasPrice for universal wallet compatibility (especially Polygon).
 *
 * TO RE-ENABLE EIP-1559 in future:
 *   1. Uncomment the type 2 gasParams block below
 *   2. Remove the legacy gasParams block
 */
async function sendApprovalTx(
  tokenAddress: string,
  spender: string,
  walletAddress: string,
  provider: any,
  amount: bigint = ethers.MaxUint256,
): Promise<string> {
  const ethersProvider = new ethers.BrowserProvider(provider);
  const signer = await ethersProvider.getSigner();

  const iface = new ethers.Interface(ERC20_ABI);
  const data = iface.encodeFunctionData('approve', [spender, amount]);

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

  // -- EIP-1559 (type 2) gas params — commented out for wallet compatibility --
  // Uncomment below to re-enable EIP-1559 support:
  //
  // if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
  //   gasParams = {
  //     type: 2,
  //     maxFeePerGas: (feeData.maxFeePerGas * 120n) / 100n,
  //     maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas * 120n) / 100n,
  //   };
  // } else if (feeData.gasPrice) {
  //   gasParams = {
  //     type: 0,
  //     gasPrice: (feeData.gasPrice * 120n) / 100n,
  //   };
  // } else {
  //   throw new Error('Could not determine gas price for approval');
  // }
  // -------------------------------------------------------------------------

  // Legacy gasPrice — works on ALL wallets and chains (Polygon, BSC, Ethereum, etc.)
  const rawGasPrice = feeData.gasPrice ?? feeData.maxFeePerGas;
  if (!rawGasPrice) throw new Error('Could not determine gas price for approval');
  gasParams = {
    gasPrice: (rawGasPrice * 120n) / 100n,
  };

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
 * Skips native tokens. Checks on-chain first, sends approval only when needed.
 */
export async function ensureFusionAllowance(
  tokenAddress: string,
  walletAddress: string,
  amountBN: bigint,
  provider: any,
  chainId: number | string,
): Promise<{ approvalTxHash?: string }> {
  if (!tokenAddress || isNativeAddress(tokenAddress)) {
    return {}; // native — no approval needed
  }

  const allowance = await readAllowance(tokenAddress, walletAddress, LIMIT_ORDER_PROTOCOL, chainId, provider);

  if (allowance >= amountBN) {
    console.log('[ensureFusionAllowance] Already approved, skipping');
    return {};
  }

  if (!provider) throw new Error('No provider available for approval transaction');

  if (allowance > 0n && allowance < amountBN) {
    if (tokenAddress.toLowerCase() === '0xdac17f958d2ee523a2206206994597c13d831ec7') {
      await sendApprovalTx(tokenAddress, LIMIT_ORDER_PROTOCOL, walletAddress, provider, 0n);
    }
  }

  const approvalTxHash = await sendApprovalTx(tokenAddress, LIMIT_ORDER_PROTOCOL, walletAddress, provider, ethers.MaxUint256);

  const ethersProvider = new ethers.BrowserProvider(provider);
  const receipt = await pollForReceipt(ethersProvider, approvalTxHash, 2000, 120000);
  if (receipt && receipt.status === 0) {
    throw new Error('Fusion approval transaction failed on-chain');
  }

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
// Fetches a swap quote from the aggregator, normalizing native token addresses.
export async function fetchEvmQuote(
  chainId: number | string,
  request: SwapQuoteRequest,
  selectedSellAsset: TokenInfo,
  selectedBuyAsset: TokenInfo,
): Promise<SwapQuote> {
  try {
    const config = getEVMNetworkConfig(chainId);
    if (config?.rpcUrls) {
      rpcManager.resetChain(chainId, config.rpcUrls);
    }
  } catch (err) {
    console.warn('[fetchEvmQuote] Failed to reset chain status:', err);
  }

  try {
    const isNativeSell = !!selectedSellAsset.isNative || isNativeAddress(request.tokenIn?.address) || isNativeAddress(selectedSellAsset.address);
    const isNativeBuy = !!selectedBuyAsset.isNative || isNativeAddress(request.tokenOut?.address) || isNativeAddress(selectedBuyAsset.address);

    const normalizedSellAddress = isNativeSell
      ? AGGREGATOR_NATIVE_ADDRESS.toLowerCase()
      : selectedSellAsset.address;

    const normalizedBuyAddress = isNativeBuy
      ? AGGREGATOR_NATIVE_ADDRESS.toLowerCase()
      : selectedBuyAsset.address;

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

/**
 * NOTE: EIP-1559 (type 2) is commented out in txParams below.
 * Using legacy gasPrice for universal wallet compatibility.
 *
 * TO RE-ENABLE EIP-1559 in future:
 *   1. Uncomment `type: tx.type === 2 ? 2 : undefined` line
 *   2. Uncomment maxFeePerGas / maxPriorityFeePerGas lines
 *   3. Remove the legacy gasPrice line
 */
export async function executeSwap(
  chainId: number | string,
  quote: SwapQuote,
  selectedSellAsset: TokenInfo,
  selectedBuyAsset: TokenInfo,
  senderAddress: string,
  sellAmount: string,
  slippageTolerance: number,
  getProvider: (type: WalletType) => any,
  onApprovalTxHash?: (hash: string) => void,
  onSwapTxHash?: (hash: string) => void
): Promise<string> {
  const provider = getProvider(WalletType.EVM);
  if (!provider) throw new Error('EVM wallet not connected');

  try {
    const config = getEVMNetworkConfig(chainId);
    if (config?.rpcUrls) {
      rpcManager.resetChain(chainId, config.rpcUrls);
    }
  } catch (err) {
    console.warn('[executeSwap] Failed to reset chain status:', err);
  }

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

        // -- EIP-1559 type field — commented out for wallet compatibility --
        // Uncomment to re-enable EIP-1559:
        // type: tx.type === 2 ? 2 : undefined,
        // -------------------------------------------------------------------
      };

      // -- EIP-1559 gas fields — commented out for wallet compatibility --
      // Uncomment to re-enable EIP-1559:
      // if (tx.maxFeePerGas) txParams.maxFeePerGas = BigInt(tx.maxFeePerGas);
      // if (tx.maxPriorityFeePerGas) txParams.maxPriorityFeePerGas = BigInt(tx.maxPriorityFeePerGas);
      // -------------------------------------------------------------------

      const rawGasPrice = tx.gasPrice ?? tx.maxFeePerGas;
      if (rawGasPrice) txParams.gasPrice = BigInt(rawGasPrice);

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
          throw new Error('Insufficient native token balance to cover gas fees.');
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
    const tx = txParamsList[i];
    const txResponse = await signer.sendTransaction(tx);
    lastTxHash = txResponse.hash;
    const isLast = i === txParamsList.length - 1;
    console.log(`[executeSwap] tx ${i + 1}/${txParamsList.length} broadcast:`, lastTxHash);

    if (isLast && onSwapTxHash) {
      onSwapTxHash(lastTxHash);
    } else if (!isLast && onApprovalTxHash) {
      onApprovalTxHash(txResponse.hash);
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
  toChain?: number | string
): Promise<any> {
  try {
    const normalizedTokenIn = isNativeAddress(tokenIn) ? AGGREGATOR_NATIVE_ADDRESS.toLowerCase() : tokenIn;
    const normalizedTokenOut = isNativeAddress(tokenOut) ? AGGREGATOR_NATIVE_ADDRESS.toLowerCase() : tokenOut;

    return await get1InchFusionQuote(chain, {
      tokenIn: normalizedTokenIn,
      tokenOut: normalizedTokenOut,
      amount: formatAmount(amount, decimals),
      walletAddress,
    }, toChain);
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
  onApprovalTxHash?: (hash: string) => void
): Promise<string> {
  const provider = getProvider(WalletType.EVM);
  if (!provider) throw new Error('EVM wallet not connected');

  // Reject stale quotes before any on-chain interaction
  if (quote.deadline && Math.floor(Date.now() / 1000) > Number(quote.deadline)) {
    throw new Error('Fusion quote has expired — please refresh and try again');
  }

  const toChainId = buyAsset.chainId || chainId;
  const isCrossChain = String(chainId) !== String(toChainId);

  const chainConfig = getChainById(chainId);
  const rawSymbol = chainConfig?.nativeCurrency.symbol?.toUpperCase() || 'ETH';
  const chainSymbol = rawSymbol === 'BNB' ? 'BSC' : rawSymbol;
  const amountBN = BigInt(formatAmount(sellAmount, sellAsset.decimals));

  onProgress?.('approving');
  const allowance = await ensureFusionAllowance(sellAsset.address, senderAddress, amountBN, provider, chainId);
  if (allowance.approvalTxHash) {
    if (onProgress) onProgress('approving');
    if (onApprovalTxHash) onApprovalTxHash(allowance.approvalTxHash);
  }

  // Pre-transaction Simulation Layer
  if (onProgress) onProgress('signing');

  const simResult = await simulateSwapTransaction({
    networkKey: chainId,
    from: senderAddress,
    to: AGGREGATOR_NATIVE_ADDRESS, // 1inch uses aggregator for fusion
    value: sellAsset.isNative ? amountBN.toString() : '0',
    // We can't perfectly simulate the off-chain Fusion order execution directly via eth_call,
    // but we can at least simulate the balance and allowance checks via our service
  });

  if (!simResult.canProceed && !simResult.errors.some(e => e.includes('execution will fail'))) {
    const errorDetails = [...simResult.errors, ...simResult.warnings].join(' | ');
    throw new Error(`Simulation Alert: ${errorDetails}`);
  }

  const normalizedTokenIn = (sellAsset.isNative || isNativeAddress(sellAsset.address)) ? AGGREGATOR_NATIVE_ADDRESS.toLowerCase() : sellAsset.address;
  const normalizedTokenOut = (buyAsset.isNative || isNativeAddress(buyAsset.address)) ? AGGREGATOR_NATIVE_ADDRESS.toLowerCase() : buyAsset.address;

  const secretCount = quote.presets?.[preset]?.secretsCount || quote.presets?.[preset]?.secretCount || 1;

  const isSourceNative = sellAsset.isNative || isNativeAddress(sellAsset.address);

  const fusionOrder = await build1InchFusionOrder({
    quote,
    tokenIn: normalizedTokenIn,
    tokenOut: normalizedTokenOut,
    amount: amountBN.toString(),
    walletAddress: senderAddress,
    chain: chainSymbol,
    preset,
    permit: '',
    toChain: isCrossChain ? (() => {
      const symbol = getChainById(toChainId)?.nativeCurrency.symbol?.toUpperCase() || 'ETH';
      return symbol === 'BNB' ? 'BSC' : symbol;
    })() : undefined,
    secretCount: isCrossChain ? secretCount : undefined,
    isNative: isSourceNative
  });

  const { typedData, extension, orderHash } = fusionOrder;
  console.log('[execute1InchFusionSwap] buildFusionOrder response:', {
    fusionOrder,
    sellAssetAddress: sellAsset.address,
    buyAssetAddress: buyAsset.address,
    normalizedTokenIn,
    normalizedTokenOut
  });

  if (!orderHash) throw new Error('No orderHash received from build order');

  let submitPayload: any;

  if (fusionOrder.transaction) {
    console.log('[execute1InchFusionSwap] Native order returned a transaction. Broadcasting...');
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    const txParams = {
      from: senderAddress,
      to: fusionOrder.transaction.to,
      data: fusionOrder.transaction.data,
      value: BigInt(fusionOrder.transaction.value || 0),
    };

    const txResponse = await signer.sendTransaction(txParams);
    console.log('[execute1InchFusionSwap] Native fusion tx broadcast:', txResponse.hash);

    submitPayload = {
      orderHash: fusionOrder.orderHash,
      txHash: txResponse.hash,
      srcChain: chainSymbol
    };
  } else {
    if (!typedData) throw new Error('No typed data received for signing');
    if (!extension) throw new Error('No extension data received from build order');

    console.log('[execute1InchFusionSwap] Requesting signature for typedData:', typedData);
    const signature: string = await provider.request({
      method: 'eth_signTypedData_v4',
      params: [senderAddress, JSON.stringify(typedData)],
    });
    if (!signature) throw new Error('Signature cancelled or failed');
    console.log('[execute1InchFusionSwap] Signature generated:', signature);

    const orderMessage = typedData.message;
    submitPayload = {
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
      orderHash
    };

    if (isCrossChain) {
      submitPayload = {
        chain: chainSymbol,
        toChain: (() => {
          const symbol = getChainById(toChainId)?.nativeCurrency.symbol?.toUpperCase() || 'ETH';
          return symbol === 'BNB' ? 'BSC' : symbol;
        })(),
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
        signature,
        extension,
        quoteId: quote.quoteId,
        orderHash
      };
    }
  }

  console.log('[execute1InchFusionSwap] Submitting order payload:', submitPayload);

  const MAX_RETRIES = 4;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await submit1InchFusionOrder(submitPayload, isCrossChain, isSourceNative);
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
      console.log(err, 'fustion errr ');
      throw new Error(parseSwapError(err));
    }
  }

  return orderHash;
}
