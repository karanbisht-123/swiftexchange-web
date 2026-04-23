export interface INativeToken {
  name: string;
  symbol: string;
  address: string;
  type: string;
  decimals: number;
  logoURI: string;
}

export interface IToken {
  name: string;
  asset: string;
  symbol: string;
  address: string;
  chainId: string | number;
  type: string;
  decimals: number;
  logoURI: string;
}

export type NetworkType = 'mainnet' | 'testnet';

export interface IChain {
  rpcUrl: string;
  rpcUrls: string[];
  chainId: number | string;
  nativeChainKey: string;
  minGasGwei: number;
  imageUrl: string;
  name: string;
  symbol: string;
  rangoSymbol?: string;
  chainName: string;
  subName: string;
  slug: string;
  networkType: NetworkType;

  blockExplorerUrl: string;
  gasLimit?: number;
  supportedTokenList: string | IToken[];
  nativeToken: INativeToken;
  wrappedAddress?: string;
  bridgeSupportTokens?: any;
  sendEnable: boolean;
  receiveEnable: boolean;
  bridgeEnable: boolean;
  swapEnable: boolean;
  importForSetupApp: boolean;
  importForSetupedApp: boolean;
}

export type ChainRegistry = Record<string, IChain>;
