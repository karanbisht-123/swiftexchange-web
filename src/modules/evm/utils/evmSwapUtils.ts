import { ethers } from 'ethers';

import { SWAP_ROUTER_ABI } from '../../../abi/SwapRouterABI';
import EVM_NETWORKS, { type EVMNetworkConfig } from '../../../config/evmNetworks';
import { type NetworkKey, SWAP_CONFIGS } from '../../../config/swapConfigs';
import type {
  Asset,
  PrepareRequest,
  SwapQuote,
  SwapQuoteRequest,
  SwapType,
} from '../../../types/evm/swap.types';
import {
  executeSwapTransaction,
  getSwapQuote,
  prepareSwapTransaction,
} from '../service/evmSwapService';
import { signEVMTransaction } from './evmUtils';

export function getEVMNetworkConfig(networkKey: NetworkKey): EVMNetworkConfig {
  return (
    EVM_NETWORKS.mainnet[networkKey as keyof typeof EVM_NETWORKS.mainnet] ||
    EVM_NETWORKS.testnet[networkKey as keyof typeof EVM_NETWORKS.testnet]
  );
}

export function generateApproveData(
  tokenAddress: string,
  spender: string,
  amount: string,
  decimals: number
): string {
  const normalizedTokenAddress = ethers.getAddress(tokenAddress);
  const normalizedSpender = ethers.getAddress(spender);
  if (!ethers.isAddress(normalizedTokenAddress) || !ethers.isAddress(normalizedSpender)) {
    throw new Error(
      `Invalid token or spender address: token=${normalizedTokenAddress}, spender=${normalizedSpender}`
    );
  }
  if (parseFloat(amount) <= 0) {
    throw new Error('Invalid approval amount');
  }
  const iface = new ethers.Interface([
    'function approve(address spender, uint256 amount) public returns (bool)',
  ]);
  return iface.encodeFunctionData('approve', [
    normalizedSpender,
    ethers.parseUnits(amount, decimals),
  ]);
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
  networkKey: NetworkKey,
  request: SwapQuoteRequest,
  selectedSellAsset: Asset,
  selectedBuyAsset: Asset
): Promise<SwapQuote> {
  const config = SWAP_CONFIGS[networkKey];
  const tokenInAddress = ethers.getAddress(selectedSellAsset.address);
  const tokenOutAddress = ethers.getAddress(selectedBuyAsset.address);

  if (!ethers.isAddress(tokenInAddress) || !ethers.isAddress(tokenOutAddress)) {
    throw new Error(
      `Invalid token addresses: tokenIn=${tokenInAddress}, tokenOut=${tokenOutAddress}`
    );
  }

  const swapType = determineSwapType(selectedSellAsset, selectedBuyAsset, config.wNative);

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

  const quote = await getSwapQuote(networkKey, adjustedRequest);
  return {
    ...quote,
    inputToken: selectedSellAsset.code,
    outputToken: selectedBuyAsset.code,
  };
}

export async function handleEvmSwap(
  networkKey: NetworkKey,
  quote: any,
  selectedSellAsset: Asset,
  selectedBuyAsset: Asset,
  senderAddress: string,
  sellAmount: string,
  slippageTolerance: number,
  getPrivateKey: (chain: 'evm' | 'stellar') => Promise<string | null>
): Promise<string> {
  const privateKey = await getPrivateKey('evm');
  if (!privateKey) {
    throw new Error('EVM private key not found');
  }

  const config = {
    ...getEVMNetworkConfig(networkKey),
    ...SWAP_CONFIGS[networkKey],
  };

  const swapRouter = ethers.getAddress(config.swapRouter);
  const wNative = ethers.getAddress(config.wNative);

  if (!ethers.isAddress(swapRouter) || !ethers.isAddress(wNative)) {
    throw new Error(`Invalid swap configuration: swapRouter=${swapRouter}, wNative=${wNative}`);
  }

  const tokenInAddress = ethers.getAddress(selectedSellAsset.address);
  const tokenOutAddress = ethers.getAddress(selectedBuyAsset.address);

  if (!ethers.isAddress(tokenInAddress) || !ethers.isAddress(tokenOutAddress)) {
    throw new Error(`Invalid swap tokens: tokenIn=${tokenInAddress}, tokenOut=${tokenOutAddress}`);
  }

  const amountIn = ethers.parseUnits(sellAmount, selectedSellAsset.decimals);
  const amountOutMinimum = ethers.parseUnits(
    (parseFloat(quote.outputAmount) * (1 - slippageTolerance / 100)).toFixed(
      selectedBuyAsset.decimals
    ),
    selectedBuyAsset.decimals
  );

  const iface = new ethers.Interface(SWAP_ROUTER_ABI);

  const swapRecipient = senderAddress;

  // const calls: string[] = [];
  const swapType = determineSwapType(selectedSellAsset, selectedBuyAsset, config.wNative);

  const params = {
    tokenIn: tokenInAddress,
    tokenOut: tokenOutAddress,
    fee: quote.fee,
    recipient: swapRecipient,
    deadline: Math.floor(Date.now() / 1000) + 600,
    amountIn,
    amountOutMinimum,
    sqrtPriceLimitX96: 0,
  };

  const swapData = iface.encodeFunctionData('exactInputSingle', [params]);

  let approveData = '';
  if (selectedSellAsset.address) {
    approveData = generateApproveData(
      selectedSellAsset.address,
      swapRouter,
      sellAmount,
      selectedSellAsset.decimals
    );
  }

  const prepareRequest: PrepareRequest = {
    address: senderAddress,
    swapType,
    swapData,
    approveData,
    // value: selectedSellAsset.address === wNative ? amountIn.toString() : '0',
    value: amountIn.toString(),
  };

  const preparedTxs = await prepareSwapTransaction(networkKey, prepareRequest);

  const signedTxs = await Promise.all(
    preparedTxs.map((tx: any) => signEVMTransaction(tx, privateKey))
  );

  const executeRequest: any = { txs: signedTxs };
  const executeRes = await executeSwapTransaction(networkKey, executeRequest);
  if (!executeRes || executeRes.length === 0) {
    throw new Error('Swap execution failed');
  }

  const txHash = executeRes[executeRes.length - 1].hash;
  if (!txHash) {
    throw new Error('Transaction hash not found');
  }

  return txHash;
}
