import {
  AllbridgeCoreSdk,
  ChainSymbol,
  FeePaymentMethod,
  Messenger,
  nodeRpcUrlsDefault,
} from '@allbridge/bridge-core-sdk';
import { Networks, Transaction, rpc } from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// try these in order, first one that works wins
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

// runs fn against each RPC url until one succeeds, throws the last error if all fail
const withRpcFallback = async <T>(fn: (rpcUrl: string) => Promise<T>): Promise<T> => {
  let lastError: unknown;

  for (const rpcUrl of SOROBAN_RPCS) {
    try {
      return await fn(rpcUrl);
    } catch (error) {
      lastError = error;
      console.warn(
        '[Allbridge] RPC failed',
        rpcUrl,
        error instanceof Error ? error.message : error
      );
    }
  }

  throw lastError;
};

// ---------------------------------------------------------------------------
// SDK singleton
// ---------------------------------------------------------------------------

let sdkInstance: AllbridgeCoreSdk | null = null;

export const getAllbridgeSdk = (): AllbridgeCoreSdk => {
  if (!sdkInstance) {
    sdkInstance = new AllbridgeCoreSdk({
      ...nodeRpcUrlsDefault,
      [ChainSymbol.SRB]: SOROBAN_RPCS[0],
    });
  }
  return sdkInstance;
};

// call this if the network env (mainnet/testnet) changes, forces a fresh SDK next time
export const resetAllbridgeSdk = (): void => {
  sdkInstance = null;
};

// ---------------------------------------------------------------------------
// chain symbol mapping
// Allbridge uses its own short codes for some chains, we use our own names in the app
// ---------------------------------------------------------------------------

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
  return mappedSymbol !== token.chainSymbol ? { ...token, chainSymbol: mappedSymbol } : token;
};

// ---------------------------------------------------------------------------
// tokens & balances
// ---------------------------------------------------------------------------

export const getSupportedTokens = async (): Promise<any[]> => {
  const tokens = await getAllbridgeSdk().tokens();

  return tokens.map((t: any) => {
    const mappedSymbol = mapChainSymbolFromAllbridge(t.chainSymbol);
    return mappedSymbol !== t.chainSymbol ? { ...t, chainSymbol: mappedSymbol } : t;
  });
};

// Stellar balances aren't part of the SDK, so we hit Horizon directly
export const getStellarUsdcBalance = async (
  address: string,
  networkEnv: 'mainnet' | 'testnet'
): Promise<string> => {
  if (!address) return '0';

  try {
    const res = await fetch(`${HORIZON_URLS[networkEnv]}/accounts/${address}`);
    if (!res.ok) {
      console.warn('[Allbridge] Horizon account fetch failed', res.status, address);
      return '0';
    }

    const data = await res.json();
    const issuer = USDC_ISSUER[networkEnv];

    const usdcLine = (data.balances as any[]).find(
      b =>
        (b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12') &&
        b.asset_code === 'USDC' &&
        b.asset_issuer === issuer
    );

    return usdcLine?.balance ?? '0';
  } catch (err) {
    console.error('[Allbridge] getStellarUsdcBalance error:', err);
    return '0';
  }
};

// ---------------------------------------------------------------------------
// fees & transfer time
// ---------------------------------------------------------------------------

export interface FeeOptions {
  native: { int: string; float: string };
  stablecoin: { int: string; float: string } | null;
}

export const getFeeOptions = async (
  sourceToken: any,
  destinationToken: any,
  messenger: Messenger = Messenger.ALLBRIDGE
): Promise<FeeOptions> => {
  const source = mapTokenToAllbridge(sourceToken);
  const destination = mapTokenToAllbridge(destinationToken);

  try {
    const result = (await getAllbridgeSdk().getGasFeeOptions(
      source,
      destination,
      messenger
    )) as any;

    return {
      native: result?.native ?? { int: '0', float: '0' },
      stablecoin: result?.stablecoin ?? null,
    };
  } catch (err) {
    // don't block a quote just because fee lookup failed, fall back to zero
    console.warn('[Allbridge] getFeeOptions failed, returning zero fees:', err);
    return { native: { int: '0', float: '0' }, stablecoin: null };
  }
};

export const getTransferTimeMs = (
  sourceToken: any,
  destinationToken: any,
  messenger: Messenger = Messenger.ALLBRIDGE
): number => {
  const source = mapTokenToAllbridge(sourceToken);
  const destination = mapTokenToAllbridge(destinationToken);

  try {
    const ms = (getAllbridgeSdk() as any).getAverageTransferTime(source, destination, messenger);
    return typeof ms === 'number' && ms > 0 ? ms : 0;
  } catch (err) {
    console.warn('[Allbridge] getAverageTransferTime failed:', err);
    return 0;
  }
};

// ---------------------------------------------------------------------------
// quote
// ---------------------------------------------------------------------------

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
  const source = mapTokenToAllbridge(sourceToken);
  const destination = mapTokenToAllbridge(destinationToken);

  const sdk = getAllbridgeSdk();
  const transferTimeMs = getTransferTimeMs(source, destination, messenger);

  const [amountToBeReceived, feeOptions] = await Promise.all([
    sdk.getAmountToBeReceived(amount, source, destination),
    getFeeOptions(source, destination, messenger),
  ]);

  const inputNum = parseFloat(amount);
  const outputNum = parseFloat(String(amountToBeReceived));
  const exchangeRate =
    inputNum > 0 && outputNum > 0 ? (outputNum / inputNum).toFixed(6) : '1.000000';

  return {
    amountToBeReceived: String(amountToBeReceived),
    exchangeRate,
    transferTimeMs,
    feeOptions,
    sourceToken,
    destinationToken,
    messenger,
  };
};

// ---------------------------------------------------------------------------
// build + submit-ready transaction (Stellar -> EVM)
// ---------------------------------------------------------------------------

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

export class SimulationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimulationError';
  }
}

// step 1: ask the SDK for the raw, unsimulated XDR for this send
const buildRawSendXdr = async ({
  amount,
  sourceToken,
  destinationToken,
  fromAccountAddress,
  toAccountAddress,
  messenger = Messenger.ALLBRIDGE,
  feePaymentMethod = FeePaymentMethod.WITH_NATIVE_CURRENCY,
}: PrepareTransferRequest): Promise<string> => {
  const source = mapTokenToAllbridge(sourceToken);
  const destination = mapTokenToAllbridge(destinationToken);

  return (await (getAllbridgeSdk().bridge.rawTxBuilder as any).send({
    amount,
    fromAccountAddress,
    toAccountAddress,
    sourceToken: source,
    destinationToken: destination,
    messenger,
    gasFeePaymentMethod: feePaymentMethod,
  })) as string;
};

// step 2: simulate against a live RPC so the resource fee + footprint are correct,
// then assemble the final XDR that's safe to sign and submit
const simulateAndAssemble = async (
  rawXdr: string,
  network: 'mainnet' | 'testnet'
): Promise<string> => {
  const passphrase = STELLAR_NETWORK_PASSPHRASE[network];

  return withRpcFallback(async rpcUrl => {
    const tx = new Transaction(rawXdr, passphrase);
    const server = new rpc.Server(rpcUrl);
    const sim = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(sim)) {
      throw new SimulationError(`Soroban simulation failed: ${sim.error}`);
    }

    return rpc.assembleTransaction(tx, sim).build().toXDR();
  });
};

// NOTE: we always simulate before returning the XDR. skipping this and just
// patching the fee (like some quick scripts do) risks a stale footprint /
// wrong resource fee if chain state moved since the tx was built.
export const prepareStellarToEvmRawTransaction = async (
  params: PrepareTransferRequest
): Promise<string> => {
  const rawXdr = await buildRawSendXdr(params);
  return simulateAndAssemble(rawXdr, params.network);
};

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

export const getBridgeStatus = async (hash: string): Promise<any> => {
  return getAllbridgeSdk().getTransferStatus(ChainSymbol.SRB, hash);
};
