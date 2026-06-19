import {
  AllbridgeCoreSdk,
  ChainSymbol,
  FeePaymentMethod,
  Messenger,
  nodeRpcUrlsDefault,
} from '@allbridge/bridge-core-sdk';

import { Networks, Transaction, rpc } from '@stellar/stellar-sdk';

const SOROBAN_RPCS = [
  'https://rpc.lightsail.network',
  'https://soroban-rpc.mainnet.stellar.gateway.fm',
  'https://rpc.ankr.com/stellar_soroban',
];

export const STELLAR_NETWORK_PASSPHRASE: Record<'mainnet' | 'testnet', string> = {
  mainnet: Networks.PUBLIC,
  testnet: Networks.TESTNET,
};

const HORIZON_URLS: Record<'mainnet' | 'testnet', string> = {
  mainnet: 'https://horizon.stellar.org',
  testnet: 'https://horizon-testnet.stellar.org',
};

const USDC_ISSUER: Record<'mainnet' | 'testnet', string> = {
  mainnet: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  testnet: 'GAHPYWLK6YRN7CVYZOO4H3VDRZ7PVF5UJGLZCSPAEIKJE2XSWF5LAGER',
};


const withRpcFallback = async <T>(
  fn: (rpcUrl: string) => Promise<T>
): Promise<T> => {
  let lastError: unknown;

  for (const rpcUrl of SOROBAN_RPCS) {
    try {
      console.log('[Allbridge] Trying RPC', rpcUrl);
      return await fn(rpcUrl);
    } catch (error) {
      lastError = error;

      console.warn('[Allbridge] RPC failed', {
        rpcUrl,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  throw lastError;
};

let sdkInstance: AllbridgeCoreSdk | null = null;


export const getAllbridgeSdk = (): AllbridgeCoreSdk => {
  if (!sdkInstance) {
    console.log('[Allbridge] Creating SDK instance', {
      sorobanRpc: SOROBAN_RPCS[0],
      overrides: { [ChainSymbol.SRB]: SOROBAN_RPCS[0] },
    });

    sdkInstance = new AllbridgeCoreSdk({
      ...nodeRpcUrlsDefault,
      [ChainSymbol.SRB]: SOROBAN_RPCS[0],
    });

    console.log('[Allbridge] SDK instance created');
  }

  return sdkInstance;
};

export const resetAllbridgeSdk = (): void => {
  console.log('[Allbridge] Resetting SDK singleton (network env change)');
  sdkInstance = null;
};

const mapChainSymbolToAllbridge = (symbol: string): ChainSymbol | string => {
  if (symbol === 'BASE') return ChainSymbol.BAS;
  if (symbol === 'BNB') return ChainSymbol.BSC;
  if (symbol === 'AVAX') return ChainSymbol.AVA;
  return symbol;
};

const mapChainSymbolFromAllbridge = (symbol: string): string => {
  if (symbol === ChainSymbol.BAS) return 'BASE';
  if (symbol === ChainSymbol.BSC) return 'BNB';
  if (symbol === ChainSymbol.AVA) return 'AVAX';
  return symbol;
};

const mapTokenToAllbridge = (token: any): any => {
  if (!token) return token;
  const mappedSymbol = mapChainSymbolToAllbridge(token.chainSymbol);
  if (mappedSymbol !== token.chainSymbol) {
    return { ...token, chainSymbol: mappedSymbol };
  }
  return token;
};

export const getSupportedTokens = async (): Promise<any[]> => {
  console.log('[Allbridge] Fetching supported tokens...');
  const tokens = await getAllbridgeSdk().tokens();
  const mappedTokens = tokens.map((t: any) => {
    const mappedSymbol = mapChainSymbolFromAllbridge(t.chainSymbol);
    if (mappedSymbol !== t.chainSymbol) {
      return { ...t, chainSymbol: mappedSymbol };
    }
    return t;
  });
  console.log('[Allbridge] Supported tokens received', {
    totalCount: mappedTokens.length,
    chains: [...new Set(mappedTokens.map((t: any) => t.chainSymbol))],
    stellarTokens: mappedTokens.filter((t: any) => t.chainSymbol === ChainSymbol.SRB),
  });
  return mappedTokens;
};

export const getStellarUsdcBalance = async (
  address: string,
  networkEnv: 'mainnet' | 'testnet'
): Promise<string> => {
  if (!address) return '0';
  const horizonUrl = `${HORIZON_URLS[networkEnv]}/accounts/${address}`;
  console.log('[Allbridge] Fetching Stellar USDC balance', { address, networkEnv });
  try {
    const res = await fetch(horizonUrl);
    if (!res.ok) {
      console.warn('[Allbridge] Horizon account fetch failed', { status: res.status, address });
      return '0';
    }

    const data = await res.json();
    const issuer = USDC_ISSUER[networkEnv];
    const matched = (data.balances as any[]).find(
      (b) =>
        (b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12') &&
        b.asset_code === 'USDC' &&
        b.asset_issuer === issuer
    );

    const balance = matched?.balance ?? '0';
    console.log('[Allbridge] Stellar USDC balance result', {
      address,
      balance,
      allBalances: data.balances?.map((b: any) => ({
        asset:
          b.asset_type === 'native' ? 'XLM' : `${b.asset_code}:${b.asset_issuer?.slice(0, 8)}…`,
        balance: b.balance,
      })),
    });
    return balance;
  } catch (err) {
    console.error('[Allbridge] getStellarUsdcBalance error:', err);
    return '0';
  }
};

export interface FeeOptions {
  native: { int: string; float: string };
  stablecoin: { int: string; float: string } | null;
}

export const getFeeOptions = async (
  sourceToken: any,
  destinationToken: any,
  messenger: Messenger = Messenger.ALLBRIDGE
): Promise<FeeOptions> => {
  const mappedSourceToken = mapTokenToAllbridge(sourceToken);
  const mappedDestinationToken = mapTokenToAllbridge(destinationToken);

  console.log('[Allbridge] Fetching gas fee options', {
    sourceChain: mappedSourceToken?.chainSymbol,
    sourceSymbol: mappedSourceToken?.symbol,
    destinationChain: mappedDestinationToken?.chainSymbol,
    destinationSymbol: mappedDestinationToken?.symbol,
    messenger,
  });

  try {
    const result = await getAllbridgeSdk().getGasFeeOptions(mappedSourceToken, mappedDestinationToken, messenger);
    const r = result as any;
    const native: { int: string; float: string } = r?.native ?? { int: '0', float: '0' };
    const stablecoin: { int: string; float: string } | null = r?.stablecoin ?? null;

    console.log('[Allbridge] Gas fee options received', {
      native,
      stablecoin,
      stablecoinAvailable: stablecoin !== null,
    });

    return { native, stablecoin };
  } catch (err) {
    console.warn('[Allbridge] getFeeOptions failed, returning zero fees:', err);
    return { native: { int: '0', float: '0' }, stablecoin: null };
  }
};

export const getTransferTimeMs = (
  sourceToken: any,
  destinationToken: any,
  messenger: Messenger = Messenger.ALLBRIDGE
): number => {
  const mappedSourceToken = mapTokenToAllbridge(sourceToken);
  const mappedDestinationToken = mapTokenToAllbridge(destinationToken);

  console.log('[Allbridge] Getting average transfer time', {
    sourceChain: mappedSourceToken?.chainSymbol,
    destinationChain: mappedDestinationToken?.chainSymbol,
    messenger,
  });

  try {
    const ms = (getAllbridgeSdk() as any).getAverageTransferTime(mappedSourceToken, mappedDestinationToken, messenger);
    console.log('[Allbridge] Transfer time result', {
      ms,
      seconds: ms ? Math.round(ms / 1_000) : null,
      minutes: ms ? Math.round(ms / 60_000) : null,
    });
    return typeof ms === 'number' && ms > 0 ? ms : 0;
  } catch (err) {
    console.warn('[Allbridge] getAverageTransferTime failed:', err);
    return 0;
  }
};

// Quote 
export type FeePayType = 'native' | 'stablecoin';

export interface QuoteRequest {
  amount: string;
  sourceToken: any;
  destinationToken: any;
  messenger?: Messenger;
  slippageTolerance?: number;
}

export interface QuoteResult {
  amountToBeReceived: string;
  exchangeRate: string;
  transferTimeMs: number;
  feeOptions: FeeOptions;
  sourceToken: any;
  destinationToken: any;
  messenger: Messenger;
}

export const getBridgeQuote = async ({
  amount,
  sourceToken,
  destinationToken,
  messenger = Messenger.ALLBRIDGE,
}: QuoteRequest): Promise<QuoteResult> => {
  const mappedSourceToken = mapTokenToAllbridge(sourceToken);
  const mappedDestinationToken = mapTokenToAllbridge(destinationToken);

  console.log('[Allbridge] Fetching bridge quote', {
    amount,
    sourceChain: mappedSourceToken?.chainSymbol,
    sourceToken: mappedSourceToken?.symbol,
    destinationChain: mappedDestinationToken?.chainSymbol,
    destinationToken: mappedDestinationToken?.symbol,
    messenger,
  });

  const sdk = getAllbridgeSdk();
  const transferTimeMs = getTransferTimeMs(mappedSourceToken, mappedDestinationToken, messenger);

  const [amountToBeReceived, feeOptions] = await Promise.all([
    sdk
      .getAmountToBeReceived(amount, mappedSourceToken, mappedDestinationToken)
      .then((res) => { console.log('[Allbridge] getAmountToBeReceived success:', res); return res; })
      .catch((err) => { console.error('[Allbridge] getAmountToBeReceived failed:', err); throw err; }),
    getFeeOptions(mappedSourceToken, mappedDestinationToken, messenger),
  ]);

  const inputNum = parseFloat(amount);
  const outputNum = parseFloat(String(amountToBeReceived));
  const exchangeRate =
    inputNum > 0 && outputNum > 0 ? (outputNum / inputNum).toFixed(6) : '1.000000';

  const result: QuoteResult = {
    amountToBeReceived: String(amountToBeReceived),
    exchangeRate,
    transferTimeMs,
    feeOptions,
    sourceToken,
    destinationToken,
    messenger,
  };

  console.log('[Allbridge] Bridge quote result', {
    inputAmount: amount,
    outputAmount: result.amountToBeReceived,
    exchangeRate: result.exchangeRate,
    transferTimeMs: result.transferTimeMs,
    nativeFeeFloat: feeOptions.native.float,
    stablecoinFeeFloat: feeOptions.stablecoin?.float ?? 'N/A',
  });

  return result;
};


export interface PrepareTransferRequest {
  amount: string;
  sourceToken: any;
  destinationToken: any;
  fromAccountAddress: string;
  toAccountAddress: string;
  network: 'mainnet' | 'testnet';
  messenger?: Messenger;
  feePaymentMethod?: FeePaymentMethod;
  slippageTolerance?: number;
}


export const prepareStellarToEvmRawTransaction = async ({
  amount,
  sourceToken,
  destinationToken,
  fromAccountAddress,
  toAccountAddress,
  network,
  messenger = Messenger.ALLBRIDGE,
  feePaymentMethod = FeePaymentMethod.WITH_NATIVE_CURRENCY,
}: PrepareTransferRequest): Promise<string> => {
  const mappedSourceToken = mapTokenToAllbridge(sourceToken);
  const mappedDestinationToken = mapTokenToAllbridge(destinationToken);

  console.log('[Allbridge] Building raw Stellar XDR transaction', {
    amount,
    fromAccountAddress,
    toAccountAddress,
    network,
    sourceChain: mappedSourceToken?.chainSymbol,
    destinationChain: mappedDestinationToken?.chainSymbol,
    messenger,
    feePaymentMethod,
  });

  const rawXdr = (await (getAllbridgeSdk().bridge.rawTxBuilder as any).send({
    amount,
    fromAccountAddress,
    toAccountAddress,
    sourceToken: mappedSourceToken,
    destinationToken: mappedDestinationToken,
    messenger,
    gasFeePaymentMethod: feePaymentMethod,
  })) as string;

  console.log('[Allbridge] Raw XDR built, length:', rawXdr.length);

  const networkPassphrase = STELLAR_NETWORK_PASSPHRASE[network];

  const finalXdr = await withRpcFallback(async (rpcUrl) => {
    console.log('[Allbridge] Simulating transaction via RPC:', rpcUrl);

    const tx = new Transaction(rawXdr, networkPassphrase);
    const server = new rpc.Server(rpcUrl);
    const sim = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(sim)) {
      throw new SimulationError(`Soroban simulation failed: ${sim.error}`);
    }

    console.log('[Allbridge] Assembling simulated transaction...');
    const assembled = rpc.assembleTransaction(tx, sim).build();
    return assembled.toXDR();
  });

  console.log('[Allbridge] Assembled XDR ready', {
    originalLength: rawXdr.length,
    finalLength: finalXdr.length,
  });

  return finalXdr;
};


export const getBridgeStatus = async (hash: string): Promise<any> => {
  return getAllbridgeSdk().getTransferStatus(ChainSymbol.SRB, hash);
};


export class SimulationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimulationError';
  }
}