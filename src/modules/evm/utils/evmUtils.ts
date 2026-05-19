import { ethers } from 'ethers';

import { getEVMChains } from '../../walletconnect/config/chains';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { rpcManager } from './rpcProvider';
import { SendErcAbi } from '../../../abi/SendErcAbi';
import { ERC20_ABI } from '../../../abi/Erc20AbI';
import { getWalletGasInfo } from '../../../service/apiService';
import { getNetworkPrefix } from '../../../utils/transactionUtils';

export type EVMNetworkConfig = {
  chainId: number | string;
  name: string;
  rpcUrls: string[];
  nativeCurrency: { name: string; symbol: string; decimals: number };
  blockExplorerUrl: string;
};

export type NetworkKey = number | string;

export function isValidEVMNetwork(networkKey: unknown): networkKey is NetworkKey {
  const currentNetwork = useWalletStore.getState().network;
  return (
    (typeof networkKey === 'number' || typeof networkKey === 'string') &&
    getEVMChains(currentNetwork).some(c => c.chainId === networkKey)
  );
}

export function getEVMNetworkConfig(networkKey: NetworkKey): EVMNetworkConfig {
  const currentNetwork = useWalletStore.getState().network;
  const cfg = getEVMChains(currentNetwork).find(c => c.chainId === networkKey);

  if (!cfg) {
    throw new Error(`Unsupported EVM network: ${networkKey}`);
  }
  return cfg;
}

export async function getNativeBalance(networkKey: any, address: any): Promise<string> {
  const { rpcUrls, chainId } = getEVMNetworkConfig(networkKey);

  try {
    const bal = await rpcManager.fetchWithFallback(
      chainId,
      rpcUrls,
      async provider => await provider.getBalance(address)
    );
    return ethers.formatEther(bal);
  } catch (error) {
    console.error(`Failed to fetch balance for ${address} on ${networkKey}:`, error);
    return '0';
  }
}

export async function getERC20Balances(
  networkKey: NetworkKey,
  senderAddress: string,
  evmAssets: any[]
): Promise<any[]> {
  const { rpcUrls, chainId } = getEVMNetworkConfig(networkKey);

  const updatedAssets = [];
  for (const asset of evmAssets) {
    try {
      let bal: bigint;
      if (asset.isNative) {
        bal = await rpcManager.fetchWithFallback(chainId, rpcUrls, p => p.getBalance(senderAddress));
      } else {
        bal = await rpcManager.fetchWithFallback(chainId, rpcUrls, async p => {
          const contract = new ethers.Contract(asset.address, ERC20_ABI, p);
          const res = await contract.balanceOf(senderAddress);
          if (res === undefined || res === null) return BigInt(0);
          return res;
        });
      }
      updatedAssets.push({
        ...asset,
        balance: Number(ethers.formatUnits(bal || 0, asset.decimals)),
      });
      await new Promise(r => setTimeout(r, 50));
    } catch (error) {
      console.warn(`Failed to fetch balance for ${asset.symbol} on ${networkKey}:`, error);
      updatedAssets.push({
        ...asset,
        balance: 0,
      });
    }
  }
  return updatedAssets;
}

export async function estimateEVMFees(
  networkKey: NetworkKey,
  from: string,
  to: string,
  amount: string,
  tokenAddress?: string,
  tokenDecimals?: number
): Promise<{
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  totalFee: string;
  totalCost: string;
}> {
  const { rpcUrls, chainId } = getEVMNetworkConfig(networkKey) as any;
  const config = getEVMNetworkConfig(networkKey) as any;
  const defaultGasLimit = tokenAddress ? BigInt(65000) : BigInt(config.gasLimit || 21000);
  const defaultGasPrice = BigInt(20000000000);

  try {
    const amountParsed = tokenAddress ? ethers.parseUnits(amount, tokenDecimals || 18) : ethers.parseEther(amount);

    // 1. Fetch Gas Limit from RPC
    const gasLimit = await rpcManager.fetchWithFallback(chainId, rpcUrls, async p => {
      if (tokenAddress) {
        const iface = new ethers.Interface(SendErcAbi);
        const data = iface.encodeFunctionData('transfer', [to, amountParsed]);
        return await p.estimateGas({ from, to: tokenAddress, data });
      } else {
        return await p.estimateGas({ from, to, value: amountParsed });
      }
    }).then(BigInt).catch(() => defaultGasLimit);

    // 2. Fetch Fee Data from Wallet API or RPC
    const prefix = getNetworkPrefix(networkKey);
    let walletInfo: any = null;
    try {
      walletInfo = await getWalletGasInfo(prefix, from);
    } catch (e) {
      console.warn(`[estimateEVMFees] Backend proxy failed, falling back to RPC:`, e);
    }

    let feeData: any;
    if (walletInfo?.gasFeeData) {
      feeData = {
        gasPrice: walletInfo.gasFeeData.gasPrice ? BigInt(walletInfo.gasFeeData.gasPrice) : undefined,
        maxFeePerGas: walletInfo.gasFeeData.maxFeePerGas ? BigInt(walletInfo.gasFeeData.maxFeePerGas) : undefined,
        maxPriorityFeePerGas: walletInfo.gasFeeData.maxPriorityFeePerGas ? BigInt(walletInfo.gasFeeData.maxPriorityFeePerGas) : undefined,
      };
    } else {
      feeData = await rpcManager.fetchWithFallback(chainId, rpcUrls, p => p.getFeeData());
    }

    let effectiveGasPrice = feeData?.maxFeePerGas ?? feeData?.gasPrice ?? defaultGasPrice;

    const totalCost = ethers.formatEther(gasLimit * effectiveGasPrice);

    return {
      gasLimit: gasLimit.toString(),
      gasPrice: feeData?.gasPrice?.toString(),
      maxFeePerGas: feeData?.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: feeData?.maxPriorityFeePerGas?.toString(),
      totalFee: totalCost,
      totalCost,
    };
  } catch (error) {
    console.error(`EVM fee estimation failed for ${networkKey}:`, error);
    const totalCost = ethers.formatEther(defaultGasLimit * defaultGasPrice);
    return {
      gasLimit: defaultGasLimit.toString(),
      gasPrice: defaultGasPrice.toString(),
      totalFee: totalCost,
      totalCost,
    };
  }
}

export async function signEVMTransaction(
  transaction: {
    to: string;
    value: string;
    chainId: string;
    gasLimit?: string;
    nonce?: number;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    gasPrice?: string;
    data?: string;
  },
  privateKey: string
): Promise<string> {
  try {
    if (!privateKey.startsWith('0x')) {
      privateKey = '0x' + privateKey;
    }
    const wallet = new ethers.Wallet(privateKey);

    const chainIdNum = parseInt(transaction.chainId, 10);
    if (isNaN(chainIdNum)) {
      throw new Error('Invalid chainId format');
    }

    const txData: any = {
      to: transaction.to,
      value: transaction.value,
      chainId: chainIdNum,
      gasLimit: transaction.gasLimit ? BigInt(transaction.gasLimit) : undefined,
      nonce: transaction.nonce ?? undefined,
    };

    if (transaction.maxFeePerGas && transaction.maxPriorityFeePerGas) {
      txData.maxFeePerGas = BigInt(transaction.maxFeePerGas);
      txData.maxPriorityFeePerGas = BigInt(transaction.maxPriorityFeePerGas);
      txData.type = 2;
    } else if (transaction.gasPrice) {
      txData.gasPrice = BigInt(transaction.gasPrice);
    }

    if (transaction.data) {
      txData.data = transaction.data;
    }

    const signedTransaction = await wallet.signTransaction(txData);
    return signedTransaction;
  } catch (error) {
    console.error('Failed to sign EVM transaction:', error);
    throw new Error(
      `Transaction signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function simulateEVMTransaction(
  networkKey: NetworkKey,
  from: string,
  to: string,
  value: string | bigint,
  data: string = '0x'
): Promise<{ gasLimit: bigint; feeData: any; totalRequired: bigint }> {
  const { rpcUrls, nativeCurrency } = getEVMNetworkConfig(networkKey) as any;
  const amountInWei = typeof value === 'string' ? BigInt(value) : value;

  const prefix = getNetworkPrefix(networkKey);
  const walletInfo = await getWalletGasInfo(prefix, from);

  let feeData: any;
  if (walletInfo?.gasFeeData) {
    feeData = {
      gasPrice: walletInfo.gasFeeData.gasPrice ? BigInt(walletInfo.gasFeeData.gasPrice) : undefined,
      maxFeePerGas: walletInfo.gasFeeData.maxFeePerGas ? BigInt(walletInfo.gasFeeData.maxFeePerGas) : undefined,
      maxPriorityFeePerGas: walletInfo.gasFeeData.maxPriorityFeePerGas ? BigInt(walletInfo.gasFeeData.maxPriorityFeePerGas) : undefined,
    };
  }

  const { estimate, rpcFeeData, balance } = await rpcManager.fetchWithFallback(
    networkKey,
    rpcUrls,
    async (p) => {
      const est = await p.estimateGas({
        from,
        to,
        value: amountInWei,
        data,
      });
      const bal = await p.getBalance(from);
      const fd = !feeData ? await p.getFeeData() : null;
      return { estimate: BigInt(est), rpcFeeData: fd, balance: bal };
    }
  );

  if (!feeData && rpcFeeData) {
    feeData = rpcFeeData;
  }

  const gasLimitBigInt = estimate + estimate / BigInt(5); // 20% cushion

  const price = feeData.maxFeePerGas || feeData.gasPrice || BigInt(20000000000);
  const totalRequired = (data === '0x' ? amountInWei : BigInt(0)) + (gasLimitBigInt * price);

  if (balance < totalRequired) {
    const have = parseFloat(ethers.formatEther(balance)).toPrecision(6);
    const need = parseFloat(ethers.formatEther(totalRequired)).toPrecision(6);
    throw new Error(
      `Insufficient funds for gas. Have ${have} ${nativeCurrency.symbol}, Need ${need} ${nativeCurrency.symbol}`
    );
  }

  return { gasLimit: gasLimitBigInt, feeData, totalRequired };
}
