import { ethers } from 'ethers';

import { getEVMChains } from '../../walletconnect/config/chains';

export type EVMNetworkConfig = {
  chainId: number;
  name: string;
  rpcUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  blockExplorerUrl: string;
};

export type NetworkKey = number;

export function isValidEVMNetwork(networkKey: unknown): networkKey is NetworkKey {
  return typeof networkKey === 'number' && getEVMChains().some(c => c.chainId === networkKey);
}

export function getEVMNetworkConfig(networkKey: NetworkKey): EVMNetworkConfig {
  const cfg = getEVMChains().find(c => c.chainId === networkKey);

  if (!cfg) {
    throw new Error(`Unsupported EVM network: ${networkKey}`);
  }
  return cfg;
}

export async function getNativeBalance(networkKey: any, address: any): Promise<string> {
  const { rpcUrl } = getEVMNetworkConfig(networkKey);
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  try {
    const bal = await provider.getBalance(address);
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
  const { rpcUrl } = getEVMNetworkConfig(networkKey);
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const updatedAssets = await Promise.all(
    evmAssets.map(async asset => {
      try {
        let bal: bigint;
        if (asset.isNative) {
          bal = await provider.getBalance(senderAddress);
        } else {
          const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
          const contract = new ethers.Contract(asset.address, erc20Abi, provider);
          bal = await contract.balanceOf(senderAddress);
        }
        return {
          ...asset,
          balance: Number(ethers.formatUnits(bal, asset.decimals)),
        };
      } catch (error) {
        console.error(`Failed to fetch balance for ${asset.code}:`, error);
        return {
          ...asset,
          balance: 0,
        };
      }
    })
  );
  return updatedAssets;
}

export async function estimateEVMFees(
  networkKey: NetworkKey,
  from: string,
  to: string,
  amount: string
): Promise<{
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  totalFee: string;
  totalCost: string;
}> {
  const { rpcUrl } = getEVMNetworkConfig(networkKey);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const defaultGasLimit = BigInt(21000);
  const defaultGasPrice = BigInt(20000000000);

  try {
    const amountInWei = ethers.parseEther(amount);
    const gasLimit = BigInt(
      await provider.estimateGas({
        from,
        to,
        value: amountInWei,
      })
    );

    const feeData = await provider.getFeeData();
    let effectiveGasPrice = feeData.gasPrice ?? defaultGasPrice;
    if (feeData.maxFeePerGas) {
      effectiveGasPrice = feeData.maxFeePerGas;
    }

    const totalCost = ethers.formatEther(gasLimit * effectiveGasPrice);

    return {
      gasLimit: gasLimit.toString(),
      gasPrice: feeData.gasPrice?.toString(),
      maxFeePerGas: feeData.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
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
