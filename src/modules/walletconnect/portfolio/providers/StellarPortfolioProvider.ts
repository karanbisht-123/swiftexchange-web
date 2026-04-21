import * as StellarSdk from '@stellar/stellar-sdk';
import { type Asset } from '../../store/portfolioStore';
import { type IPortfolioProvider, type PortfolioFetchParams } from '../types';
import { getStellarConfig } from '../../config/chains';
import { getAssetBySymbol, getGlobalAssetMetadata } from '../../../evm/utils/Chainregistry';

export class StellarPortfolioProvider implements IPortfolioProvider {
  public id = 'stellar';

  async fetch(params: PortfolioFetchParams): Promise<Asset[]> {
    const { connectedWallets, network } = params;
    const stellarAddress = connectedWallets.stellar?.address;

    if (!stellarAddress) return [];

    try {
      const config = getStellarConfig(network as any);
      const server = new StellarSdk.Horizon.Server(config.horizonUrl);
      const account = await server.loadAccount(stellarAddress);
      const stellarChainId = network === 'mainnet' ? 9000000 : 9000001;

      const assets: Asset[] = [];

      for (const b of account.balances) {
        const isNative = b.asset_type === 'native';
        const symbol = 'asset_code' in b ? b.asset_code : 'XLM';
        const issuer = ('asset_issuer' in b ? b.asset_issuer : undefined) ?? undefined;
        
        // Use local registry for speed, background enrichPrices will handle the rest later
        const registryAsset = getAssetBySymbol(stellarChainId, symbol);
        const globalMeta = !registryAsset ? getGlobalAssetMetadata(symbol) : undefined;

        const name = registryAsset?.name || symbol;
        const image = registryAsset?.logoURI || globalMeta?.logoURI || `https://ui-avatars.com/api/?name=${symbol}&background=random`;

        assets.push({
          id: isNative ? 'stellar-XLM' : `stellar-${symbol}-${issuer}`,
          symbol,
          name,
          image,
          balance: parseFloat(b.balance),
          current_price: 0, // Set to 0 to trigger async enrichment
          price_change_percentage_24h: 0,
          chainName: network === 'mainnet' ? 'Stellar' : 'Stellar Testnet',
          chainType: 'stellar',
          chainId: stellarChainId,
          address: issuer,
          decimals: 7,
          isNative,
        });
      }

      return assets;
    } catch (error) {
      console.error('[StellarPortfolioProvider] Failed to fetch Stellar portfolio:', error);
      return [];
    }
  }
}
