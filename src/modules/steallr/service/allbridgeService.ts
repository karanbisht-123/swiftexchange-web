import {
  AllbridgeCoreSdk,
  ChainSymbol,
  FeePaymentMethod,
  Messenger,
  nodeRpcUrlsDefault,
} from '@allbridge/bridge-core-sdk';

const SOROBAN_RPC = 'https://rpc.ankr.com/stellar_soroban';

export const STELLAR_NETWORK_PASSPHRASE: Record<'mainnet' | 'testnet', string> = {
  mainnet: 'Public Global Stellar Network ; October 2015',
  testnet: 'Test SDF Network ; September 2015',
};

const HORIZON_URLS: Record<'mainnet' | 'testnet', string> = {
  mainnet: 'https://horizon.stellar.org',
  testnet: 'https://horizon-testnet.stellar.org',
};

let sdkInstance: AllbridgeCoreSdk | null = null;

export const getAllbridgeSdk = (): AllbridgeCoreSdk => {
  if (!sdkInstance) {
    console.log('[Allbridge] Creating SDK instance', {
      sorobanRpc: SOROBAN_RPC,
      defaultRpcs: nodeRpcUrlsDefault,
      overrides: { [ChainSymbol.SRB]: SOROBAN_RPC },
    });
    sdkInstance = new AllbridgeCoreSdk({
      ...nodeRpcUrlsDefault,
      [ChainSymbol.SRB]: SOROBAN_RPC,
    });
    console.log('[Allbridge] SDK instance created');
  }
  return sdkInstance;
};

export const resetAllbridgeSdk = (): void => {
  console.log('[Allbridge] Resetting SDK singleton (network env change)');
  sdkInstance = null;
};

export const getSupportedTokens = async (): Promise<any[]> => {
  console.log('[Allbridge] Fetching supported tokens from Allbridge API...');
  const tokens = await getAllbridgeSdk().tokens();
  console.log('[Allbridge] Supported tokens received:', {
    totalCount: tokens.length,
    chains: [...new Set(tokens.map((t: any) => t.chainSymbol))],
    stellarTokens: tokens.filter((t: any) => t.chainSymbol === ChainSymbol.SRB),
  });
  return tokens;
};

const USDC_ISSUER: Record<'mainnet' | 'testnet', string> = {
  mainnet: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  testnet: 'GAHPYWLK6YRN7CVYZOO4H3VDRZ7PVF5UJGLZCSPAEIKJE2XSWF5LAGER',
};

export const getStellarUsdcBalance = async (
  address: string,
  networkEnv: 'mainnet' | 'testnet'
): Promise<string> => {
  if (!address) return '0';
  const horizonUrl = `${HORIZON_URLS[networkEnv]}/accounts/${address}`;
  console.log('[Allbridge] Fetching Stellar USDC balance', {
    address,
    networkEnv,
    horizonUrl,
    expectedIssuer: USDC_ISSUER[networkEnv],
  });
  try {
    const res = await fetch(horizonUrl);
    if (!res.ok) {
      console.warn('[Allbridge] Horizon account fetch failed', { status: res.status, address });
      return '0';
    }
    const data = await res.json();
    const issuer = USDC_ISSUER[networkEnv];
    const b = (data.balances as any[]).find(
      b =>
        (b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12') &&
        b.asset_code === 'USDC' &&
        b.asset_issuer === issuer
    );
    const balance = b ? b.balance : '0';
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
  console.log('[Allbridge] Fetching gas fee options', {
    sourceChain: sourceToken?.chainSymbol,
    sourceSymbol: sourceToken?.symbol,
    destinationChain: destinationToken?.chainSymbol,
    destinationSymbol: destinationToken?.symbol,
    messenger,
  });
  try {
    const sdk = getAllbridgeSdk();
    const result = await sdk.getGasFeeOptions(sourceToken, destinationToken, messenger);
    const r = result as any;

    const native: { int: string; float: string } = r?.native ?? { int: '0', float: '0' };
    const stablecoin: { int: string; float: string } | null = r?.stablecoin ?? null;

    console.log('[Allbridge] Gas fee options received', {
      native,
      stablecoin,
      stablecoinAvailable: stablecoin !== null,
      rawSdkResponse: result,
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
  console.log('[Allbridge] Getting average transfer time', {
    sourceChain: sourceToken?.chainSymbol,
    destinationChain: destinationToken?.chainSymbol,
    messenger,
  });
  try {
    const sdk = getAllbridgeSdk();
    const ms = (sdk as any).getAverageTransferTime(sourceToken, destinationToken, messenger);
    console.log('[Allbridge] Transfer time result', {
      ms,
      seconds: ms ? Math.round(ms / 1000) : null,
      minutes: ms ? Math.round(ms / 60_000) : null,
    });
    return typeof ms === 'number' && ms > 0 ? ms : 0;
  } catch (err) {
    console.warn('[Allbridge] getAverageTransferTime failed:', err);
    return 0;
  }
};

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
  console.log('[Allbridge] Fetching bridge quote', {
    amount,
    sourceChain: sourceToken?.chainSymbol,
    sourceToken: sourceToken?.symbol,
    sourceTokenAddress: sourceToken?.tokenAddress,
    destinationChain: destinationToken?.chainSymbol,
    destinationToken: destinationToken?.symbol,
    destinationTokenAddress: destinationToken?.tokenAddress,
    messenger,
  });

  const sdk = getAllbridgeSdk();
  console.log('[Allbridge] SDK instance ready for quote');

  const transferTimeMs = getTransferTimeMs(sourceToken, destinationToken, messenger);
  console.log('[Allbridge] Transfer time calculated:', transferTimeMs);

  console.log('[Allbridge] Calling sdk.getAmountToBeReceived and getFeeOptions...');
  const [amountToBeReceived, feeOptions] = await Promise.all([
    sdk.getAmountToBeReceived(amount, sourceToken, destinationToken)
      .then(res => { console.log('[Allbridge] sdk.getAmountToBeReceived success:', res); return res; })
      .catch(err => { console.error('[Allbridge] sdk.getAmountToBeReceived failed:', err); throw err; }),
    getFeeOptions(sourceToken, destinationToken, messenger)
      .then(res => { console.log('[Allbridge] getFeeOptions success:', res); return res; })
      .catch(err => { console.error('[Allbridge] getFeeOptions failed:', err); throw err; }),
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
  console.log('[Allbridge]  Bridge quote result', {
    inputAmount: amount,
    outputAmount: result.amountToBeReceived,
    exchangeRate: result.exchangeRate,
    transferTimeMs: result.transferTimeMs,
    nativeFeeFloat: feeOptions.native.float,
    stablecoinFeeFloat: feeOptions.stablecoin?.float ?? 'N/A (unavailable)',
  });

  return result;
};

export interface PrepareTransferRequest {
  amount: string;
  sourceToken: any;
  destinationToken: any;
  fromAccountAddress: string;
  toAccountAddress: string;
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
  messenger = Messenger.ALLBRIDGE,
  feePaymentMethod = FeePaymentMethod.WITH_NATIVE_CURRENCY,
}: PrepareTransferRequest): Promise<string> => {
  console.log('[Allbridge]Building raw Stellar XDR transaction', {
    amount,
    fromAccountAddress,
    toAccountAddress,
    sourceChain: sourceToken?.chainSymbol,
    sourceToken: sourceToken?.symbol,
    sourceTokenAddress: sourceToken?.tokenAddress,
    destinationChain: destinationToken?.chainSymbol,
    destinationToken: destinationToken?.symbol,
    destinationTokenAddress: destinationToken?.tokenAddress,
    messenger,
    feePaymentMethod,
    sorobanRpc: SOROBAN_RPC,
  });

  const rawTx = await (getAllbridgeSdk().bridge.rawTxBuilder as any).send({
    amount,
    fromAccountAddress,
    toAccountAddress,
    sourceToken,
    destinationToken,
    messenger,
    feePaymentMethod,
  });

  console.log('[Allbridge] Raw XDR built successfully', {
    xdrLength: typeof rawTx === 'string' ? rawTx.length : 'N/A',
    xdrPreview: typeof rawTx === 'string' ? `${rawTx.slice(0, 60)}…` : rawTx,
    signingMethod: 'stellar_signAndSubmitXDR via wallet provider',
  });

  return rawTx as string;
};
