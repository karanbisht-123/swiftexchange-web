import * as StellarSDK from '@stellar/stellar-sdk';

import { getChainById } from '../../evm/utils/Chainregistry';
import type { TokenInfo } from '../types/stellar.types';

const accountCache = new Map<string, { data: StellarSDK.Horizon.AccountResponse; ts: number }>();

export class StellarBaseService {
  protected server: StellarSDK.Horizon.Server;
  protected networkPassphrase: string;
  protected networkKey: string;

  constructor(horizonUrl: string, networkPassphrase: string, networkKey: string) {
    const serverOptions: any = {};
    if (horizonUrl.startsWith('http://')) {
      serverOptions.allowHttp = true;
    }

    this.server = new StellarSDK.Horizon.Server(horizonUrl, serverOptions);
    this.networkPassphrase = networkPassphrase;
    this.networkKey = networkKey;
  }

  static clearAccountCache() {
    accountCache.clear();
  }

  async getAccountData(address: string): Promise<{ tokens: TokenInfo[]; subentryCount: number }> {
    if (!StellarSDK.StrKey.isValidEd25519PublicKey(address)) {
      throw new Error('Invalid Stellar address');
    }

    try {
      let response: StellarSDK.Horizon.AccountResponse;
      const cacheKey = `${this.networkPassphrase}-${address}`;
      const cached = accountCache.get(cacheKey);

      if (cached && Date.now() - cached.ts < 10000) {
        response = cached.data;
      } else {
        response = await this.server.loadAccount(address);
        accountCache.set(cacheKey, { data: response, ts: Date.now() });
      }
      const tokens: TokenInfo[] = [];

      for (const balance of response.balances) {
        if (balance.asset_type === 'native') {
          tokens.push({
            asset: StellarSDK.Asset.native(),
            code: 'XLM',
            balance: balance.balance,
            isPopular: true,
            hasTrustline: true,
          });
        } else if (
          balance.asset_type === 'credit_alphanum4' ||
          balance.asset_type === 'credit_alphanum12'
        ) {
          const asset = new StellarSDK.Asset(balance.asset_code, balance.asset_issuer);
          tokens.push({
            asset,
            code: balance.asset_code,
            issuer: balance.asset_issuer,
            balance: balance.balance,
            isPopular: false,
            hasTrustline: true,
          });
        }
      }

      return { tokens, subentryCount: response.subentry_count };
    } catch (error: any) {
      if (error.response?.status === 404) {
        return {
          tokens: [
            {
              asset: StellarSDK.Asset.native(),
              code: 'XLM',
              balance: '0',
              isPopular: true,
              hasTrustline: true,
            },
          ],
          subentryCount: 0,
        };
      }
      console.error('Failed to fetch token balances:', error);
      throw new Error('Failed to load account balances');
    }
  }

  async getTokenBalances(address: string): Promise<TokenInfo[]> {
    const { tokens } = await this.getAccountData(address);
    return tokens;
  }

  async getAssetsWithBalances(
    address: string
  ): Promise<{ tokens: TokenInfo[]; subentryCount: number }> {
    const isMainnet = this.networkPassphrase.includes('Public Global Stellar Network');
    const chainId = isMainnet ? 'pubnet' : 'testnet';
    let chainConfig = getChainById(chainId);
    if (!chainConfig && !isMainnet) {
      chainConfig = getChainById('pubnet');
    }

    if (!chainConfig) return { tokens: [], subentryCount: 0 };

    let balances: TokenInfo[] = [];
    let subentryCount = 0;
    try {
      const accountData = await this.getAccountData(address);
      balances = accountData.tokens;
      subentryCount = accountData.subentryCount;
    } catch (error) {
      console.warn(error, 'Could not load balances, using zero balances');
    }

    const registryTokens: TokenInfo[] = chainConfig.assets
      .map(a => {
        const isNative =
          a.type === 'NATIVE' || a.symbol === 'XLM' || a.address === 'native' || !a.address;

        let asset: StellarSDK.Asset;
        try {
          asset = isNative ? StellarSDK.Asset.native() : new StellarSDK.Asset(a.symbol, a.address);
        } catch {
          try {
            asset = StellarSDK.Asset.native();
          } catch {
            return null as any;
          }
        }

        const balRecord = balances.find(b => this.assetsEqual(b.asset, asset));

        return {
          asset,
          code: a.symbol,
          issuer: isNative ? undefined : a.address,
          balance: balRecord?.balance || '0',
          name: a.name,
          icon: a.logoURI,
          decimals: a.decimals,
          isPopular: true,
          hasTrustline: isNative || !!balRecord,
          homeDomain: a.domain || (isNative ? 'stellar.org' : undefined),
          domain: a.domain || (isNative ? 'stellar.org' : undefined),
        };
      })
      .filter(Boolean);

    const otherTokens = balances.filter(
      b => !registryTokens.some(rt => this.assetsEqual(rt.asset, b.asset))
    );

    return { tokens: [...registryTokens, ...otherTokens], subentryCount };
  }

  protected assetsEqual(a: StellarSDK.Asset, b: StellarSDK.Asset): boolean {
    if (a.isNative() && b.isNative()) return true;
    if (a.isNative() || b.isNative()) return false;
    return a.getCode() === b.getCode() && a.getIssuer() === b.getIssuer();
  }

  protected ensureTrustline(
    txBuilder: StellarSDK.TransactionBuilder,
    sourceAccount: StellarSDK.Horizon.AccountResponse,
    asset: StellarSDK.Asset
  ) {
    if (asset.isNative()) return;

    const hasTrustline = sourceAccount.balances.some(
      b =>
        (b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12') &&
        b.asset_code === asset.getCode() &&
        b.asset_issuer === asset.getIssuer()
    );

    if (!hasTrustline) {
      txBuilder.addOperation(
        StellarSDK.Operation.changeTrust({
          asset: asset,
        })
      );
    }
  }
}
