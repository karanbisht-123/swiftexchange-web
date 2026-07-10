import {
  Account,
  Asset,
  BASE_FEE,
  Horizon,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

import { getStellarConfig } from '../../../walletconnect/config/chains';
import { StellarSequenceTracker } from '../StellarSequenceTracker';
import { signAndSubmitTransaction } from '../transactionService';

export interface TrustlineParams {
  server: Horizon.Server;
  stellarAddress: string;
  assetCode: string;
  assetIssuer: string;
  currentNetwork: any;
}

export interface TrustlineResult {
  success: boolean;
  error?: string;
  transactionHash?: string;
}

export const buildTrustlineTransaction = async (
  params: TrustlineParams,
  limit?: string
): Promise<string> => {
  const { server, stellarAddress, assetCode, assetIssuer, currentNetwork } = params;

  const accountResponse = await server.loadAccount(stellarAddress);
  const config = getStellarConfig(currentNetwork);
  const networkPassphrase = config?.networkPassphrase || Networks.TESTNET;

  const baseSeq = StellarSequenceTracker.getAndIncrementSequence(
    stellarAddress,
    accountResponse.sequenceNumber()
  );
  const sourceAccount = new Account(stellarAddress, baseSeq);

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.changeTrust({
        asset: new Asset(assetCode, assetIssuer),
        limit: limit,
      })
    )
    .setTimeout(30)
    .build();

  return transaction.toXDR();
};

export const signAndSubmitTrustline = async (
  xdr: string,
  network: string,
  networkPassphrase: string,
  provider: any
): Promise<TrustlineResult> => {
  const result = await signAndSubmitTransaction({
    xdr,
    network,
    networkPassphrase,
    provider,
  });

  if (result.success) {
    return {
      success: true,
      transactionHash: result.hash,
    };
  }

  return {
    success: false,
    error: result.error || 'Failed to sign and submit transaction',
  };
};

export const formatAssetBalance = (balance: string): string => {
  const num = parseFloat(balance);

  if (num === 0) return '0.00';
  if (num < 0.01) return num.toFixed(7);
  if (num < 1) return num.toFixed(4);
  if (num < 1000) return num.toFixed(2);

  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const truncateAddress = (address: string, startChars = 4, endChars = 4): string => {
  if (!address || address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
};

export const validateStellarAddress = (address: string): boolean => {
  return /^G[A-Z2-7]{55}$/.test(address);
};

export const getAssetKey = (code: string, issuer: string): string => {
  return `${code}-${issuer}`;
};

export const isNativeAsset = (assetType: string): boolean => {
  return assetType === 'native';
};

export const sortAssets = <T extends { isTrusted: boolean; name?: string; code: string }>(
  assets: T[]
): T[] => {
  return assets.sort((a, b) => {
    if (a.isTrusted !== b.isTrusted) {
      return a.isTrusted ? -1 : 1;
    }
    return (a.name || a.code).localeCompare(b.name || b.code);
  });
};
