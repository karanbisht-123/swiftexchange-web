import { ethers } from 'ethers';

import { SWAP_ROUTER_ABI } from '../../../abi/SwapRouterABI';
import { SWAP_CONFIGS } from '../../../config/swapConfigs';
import type { Asset, SwapQuote, SwapQuoteRequest, SwapType } from '../../../types/evm/swap.types';
import { getEVMChains } from '../../walletconnect/config/chains';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { getSwapQuote } from '../service/evmSwapService';

const configCache = new Map<number, any>();
const networkConfigCache = new Map<number, any>();

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

  const config = SWAP_CONFIGS[networkKey];
  if (!config) {
    throw new Error(`Swap configuration not available for network: ${networkKey}`);
  }

  configCache.set(chainId, config);
  return config;
}

export function getNetworkConfigByChainId(chainId: number) {
  if (networkConfigCache.has(chainId)) {
    return networkConfigCache.get(chainId);
  }

  const chains = getEVMChains();
  const config = chains.find(chain => chain.chainId === chainId);

  if (!config) {
    throw new Error(`Network configuration not found for chainId: ${chainId}`);
  }

  networkConfigCache.set(chainId, config);
  return config;
}

export function determineSwapType(sellAsset: Asset, buyAsset: Asset, wNative: string): SwapType {
  const isSellWNative = sellAsset.address.toLowerCase() === wNative.toLowerCase();
  const isBuyWNative = buyAsset.address.toLowerCase() === wNative.toLowerCase();
  const isSellUsdc = sellAsset.code.toUpperCase() === 'USDC';
  const isBuyUsdc = buyAsset.code.toUpperCase() === 'USDC';

  if (isSellWNative && isBuyUsdc) return 'EthToUsdc';
  if (isSellUsdc && isBuyWNative) return 'UsdcToWeth';
  if (isSellWNative && !isBuyUsdc) return 'EthToToken';
  if (!isSellWNative && isBuyWNative) return 'TokenToEth';
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
    const tokenInAddress = ethers.getAddress(selectedSellAsset.address);
    const tokenOutAddress = ethers.getAddress(selectedBuyAsset.address);

    if (!ethers.isAddress(tokenInAddress) || !ethers.isAddress(tokenOutAddress)) {
      throw new Error(
        `Invalid token addresses: tokenIn=${tokenInAddress}, tokenOut=${tokenOutAddress}`
      );
    }

    const swapType = determineSwapType(selectedSellAsset, selectedBuyAsset, swapConfig.wNative);

    const adjustedRequest: SwapQuoteRequest = {
      ...request,
      tokenIn: {
        ...request.tokenIn,
        address: tokenInAddress,
        symbol: selectedSellAsset.code,
      },
      tokenOut: {
        ...request.tokenOut,
        address: tokenOutAddress,
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
  quote: any,
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
    const tokenInAddress = ethers.getAddress(selectedSellAsset.address);
    const tokenOutAddress = ethers.getAddress(selectedBuyAsset.address);

    const amountIn = ethers.parseUnits(sellAmount, selectedSellAsset.decimals);
    const amountOutMinimum = ethers.parseUnits(
      (parseFloat(quote.outputAmount) * (1 - slippageTolerance / 100)).toFixed(
        selectedBuyAsset.decimals
      ),
      selectedBuyAsset.decimals
    );

    const isNativeToken = tokenInAddress.toLowerCase() === wNative.toLowerCase();

    if (!isNativeToken) {
      const erc20Abi = [
        'function approve(address spender, uint256 amount) public returns (bool)',
        'function allowance(address owner, address spender) public view returns (uint256)',
      ];

      const tokenContract = new ethers.Contract(tokenInAddress, erc20Abi, signer);

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

    const swapRouterInterface = new ethers.Interface(SWAP_ROUTER_ABI);

    const params = {
      tokenIn: tokenInAddress,
      tokenOut: tokenOutAddress,
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
      value: isNativeToken ? amountIn : 0n,
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
