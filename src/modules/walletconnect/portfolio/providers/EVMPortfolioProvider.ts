import { formatUnits } from 'ethers';
import { fetchApiResponseFromServer } from '../../../../service/apiService';
import { type Asset } from '../../store/portfolioStore';
import { type IPortfolioProvider, type PortfolioFetchParams } from '../types';
import {
  getChainName,
  getAssetByAddress,
  getChainNativeSymbol,
  getChainLogoUrl,
  getChainBySlug,
  type NetworkType
} from '../../../evm/utils/Chainregistry';
import { NATIVE_ADDRESS } from '../../../evm/utils/assetmanagement/constants';


interface BackendResponse {
  data: {
    tokens: BackendToken[];
  };
}

interface BackendToken {
  address: string;
  network: string;
  tokenAddress: string | null;
  tokenBalance: string;
  tokenMetadata: {
    symbol: string | null;
    decimals: number | null;
    name: string | null;
    logo: string | null;
  };
  tokenPrices: Array<{
    currency: string;
    value: string;
  }>;
}




export class EVMPortfolioProvider implements IPortfolioProvider {
  public id = 'evm';

  async fetch(params: PortfolioFetchParams): Promise<Asset[]> {
    const { connectedWallets } = params;
    const evmAddress = connectedWallets.evm?.address;

    if (!evmAddress) return [];

    try {
      const response = await fetchApiResponseFromServer<BackendResponse>(
        `/portfolio/${evmAddress}`,
        'GET'
      );

      if (!response.data?.data?.tokens) {
        console.warn('[EVMPortfolioProvider] Unexpected response format or empty data');
        return [];
      }

      const backendTokens = response.data.data.tokens;

      return backendTokens.map((token: BackendToken) => {
        const [slug, net] = token.network.split('-');
        const chain = getChainBySlug(slug, net as NetworkType);
        const chainId = chain?.chainId || 1;
        const isNative = !token.tokenAddress;

        const assetAddress = isNative ? NATIVE_ADDRESS : token.tokenAddress!;

        const registryAsset = getAssetByAddress(chainId, assetAddress);

        const decimals = token.tokenMetadata.decimals ?? registryAsset?.decimals ?? 18;
        const symbol = token.tokenMetadata.symbol ?? registryAsset?.symbol ?? (isNative ? getChainNativeSymbol(chainId) : 'TOKEN');
        const name = token.tokenMetadata.name ?? registryAsset?.name ?? (isNative ? getChainName(chainId) : 'Unknown Token');
        const logo = token.tokenMetadata.logo ?? registryAsset?.logoURI ?? getChainLogoUrl(chainId) ?? '';


        let balance = 0;
        try {
          if (token.tokenBalance && token.tokenBalance !== '0x' && token.tokenBalance !== '0x0') {
            balance = parseFloat(formatUnits(token.tokenBalance, decimals));
          }
        } catch (e) {
          console.error(`[EVMPortfolioProvider] Failed to parse balance for ${symbol}:`, e);
        }

        const price = parseFloat(token.tokenPrices[0]?.value || '0');

        return {
          id: `evm-${chainId}-${assetAddress}`,
          symbol,
          name,
          image: logo,
          balance,
          current_price: price,
          price_change_percentage_24h: 0,
          chainId,
          chainName: getChainName(chainId),
          chainType: 'evm' as const,
          address: assetAddress,
          decimals,
        };

      }).filter(asset => asset.balance > 0);
    } catch (error) {
      console.error('[EVMPortfolioProvider] Failed to fetch EVM portfolio:', error);
      return [];
    }
  }
}

