import { ethers } from 'ethers';

import { SWAP_ROUTER_ABI } from '../../../abi/SwapRouterABI';
import { SWAP_CONFIGS } from '../../../config/swapConfigs';
import type { Asset, SwapQuote, SwapQuoteRequest, SwapType } from '../../../types/evm/swap.types';
import { getEVMChains } from '../../walletconnect/config/chains';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { getSwapQuote } from '../service/evmSwapService';

type NetworkType = 'mainnet' | 'testnet';

const configCache = new Map<number, any>();
const networkConfigCache = new Map<string, any>();

export function getSwapConfigByChainId(chainId: number) {
  if (configCache.has(chainId)) {
    return configCache.get(chainId);
  }

  const chainIdToNetworkKey: Record<number, string> = {
    1: 'ethereum',
    137: 'polygon',
    56: 'bsc',
    42161: 'arbitrum',
    10: 'optimism',
    43114: 'avalanche',
    11155111: 'sepolia',
    80002: 'amoy',
    97: 'bscTestnet',
    421614: 'arbitrumSepolia',
    11155420: 'optimismSepolia',
    43113: 'fuji',
  };

  const networkKey = chainIdToNetworkKey[chainId];
  if (!networkKey) {
    throw new Error(`No swap configuration found for chainId: ${chainId}`);
  }

  const config = (SWAP_CONFIGS as any)[networkKey];

  if (!config) {
    throw new Error(`Swap configuration not available for network: ${networkKey}`);
  }

  configCache.set(chainId, config);
  return config;
}

export function getNetworkConfigByChainId(chainId: number, networkType: NetworkType) {
  const cacheKey = `${chainId}-${networkType}`;

  if (networkConfigCache.has(cacheKey)) {
    return networkConfigCache.get(cacheKey);
  }

  const chains = getEVMChains(networkType);
  const config = chains.find(chain => chain.chainId === chainId);

  if (!config) {
    throw new Error(`Network configuration not found for chainId: ${chainId}`);
  }

  networkConfigCache.set(cacheKey, config);
  return config;
}

export function determineSwapType(sellAsset: Asset, buyAsset: Asset, wNative: string): SwapType {
  const isSellNative = sellAsset.isNative;
  const isBuyNative = buyAsset.isNative;
  const isSellWNative = sellAsset.address.toLowerCase() === wNative.toLowerCase();
  const isBuyWNative = buyAsset.address.toLowerCase() === wNative.toLowerCase();

  const isSellUsdc = sellAsset.code.toUpperCase() === 'USDC';
  const isBuyUsdc = buyAsset.code.toUpperCase() === 'USDC';

  const isEthLikeSell = isSellNative || isSellWNative;
  const isEthLikeBuy = isBuyNative || isBuyWNative;

  if (isEthLikeSell && isBuyUsdc) return 'EthToUsdc';
  if (isSellUsdc && isEthLikeBuy) return 'UsdcToWeth';
  if (isEthLikeSell && !isBuyUsdc) return 'EthToToken';
  if (!isEthLikeSell && isEthLikeBuy) return 'TokenToEth';

  return 'TokenToToken';
}

export async function fetchEvmQuote(
  chainId: number,
  request: SwapQuoteRequest,
  selectedSellAsset: Asset,
  selectedBuyAsset: Asset
): Promise<SwapQuote> {
  try {
    const swapConfig = getSwapConfigByChainId(chainId);
    let tokenInAddress = selectedSellAsset.address;
    let tokenOutAddress = selectedBuyAsset.address;

    if (selectedSellAsset.isNative) {
      tokenInAddress = swapConfig.wNative;
    }
    if (selectedBuyAsset.isNative) {
      tokenOutAddress = swapConfig.wNative;
    }

    const tokenInChecksum = ethers.getAddress(tokenInAddress);
    const tokenOutChecksum = ethers.getAddress(tokenOutAddress);

    if (!ethers.isAddress(tokenInChecksum) || !ethers.isAddress(tokenOutChecksum)) {
      throw new Error(
        `Invalid token addresses: tokenIn=${tokenInChecksum}, tokenOut=${tokenOutChecksum}`
      );
    }

    const swapType = determineSwapType(selectedSellAsset, selectedBuyAsset, swapConfig.wNative);

    const adjustedRequest: SwapQuoteRequest = {
      ...request,
      tokenIn: {
        ...request.tokenIn,
        address: tokenInChecksum,
        symbol: selectedSellAsset.code,
      },
      tokenOut: {
        ...request.tokenOut,
        address: tokenOutChecksum,
        symbol: selectedBuyAsset.code,
      },
      swapType,
    };

    const quote = await getSwapQuote(chainId, adjustedRequest);

    return {
      ...quote,
      inputToken: selectedSellAsset.code,
      outputToken: selectedBuyAsset.code,
    };
  } catch (error: any) {
    console.error('Error fetching quote:', error);

    if (error.message?.includes('No liquidity')) {
      throw new Error('Insufficient liquidity for this token pair');
    }
    if (error.message?.includes('network')) {
      throw new Error('Network error. Please check your connection');
    }
    if (error.message?.includes('timeout')) {
      throw new Error('Request timeout. Please try again');
    }

    throw new Error(error.message || 'Failed to fetch swap quote');
  }
}

export async function executeSwap(
  chainId: number,
  quote: SwapQuote,
  selectedSellAsset: Asset,
  selectedBuyAsset: Asset,
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

    const swapConfig = getSwapConfigByChainId(chainId);
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    const swapRouter = ethers.getAddress(swapConfig.swapRouter);
    const wNative = ethers.getAddress(swapConfig.wNative);

    // Determine the actual token addresses for the smart contract call (WNative for native)
    const tokenInActual = selectedSellAsset.isNative
      ? wNative
      : ethers.getAddress(selectedSellAsset.address);
    const tokenOutActual = selectedBuyAsset.isNative
      ? wNative
      : ethers.getAddress(selectedBuyAsset.address);

    const amountIn = ethers.parseUnits(sellAmount, selectedSellAsset.decimals);

    // Calculate amountOutMinimum using BigInt to prevent floating point errors
    const outputAmountRaw = ethers.parseUnits(quote.outputAmount, selectedBuyAsset.decimals);
    const slippageDenominator = 100n;
    const slippageNumerator = slippageDenominator - BigInt(slippageTolerance);

    const amountOutMinimum = (outputAmountRaw * slippageNumerator) / slippageDenominator;

    const isNativeTokenIn = selectedSellAsset.isNative;

    // --- 1. APPROVAL STEP (Only needed for ERC-20 tokenIn) ---
    if (!isNativeTokenIn) {
      const erc20Abi = [
        'function approve(address spender, uint256 amount) public returns (bool)',
        'function allowance(address owner, address spender) public view returns (uint256)',
      ];

      const tokenContract = new ethers.Contract(tokenInActual, erc20Abi, signer);

      try {
        const currentAllowance = await tokenContract.allowance(senderAddress, swapRouter);

        if (currentAllowance < amountIn) {
          const approveTx = await tokenContract.approve(swapRouter, amountIn);
          await approveTx.wait();
        }
      } catch (error: any) {
        throw new Error(`Token approval failed: ${error.message || 'Unknown error'}`);
      }
    }

    // --- 2. SWAP EXECUTION ---
    const swapRouterInterface = new ethers.Interface(SWAP_ROUTER_ABI);

    const params = {
      tokenIn: tokenInActual,
      tokenOut: tokenOutActual,
      fee: quote.fee,
      recipient: senderAddress,
      deadline: Math.floor(Date.now() / 1000) + 600,
      amountIn,
      amountOutMinimum,
      sqrtPriceLimitX96: 0,
    };

    const swapData = swapRouterInterface.encodeFunctionData('exactInputSingle', [params]);

    const swapTx = {
      to: swapRouter,
      data: swapData,
      value: isNativeTokenIn ? amountIn : 0n, // Pass native amount as value
      from: senderAddress,
    };

    try {
      const txResponse = await signer.sendTransaction(swapTx);
      const receipt = await txResponse.wait();

      if (!receipt || receipt.status === 0) {
        throw new Error('Transaction failed');
      }

      return txResponse.hash;
    } catch (error: any) {
      if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
        throw new Error('Transaction rejected by user');
      }
      if (error.message?.includes('insufficient funds')) {
        throw new Error('Insufficient funds for gas fees');
      }
      if (error.message?.includes('gas')) {
        throw new Error('Transaction failed due to gas estimation error');
      }

      throw new Error(error.message || 'Swap transaction failed');
    }
  } catch (error: any) {
    console.error('Swap execution error:', error);

    if (error.message?.includes('user rejected') || error.message?.includes('rejected by user')) {
      throw new Error('Transaction rejected by user');
    }
    if (error.message?.includes('insufficient')) {
      throw new Error('Insufficient balance or gas fees');
    }
    if (error.message?.includes('approval')) {
      throw error;
    }

    throw new Error(error.message || 'Failed to execute swap');
  }
}
