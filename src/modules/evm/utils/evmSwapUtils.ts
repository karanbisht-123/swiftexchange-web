import { ethers } from 'ethers';
import type { SwapQuote, SwapQuoteRequest, SwapType } from '../../../types/evm/swap.types';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { prepareSwapTransaction, getSwapQuote } from '../service/evmSwapService';
import type { TokenInfo } from '../service/tokenListService';

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
  if (isSellNative && !isBuyUsdc) return 'EthToToken';
  if (!isSellNative && isBuyNative) return 'TokenToEth';
  return 'TokenToToken';
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

    let lastTxHash = '';

    if (isMainnet()) {
      for (const tx of transactions) {
        const txParams: Record<string, any> = {
          from: tx.from || senderAddress,
          to: tx.to,
          data: tx.data,
          value: tx.value ? `0x${BigInt(tx.value).toString(16)}` : '0x0',
        };

        if (tx.gasLimit || tx.gas) {
          txParams.gas = tx.gasLimit || tx.gas;
        }
        if (tx.maxFeePerGas) {
          txParams.maxFeePerGas = `0x${BigInt(tx.maxFeePerGas).toString(16)}`;
        }
        if (tx.maxPriorityFeePerGas) {
          txParams.maxPriorityFeePerGas = `0x${BigInt(tx.maxPriorityFeePerGas).toString(16)}`;
        }

        const txHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [txParams],
        });

        lastTxHash = txHash;
      }
    } else {
      const ethersProvider = new ethers.BrowserProvider(provider);
      const signer = await ethersProvider.getSigner();
      const txData = transactions[0];

      if (!selectedSellAsset.isNative && (txData as any).requiresApproval) {
        const erc20Abi = [
          'function approve(address spender, uint256 amount) public returns (bool)',
          'function allowance(address owner, address spender) public view returns (uint256)',
        ];
        const tokenContract = new ethers.Contract(selectedSellAsset.address, erc20Abi, signer);
        const amountIn = ethers.parseUnits(sellAmount, selectedSellAsset.decimals);
        const currentAllowance = await tokenContract.allowance(senderAddress, (txData as any).spenderAddress);

        if (currentAllowance < amountIn) {
          const approveTx = await tokenContract.approve((txData as any).spenderAddress, amountIn);
          await approveTx.wait();
        }
      }

      const tx = {
        to: txData.to,
        data: txData.data,
        value: txData.value ? BigInt(txData.value) : 0n,
        from: senderAddress,
      };

      const txResponse = await signer.sendTransaction(tx);
      const receipt = await txResponse.wait();

      if (!receipt || receipt.status === 0) {
        throw new Error('Transaction failed');
      }

      lastTxHash = txResponse.hash;
    }

    return lastTxHash;
  } catch (error: any) {
    console.error('Swap execution error:', error);

    if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
      throw new Error('Transaction rejected by user');
    }
    if (error.message?.includes('insufficient funds')) {
      throw new Error('Insufficient funds for gas fees');
    }
    if (error.message?.includes('gas')) {
      throw new Error('Transaction failed due to gas estimation error');
    }
    if (error.message?.includes('user rejected') || error.message?.includes('rejected by user')) {
      throw new Error('Transaction rejected by user');
    }
    if (error.message?.includes('insufficient')) {
      throw new Error('Insufficient balance or gas fees');
    }

    throw new Error(error.message || 'Failed to execute swap');
  }
}
