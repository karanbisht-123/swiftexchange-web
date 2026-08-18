import { getIndexerClient } from '../../../dydx/client/clients';
import { getAssetBySymbol, getGlobalAssetMetadata } from '../../../evm/utils/Chainregistry';
import { CHAINS } from '../../../evm/utils/assetmanagement/chains';
import { type Asset } from '../../store/portfolioStore';
import { type IPortfolioProvider, type PortfolioFetchParams } from '../types';

export class DydxPortfolioProvider implements IPortfolioProvider {
  public id = 'dydx';

  async fetch(params: PortfolioFetchParams): Promise<Asset[]> {
    const { connectedWallets } = params;

    const dydxAddress = (connectedWallets.evm as any)?.dydxAddress;
    if (!dydxAddress) return [];

    try {
      const indexerClient = getIndexerClient();
      const resp = await indexerClient.account.getSubaccount(dydxAddress, 0);

      if (!resp.subaccount) return [];

      const assets: Asset[] = [];
      const dydxChain = CHAINS.DYDX;
      const dydxChainId = dydxChain.chainId;

      // USDC Collateral (this is the primary asset in dYdX)
      const usdcBalance = parseFloat(resp.subaccount.equity || '0');
      if (usdcBalance > 0) {
        const symbol = 'USDC';
        const registryAsset = getAssetBySymbol(dydxChainId, symbol);
        const globalMeta = !registryAsset ? getGlobalAssetMetadata(symbol) : undefined;

        assets.push({
          id: `dydx-USDC`,
          symbol,
          name: registryAsset?.name || 'USD Coin',
          image:
            registryAsset?.logoURI ||
            globalMeta?.logoURI ||
            'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
          balance: usdcBalance,
          current_price: 0,
          price_change_percentage_24h: 0,
          chainName: dydxChain.chainName,
          chainType: 'dydx' as const,
          chainId: dydxChainId,
          address: 'USDC',
          decimals: 6,
          isNative: false,
          blockExplorerUrl: dydxChain.blockExplorerUrl,
        });
      }
      if (resp.subaccount.assetBalances) {
        for (const ab of resp.subaccount.assetBalances) {
          if (ab.symbol === 'USDC') continue;

          const symbol = ab.symbol;
          const balance = parseFloat(ab.totalBalance || '0');
          if (balance <= 0) continue;

          const registryAsset = getAssetBySymbol(dydxChainId, symbol);
          const globalMeta = !registryAsset ? getGlobalAssetMetadata(symbol) : undefined;

          assets.push({
            id: `dydx-${symbol}`,
            symbol,
            name: registryAsset?.name || symbol,
            image:
              registryAsset?.logoURI ||
              globalMeta?.logoURI ||
              `https://ui-avatars.com/api/?name=${symbol}&background=random`,
            balance,
            current_price: 0,
            price_change_percentage_24h: 0,
            chainName: dydxChain.chainName,
            chainType: 'dydx' as const,
            chainId: dydxChainId,
            address: ab.assetId?.toString(),
            decimals: registryAsset?.decimals || 18,
            isNative: symbol === 'DYDX',
            blockExplorerUrl: dydxChain.blockExplorerUrl,
          });
        }
      }

      return assets;
    } catch (error) {
      console.error('[DydxPortfolioProvider] Failed to fetch dYdX portfolio:', error);
      throw error;
    }
  }
}
