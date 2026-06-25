import { ethers } from 'ethers';
import { LIMIT_ORDER_PROTOCOL, NATIVE_ADDRESS } from '../constants/swap.constants';
import { getEVMNetworkConfig } from '../../../utils/evmUtils';
import { rpcManager } from '../../../utils/rpcProvider';

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

const isNativeAddress = (address: string | undefined | null): boolean => {
  if (!address) return true;
  const lowAddress = address.toLowerCase();
  return lowAddress === 'native' || lowAddress === NATIVE_ADDRESS.toLowerCase();
};

export async function readAllowance(
  tokenAddress: string,
  owner: string,
  spender: string,
  chainId: number | string,
  provider: any
): Promise<bigint> {
  try {
    const rpcUrls = getEVMNetworkConfig(chainId).rpcUrls;
    if (rpcUrls.length > 0) {
      return await rpcManager.fetchWithFallback(chainId, rpcUrls, async rpcProvider => {
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, rpcProvider);
        return contract.allowance(owner, spender, { blockTag: 'pending' }) as Promise<bigint>;
      });
    }
  } catch {
    // fall through to wallet provider
  }

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

export async function sendApprovalTx(
  tokenAddress: string,
  spender: string,
  walletAddress: string,
  provider: any,
  amount: bigint = ethers.MaxUint256,
  onBeforeWalletSign?: () => void
): Promise<string> {
  const ethersProvider = new ethers.BrowserProvider(provider);
  const signer = await ethersProvider.getSigner();

  const iface = new ethers.Interface(ERC20_ABI);
  const data = iface.encodeFunctionData('approve', [spender, amount]);

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
    if (err.message?.includes('Insufficient funds') || err.message?.includes('insufficient funds'))
      throw err;
    console.warn('[sendApprovalTx] Gas estimate failed, using 100k fallback');
    gasLimit = 100_000n;
  }

  const feeData = await ethersProvider.getFeeData();
  let gasParams: Partial<ethers.TransactionRequest>;

  const rawGasPrice = feeData.gasPrice ?? feeData.maxFeePerGas;
  if (!rawGasPrice) throw new Error('Could not determine gas price for approval');
  gasParams = {
    gasPrice: (rawGasPrice * 120n) / 100n,
  };

  onBeforeWalletSign?.();
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

export async function ensureFusionAllowance(
  tokenAddress: string,
  walletAddress: string,
  amountBN: bigint,
  provider: any,
  chainId: number | string,
  onBeforeWalletSign?: () => void
): Promise<{ approvalTxHash?: string }> {
  if (!tokenAddress || isNativeAddress(tokenAddress)) {
    return {};
  }

  const allowance = await readAllowance(
    tokenAddress,
    walletAddress,
    LIMIT_ORDER_PROTOCOL,
    chainId,
    provider
  );

  if (allowance >= amountBN) {
    console.log('[ensureFusionAllowance] Already approved, skipping');
    return {};
  }

  if (!provider) throw new Error('No provider available for approval transaction');

  if (allowance > 0n && allowance < amountBN) {
    if (tokenAddress.toLowerCase() === '0xdac17f958d2ee523a2206206994597c13d831ec7') {
      await sendApprovalTx(
        tokenAddress,
        LIMIT_ORDER_PROTOCOL,
        walletAddress,
        provider,
        0n,
        onBeforeWalletSign
      );
    }
  }

  const approvalTxHash = await sendApprovalTx(
    tokenAddress,
    LIMIT_ORDER_PROTOCOL,
    walletAddress,
    provider,
    ethers.MaxUint256,
    onBeforeWalletSign
  );

  const ethersProvider = new ethers.BrowserProvider(provider);
  let receipt = null;
  const start = Date.now();
  while (Date.now() - start < 120000) {
    try {
      receipt = await ethersProvider.getTransactionReceipt(approvalTxHash);
      if (receipt !== null) break;
    } catch {
      // Network hiccup
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  if (receipt?.status === 0) {
    throw new Error('Fusion approval transaction failed on-chain');
  }

  return { approvalTxHash };
}
