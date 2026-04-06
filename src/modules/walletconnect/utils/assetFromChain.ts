import type { CosmosChainConfig, EVMChainConfig, StellarChainConfig } from '../config/chains';
import { WalletType } from '../constants/Wallet';

const LOGO_CDN = 'https://coin-images.coingecko.com/coins/images';

const LOGO_MAP: Record<string, string> = {
  ETH: `${LOGO_CDN}/279/large/ethereum.png`,
  MATIC: `${LOGO_CDN}/4713/large/matic-token-icon.png`,
  BNB: `${LOGO_CDN}/825/large/bnb-icon2_2x.png`,
  AVAX: `${LOGO_CDN}/1672/large/avalanche-avax-logo.png`,

  ATOM: `${LOGO_CDN}/4/large/cosmos.png`,
  OSMO: `${LOGO_CDN}/167/large/osmosis.png`,
  DYDX: `${LOGO_CDN}/16170/large/dydx.png`,

  XLM: `${LOGO_CDN}/100/large/fmpFRHHQ_400x400.jpg`,
};

export type ReceiveAsset = {
  value: string;
  label: string;
  symbol: string;
  logo: string;
  network: string;
  chainId: string | number;
  addressType: 'evm' | 'cosmos' | 'stellar';
  walletType: WalletType;
};

export const assetFromEVM = (c: EVMChainConfig): ReceiveAsset => ({
  value: c.nativeCurrency.symbol,
  label: `${c.name} (${c.nativeCurrency.symbol})`,
  symbol: c.nativeCurrency.symbol,
  logo: LOGO_MAP[c.nativeCurrency.symbol] ?? '',
  network: c.name,
  chainId: c.chainId,
  addressType: 'evm',
  walletType: WalletType.EVM,
});

export const assetFromCosmos = (c: CosmosChainConfig): ReceiveAsset => {
  const primary = c.currencies[0];
  return {
    value: primary.coinDenom,
    label: `${c.chainName} (${primary.coinDenom})`,
    symbol: primary.coinDenom,
    logo: LOGO_MAP[primary.coinDenom] ?? '',
    network: c.chainName,
    chainId: c.chainId,
    addressType: 'cosmos',
    walletType: WalletType.COSMOS,
  };
};

export const assetFromStellar = (c: StellarChainConfig): ReceiveAsset => ({
  value: 'XLM',
  label: 'Stellar (XLM)',
  symbol: 'XLM',
  logo: LOGO_MAP.XLM,
  network: c.network === 'PUBLIC' ? 'Stellar Mainnet' : 'Stellar Testnet',
  chainId: 'stellar:' + (c.network === 'PUBLIC' ? 'pubnet' : 'testnet'),
  addressType: 'stellar',
  walletType: WalletType.STELLAR,
});
