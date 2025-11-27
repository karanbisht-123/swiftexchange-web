import { COSMOS_CHAINS_MAINNET, COSMOS_CHAINS_TESTNET } from '../../walletconnect/config/chains';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';

export interface DydxConfig {
  apiUrl: string;
  indexerWs: string;
  chainId: string;
  network: 'mainnet' | 'testnet';
  validatorUrl: string;
  rpc: string;
  rest: string;
}

export const getDydxConfig = (network: 'mainnet' | 'testnet'): DydxConfig => {
  const chains = network === 'mainnet' ? COSMOS_CHAINS_MAINNET : COSMOS_CHAINS_TESTNET;
  const dydxChain = chains.find(chain => chain.chainId.includes('dydx'));

  if (!dydxChain) {
    throw new Error(`dYdX chain configuration not found for ${network}`);
  }

  const indexerConfig = {
    mainnet: {
      apiUrl: 'https://indexer.dydx.trade',
      indexerWs: 'wss://indexer.dydx.trade/v4/ws',
      // apiUrl: 'https://indexer.v4testnet.dydx.exchange',
      // indexerWs: 'wss://indexer.v4testnet.dydx.exchange/v4/ws',
    },
    testnet: {
      apiUrl: 'https://indexer.v4testnet.dydx.exchange',
      indexerWs: 'wss://indexer.v4testnet.dydx.exchange/v4/ws',
    },
  };

  const config = indexerConfig[network];

  return {
    apiUrl: config.apiUrl,
    indexerWs: config.indexerWs,
    chainId: dydxChain.chainId,
    network,
    validatorUrl: dydxChain.rpc,
    rpc: dydxChain.rpc,
    rest: dydxChain.rest,
  };
};

export const useDydxConfig = (): DydxConfig => {
  const network = useWalletStore(state => state.network);
  return getDydxConfig(network);
};
