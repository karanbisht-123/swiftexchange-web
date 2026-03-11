import { ethers } from 'ethers';

import { fetchApiResponseFromProxy } from '../../../service/apiService';
import type {
  EVMSendTransaction,
  EVMTransactionOptions,
} from '../../../types/evm/evmTransaction.types';
import { generateTransactionId, getNetworkPrefix } from '../../../utils/transactionUtils';
import { type NetworkKey, getEVMNetworkConfig, isValidEVMNetwork } from '../utils/evmUtils';
import { rpcManager } from '../utils/rpcProvider';

export async function sendCryptoEVMPrepare(
  networkKey: any,
  from: string,
  to: string,
  amount: string
): Promise<{ unsignedTx: any }> {
  console.log(networkKey, 'key', from, 'from', to, 'to', amount, 'amount');
  if (!isValidEVMNetwork(networkKey)) {
    throw new Error(`Unsupported EVM network: ${networkKey}`);
  }

  const config = getEVMNetworkConfig(networkKey);
  const prefix = getNetworkPrefix(networkKey);
  const endpoint = prefix + '/transaction/prepare';

  try {
    const urls = [config.rpcUrl, ...(config.fallbackRpcUrls || [])];
    const { feeData, nonce } = await rpcManager.fetchWithFallback(config.chainId, urls, async p => {
      const fd = await p.getFeeData();
      const n = await p.getTransactionCount(from);
      return { feeData: fd, nonce: n };
    });
    const amountInWei = ethers.parseEther(amount);

    const unsignedTxData: any = {
      to,
      value: '0x' + amountInWei.toString(16),
      chainId: config.chainId,
      nonce,
      gasLimit: '0x5208',
    };

    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      unsignedTxData.maxFeePerGas = '0x' + feeData.maxFeePerGas.toString(16);
      unsignedTxData.maxPriorityFeePerGas = '0x' + feeData.maxPriorityFeePerGas.toString(16);
      unsignedTxData.type = 2;
    } else if (feeData.gasPrice) {
      unsignedTxData.gasPrice = '0x' + feeData.gasPrice.toString(16);
    }

    const serializedTx = ethers.Transaction.from(unsignedTxData).unsignedSerialized;

    const response = await fetchApiResponseFromProxy<{ unsignedTx: string }>(endpoint, 'POST', {
      unsignedTx: serializedTx,
      walletAddress: from,
    });

    const unsignedTx = response.data;
    if (!unsignedTx) {
      throw new Error('Empty unsigned transaction received from API');
    }

    return { unsignedTx };
  } catch (error) {
    console.error('Failed to prepare EVM transaction:', error);
    throw new Error(
      `Prepare transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function sendCryptoEVMBuild(
  networkKey: NetworkKey,
  from: string,
  to: string,
  amount: string,
  options: EVMTransactionOptions = {}
): Promise<EVMSendTransaction> {
  const { unsignedTx } = await sendCryptoEVMPrepare(networkKey, from, to, amount);

  const config = getEVMNetworkConfig(networkKey);
  let parsedTx;
  try {
    parsedTx = ethers.Transaction.from(unsignedTx);
  } catch (error) {
    console.error('Failed to parse unsigned transaction:', error);
    throw new Error('Invalid unsigned transaction format');
  }

  const tx: EVMSendTransaction = {
    id: generateTransactionId('evm'),
    type: 'send',
    from,
    to: parsedTx.to || to,
    amount,
    asset: config.nativeCurrency.symbol,
    network: config.name,
    chainId: `${config.chainId}`,
    value: parsedTx.value
      ? '0x' + parsedTx.value.toString(16)
      : '0x' + ethers.parseEther(amount).toString(16),
    gasLimit: parsedTx.gasLimit ? '0x' + parsedTx.gasLimit.toString(16) : '0x5208',
    nonce: parsedTx.nonce ?? 0,
    timestamp: Date.now(),
    status: 'pending',
    maxFeePerGas: parsedTx.maxFeePerGas ? parsedTx.maxFeePerGas.toString() : undefined,
    maxPriorityFeePerGas: parsedTx.maxPriorityFeePerGas
      ? parsedTx.maxPriorityFeePerGas.toString()
      : undefined,
    gasPrice: parsedTx.gasPrice ? parsedTx.gasPrice.toString() : undefined,
    data: parsedTx.data || undefined,
    memo: options.memo,
  };

  if (options.gasLimit) {
    tx.gasLimit = '0x' + BigInt(options.gasLimit).toString(16);
  }
  if (options.maxFeePerGas && options.maxPriorityFeePerGas) {
    tx.maxFeePerGas = options.maxFeePerGas;
    tx.maxPriorityFeePerGas = options.maxPriorityFeePerGas;
    delete tx.gasPrice;
  } else if (options.gasPrice) {
    tx.gasPrice = options.gasPrice;
    delete tx.maxFeePerGas;
    delete tx.maxPriorityFeePerGas;
  }

  return tx;
}

export async function sendCryptoEVMBroadcast(
  signedTransaction: string,
  networkKey: any
): Promise<any> {
  try {
    const prefix = getNetworkPrefix(networkKey);
    console.log(prefix, 'oooooooo');
    const response = await fetchApiResponseFromProxy<{ txHash: string }>(
      prefix + '/transaction/broadcast',
      'POST',
      { signedTx: signedTransaction }
    );
    return response.data.txHash;
  } catch (error) {
    console.error('Failed to broadcast EVM transaction via proxy:', error);
    throw new Error(
      `Transaction broadcast failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export { getNativeBalance, estimateEVMFees, signEVMTransaction } from '../utils/evmUtils';
