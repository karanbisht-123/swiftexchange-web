import * as StellarSDK from '@stellar/stellar-sdk';

import { generateTransactionId } from '../../../utils/transactionUtils';
import { getStellarConfig } from '../../walletconnect/config/chains';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import {
  type StellarSendTransaction,
  type StellarTransactionOptions,
} from '../types/stellarTransaction.types';

const getByteLength = (str: string): number => new TextEncoder().encode(str).length;

export async function getStellarBalance(assetType: string, from: string): Promise<string> {
  const currentNetwork = useWalletStore.getState().network;
  const config = getStellarConfig(currentNetwork);

  const server = new StellarSDK.Horizon.Server(config.horizonUrl);
  try {
    const account = await server.loadAccount(from);
    let balance = '0';
    if (assetType === 'native') {
      const nativeBalanceObj = account.balances.find(b => b.asset_type === 'native');
      if (nativeBalanceObj) {
        const nativeBalance = parseFloat(nativeBalanceObj.balance);
        const baseReserve = 0.5; // XLM
        const subentryCount = account.subentry_count;
        const totalReserve = (2 + subentryCount) * baseReserve;
        const liabilities = parseFloat((nativeBalanceObj as any).selling_liabilities || '0');

        const available = Math.max(0, nativeBalance - totalReserve - liabilities);
        balance = available.toString();
      } else {
        balance = '0';
      }
    } else {
      // For non-native, look for code and issuer match
      // assetType should be code:issuer
      const [code, issuer] = assetType.split(':');
      balance = account.balances.find(b =>
        (b as any).asset_code === code && (b as any).asset_issuer === issuer
      )?.balance ?? '0';
    }
    return balance;
  } catch (error) {
    console.error('Failed to fetch Stellar balance:', error);
    return '0';
  }
}

export async function fetchStellarAccountAssets(address: string): Promise<any[]> {
  const currentNetwork = useWalletStore.getState().network;
  const config = getStellarConfig(currentNetwork);
  const server = new StellarSDK.Horizon.Server(config.horizonUrl);

  try {
    const account = await server.loadAccount(address);
    return account.balances.map(b => {
      if (b.asset_type === 'native') {
        return {
          code: 'XLM',
          issuer: '',
          balance: b.balance,
          isNative: true,
          type: 'native'
        };
      }
      return {
        code: (b as any).asset_code,
        issuer: (b as any).asset_issuer,
        balance: b.balance,
        isNative: false,
        type: b.asset_type
      };
    });
  } catch (error) {
    console.error('Failed to fetch Stellar assets:', error);
    return [];
  }
}

export async function sendCryptoStellarBuild(
  from: string,
  to: string,
  amount: string,
  options: StellarTransactionOptions = {},
  asset: { code: string; issuer?: string; isNative?: boolean } = { code: 'XLM', isNative: true }
): Promise<StellarSendTransaction> {
  const currentNetwork = useWalletStore.getState().network;
  const config = getStellarConfig(currentNetwork);

  const server = new StellarSDK.Horizon.Server(config.horizonUrl);
  const networkPassphrase =
    config.network === 'PUBLIC' ? StellarSDK.Networks.PUBLIC : StellarSDK.Networks.TESTNET;

  if (!StellarSDK.StrKey.isValidEd25519PublicKey(from)) {
    throw new Error('Invalid sender Stellar address');
  }
  if (!StellarSDK.StrKey.isValidEd25519PublicKey(to)) {
    throw new Error('Invalid recipient Stellar address');
  }

  let memo: StellarSDK.Memo | undefined;
  if (options.memo) {
    const memoText = options.memo.toString();
    if (getByteLength(memoText) > 28) {
      throw new Error('Memo exceeds maximum length of 28 bytes.');
    }
    memo = StellarSDK.Memo.text(memoText);
  }

  const sourceAccount = await server.loadAccount(from);
  const stellarAmount = parseFloat(amount).toFixed(7);

  const txBuilder = new StellarSDK.TransactionBuilder(sourceAccount, {
    fee: StellarSDK.BASE_FEE,
    networkPassphrase,
  });

  let stellarAsset: StellarSDK.Asset;
  if (asset.isNative || asset.code === 'XLM') {
    stellarAsset = StellarSDK.Asset.native();
  } else {
    stellarAsset = new StellarSDK.Asset(asset.code, asset.issuer!);
  }

  txBuilder.addOperation(
    StellarSDK.Operation.payment({
      destination: to,
      asset: stellarAsset,
      amount: stellarAmount,
    })
  );

  if (memo) {
    txBuilder.addMemo(memo);
  }

  txBuilder.setTimeout(30);

  const builtTransaction = txBuilder.build();
  const xdr = builtTransaction.toXDR();

  const transaction: StellarSendTransaction = {
    id: generateTransactionId('stellar'),
    type: 'send',
    from,
    to,
    amount: stellarAmount,
    asset: asset.code,
    network: config.network,
    chainId: `stellar:${config.chainId}`,
    sequence: sourceAccount.sequenceNumber(),
    operations: [
      {
        type: 'payment',
        destination: to,
        asset: asset.isNative ? 'native' : asset.code,
        amount: stellarAmount,
      },
    ],
    fee: StellarSDK.BASE_FEE,
    memo: options.memo,
    timestamp: Date.now(),
    status: 'pending',
    xdr,
  };

  return transaction;
}

export async function estimateStellarFees(): Promise<{
  baseFee?: string;
  totalFee: string;
  totalCost: string;
}> {
  const currentNetwork = useWalletStore.getState().network;
  const config = getStellarConfig(currentNetwork);

  const server = new StellarSDK.Horizon.Server(config.horizonUrl);
  try {
    const baseFee = await server.fetchBaseFee();
    const totalFee = baseFee.toString();
    const feeInXLM = (baseFee / 10000000).toFixed(7);
    return { baseFee: totalFee, totalFee, totalCost: feeInXLM };
  } catch (error) {
    console.error('Stellar fee estimation failed:', error);
    const defaultFee = StellarSDK.BASE_FEE;
    const feeInXLM = (parseInt(defaultFee) / 1e7).toFixed(7);
    return { baseFee: defaultFee, totalFee: defaultFee, totalCost: feeInXLM };
  }
}

export async function signStellarTransaction(
  transaction: StellarSendTransaction,
  privateKey: string
): Promise<string> {
  const currentNetwork = useWalletStore.getState().network;
  const config = getStellarConfig(currentNetwork);

  const networkPassphrase =
    config.network === 'PUBLIC' ? StellarSDK.Networks.PUBLIC : StellarSDK.Networks.TESTNET;

  if (!privateKey.startsWith('S') || privateKey.length !== 56) {
    throw new Error('Invalid Stellar private key format');
  }

  try {
    const sourceKeypair = StellarSDK.Keypair.fromSecret(privateKey);

    if (transaction.xdr) {
      const tx = new StellarSDK.Transaction(transaction.xdr, networkPassphrase);
      tx.sign(sourceKeypair);
      return tx.toXDR();
    }

    const server = new StellarSDK.Horizon.Server(config.horizonUrl);
    const account = await server.loadAccount(transaction.from);
    const txBuilder = new StellarSDK.TransactionBuilder(account, {
      fee: transaction.fee || StellarSDK.BASE_FEE,
      networkPassphrase,
    });

    transaction.operations.forEach(op => {
      if (op.type === 'payment') {
        txBuilder.addOperation(
          StellarSDK.Operation.payment({
            destination: op.destination,
            asset: StellarSDK.Asset.native(),
            amount: op.amount,
          })
        );
      }
    });

    if (transaction.memo) {
      txBuilder.addMemo(StellarSDK.Memo.text(transaction.memo));
    }

    txBuilder.setTimeout(30);
    const builtTx = txBuilder.build();
    builtTx.sign(sourceKeypair);
    return builtTx.toXDR();
  } catch (error) {
    console.error('Failed to sign Stellar transaction:', error);
    throw new Error(
      `Transaction signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function sendCryptoStellarBroadcast(signedXDR: string): Promise<string> {
  const currentNetwork = useWalletStore.getState().network;
  const config = getStellarConfig(currentNetwork);

  const server = new StellarSDK.Horizon.Server(config.horizonUrl);
  const networkPassphrase =
    config.network === 'PUBLIC' ? StellarSDK.Networks.PUBLIC : StellarSDK.Networks.TESTNET;

  const tx = new StellarSDK.Transaction(signedXDR, networkPassphrase);
  const response = await server.submitTransaction(tx);
  return response.hash || 'unknown';
}
