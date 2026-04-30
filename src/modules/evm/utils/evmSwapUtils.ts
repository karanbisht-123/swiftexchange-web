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

export async function ensureFusionAllowance(
  tokenAddress: string,
  walletAddress: string,
  amountBN: bigint,
  provider: any,
  chainId: number | string
): Promise<void> {
  if (!tokenAddress || tokenAddress.toLowerCase() === NATIVE_ADDRESS.toLowerCase()) return;

  let rpcUrls: string[] = [];
  try {
    rpcUrls = getEVMNetworkConfig(chainId).rpcUrls;
  } catch { }

  let allowance: bigint = 0n;
  if (rpcUrls.length > 0) {
    try {
      allowance = await rpcManager.fetchWithFallback(chainId, rpcUrls, async (rpcProvider) => {
        const contract = new ethers.Contract(tokenAddress, ERC20_ALLOWANCE_ABI, rpcProvider);
        return contract.allowance(walletAddress, LIMIT_ORDER_PROTOCOL) as Promise<bigint>;
      });
    } catch { /* fall through — approve anyway */ }
  }

  if (BigInt(allowance) >= amountBN) return;

  const iface = new ethers.Interface(ERC20_ALLOWANCE_ABI);
  const data = iface.encodeFunctionData('approve', [LIMIT_ORDER_PROTOCOL, ethers.MaxUint256]);

  let gasHex = '0x186a0'; // Default 100k
  try {
    const { simulateEVMTransaction } = await import('../../evm/utils/evmUtils');
    const sim = await simulateEVMTransaction(chainId, walletAddress, tokenAddress, 0n, data);
    gasHex = '0x' + sim.gasLimit.toString(16);
  } catch (err: any) {
    if (err.message.includes('Insufficient funds')) throw err;
  }

  const approveTxHash: string = await provider.request({
    method: 'eth_sendTransaction',
    params: [{ from: walletAddress, to: tokenAddress, data, gas: gasHex }],
  });

  const ethersProvider = new ethers.BrowserProvider(provider);
  await pollForReceipt(ethersProvider, approveTxHash, 2000, 120_000);
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
      };

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
        if (simError.message.includes('Insufficient funds')) throw simError;
        // Fallback to API gas limit or basic estimate if simulation fails for other reasons
        if (gasLimitFromApi !== undefined) {
          txParams.gasLimit = gasLimitFromApi;
        } else {
          const estimated = await estimateGasWithBuffer(ethersProvider, txParams);
          if (estimated !== undefined) {
            txParams.gasLimit = estimated;
          }
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

    const chainConfig = getChainById(chainId);
    const chainSymbol = chainConfig?.nativeCurrency.symbol?.toUpperCase() || 'ETH';

    const amountStr = sellAmount.includes('.')
      ? sellAmount.split('.')[0] + '.' + sellAmount.split('.')[1].slice(0, sellAsset.decimals)
      : sellAmount;

    const amountBN = ethers.parseUnits(amountStr, sellAsset.decimals);

    // --- Allowance gate: check and approve before building the order ---
    onProgress?.('approving');
    await ensureFusionAllowance(
      sellAsset.address,
      senderAddress,
      amountBN,
      provider,
      chainId
    );
    // ------------------------------------------------------------------

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

    await submit1InchFusionOrder(submitPayload);

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

  const step1Response = await fetchRangoPrepareTx(requestId, 1);
  const step1Items = Array.isArray(step1Response) ? step1Response : [step1Response];

  const step1Error = step1Items.find((item: any) => item && !item.ok && item.error);
  if (step1Error) throw new Error(step1Error.error);

  const step1Result = step1Items.find((item: any) => item && item.ok && item.transaction);
  if (!step1Result) throw new Error('Failed to prepare Rango transaction');

  const step1Tx = step1Result.transaction;

  if (step1Tx.isApprovalTx) {
    callbacks.setStatus('signing');
    const approvalTxId = await provider.request({
      method: 'eth_sendTransaction',
      params: [buildTxParams(step1Tx)]
    });

    callbacks.addTransaction({
      hash: approvalTxId,
      chainId: fromChainId,
      type: 'approval',
      timestamp: Date.now(),
      description: `Approve ${sellAssetSymbol}`,
      from: evmAddress,
      status: 'pending',
      network: currentNetwork
    });

    await fetchRangoCheckApproval(requestId, approvalTxId);

    let isApproved = false;
    let attempts = 0;
    const maxAttempts = 60;

    while (!isApproved && attempts < maxAttempts) {
      attempts++;
      try {
        const step2Response = await fetchRangoPrepareTx(requestId, 2);
        const step2Items = Array.isArray(step2Response) ? step2Response : [step2Response];

        const step2Error = step2Items.find((item: any) => item && !item.ok && item.error);
        if (step2Error) {
          const errMsg = step2Error.error.toLowerCase();
          if (!errMsg.includes('approve') && !errMsg.includes('allowance') && !errMsg.includes('balance')) {
            throw new Error(step2Error.error);
          }
        }

        const step2Result = step2Items.find((item: any) => item && item.ok && item.transaction);
        if (step2Result) {
          isApproved = true;
          break;
        }
      } catch (e: any) {
        const msg = e.message?.toLowerCase() || '';
        if (!msg.includes('approve') && !msg.includes('allowance') && !msg.includes('balance')) throw e;
      }
      await new Promise(r => setTimeout(r, 3000));
    }

    if (!isApproved) throw new Error('Timed out waiting for Rango to confirm approval transaction');

    callbacks.setStatus('preparing');
    const step2Response = await fetchRangoPrepareTx(requestId, 2);
    const step2Items = Array.isArray(step2Response) ? step2Response : [step2Response];

    const step2ErrorFinal = step2Items.find((item: any) => item && !item.ok && item.error);
    if (step2ErrorFinal) throw new Error(step2ErrorFinal.error);

    const step2Result = step2Items.find((item: any) => item && item.ok && item.transaction);
    if (!step2Result) throw new Error('Failed to prepare Rango swap transaction after approval');

    const step2Tx = step2Result.transaction;
    callbacks.setStatus('signing');
    const swapTxId = await provider.request({
      method: 'eth_sendTransaction',
      params: [buildTxParams(step2Tx)]
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
      params: [buildTxParams(step1Tx)]
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
  callbacks.setStatus('success');
}

