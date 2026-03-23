import * as StellarSDK from '@stellar/stellar-sdk';

import type {
  LiquidityPool,
  SwapOptions,
  SwapPath,
  SwapQuote,
  TokenInfo,
} from '../types/ammSwap.types';

export class AmmSwapService {
  private server: StellarSDK.Horizon.Server;
  private networkPassphrase: string;
  private networkKey: string;

  constructor(horizonUrl: string, networkPassphrase: string, networkKey: string) {
    console.log('AMM Swap Service Init:', { horizonUrl, networkPassphrase, networkKey });
    const serverOptions: any = {};
    if (horizonUrl.startsWith('http://')) {
      serverOptions.allowHttp = true;
    }

    this.server = new StellarSDK.Horizon.Server(horizonUrl, serverOptions);
    this.networkPassphrase = networkPassphrase;
    this.networkKey = networkKey;
  }

  async getTokenBalances(address: string): Promise<TokenInfo[]> {
    if (!StellarSDK.StrKey.isValidEd25519PublicKey(address)) {
      throw new Error('Invalid Stellar address');
    }

    try {
      const account = await this.server.loadAccount(address);
      const tokens: TokenInfo[] = [];

      for (const balance of account.balances) {
        if (balance.asset_type === 'native') {
          tokens.push({
            asset: StellarSDK.Asset.native(),
            code: 'XLM',
            balance: balance.balance,
            isPopular: true,
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
          });
        }
      }

      return tokens;
    } catch (error) {
      console.error('Failed to fetch token balances:', error);
      throw new Error('Failed to load account balances');
    }
  }

  async findLiquidityPools(
    assetA: StellarSDK.Asset,
    assetB?: StellarSDK.Asset
  ): Promise<LiquidityPool[]> {
    try {
      const pools: LiquidityPool[] = [];
      let poolsCall = this.server.liquidityPools();

      if (assetB) {
        poolsCall = poolsCall.forAssets(assetA, assetB);
      }

      const response = await poolsCall.limit(200).call();

      for (const record of response.records) {
        const reserves = record.reserves.map((r: any) => ({
          asset:
            r.asset === 'native'
              ? StellarSDK.Asset.native()
              : new StellarSDK.Asset(r.asset.split(':')[0], r.asset.split(':')[1]),
          amount: r.amount,
        }));

        pools.push({
          id: record.id,
          totalShares: record.total_shares,
          reserves,
          fee: record.fee_bp / 10000,
        });
      }

      return pools;
    } catch (error) {
      console.error('Failed to fetch liquidity pools:', error);
      return [];
    }
  }

  private calculateSwapOutput(
    inputAmount: string,
    inputReserve: string,
    outputReserve: string,
    feeRate: number = 0.0003
  ): { outputAmount: string; priceImpact: number } {
    const input = parseFloat(inputAmount);
    const reserveIn = parseFloat(inputReserve);
    const reserveOut = parseFloat(outputReserve);

    if (isNaN(input) || isNaN(reserveIn) || isNaN(reserveOut) || input <= 0) {
      throw new Error('Invalid input parameters for swap calculation');
    }

    const inputWithFee = input * (1 - feeRate);

    const outputAmount = (inputWithFee * reserveOut) / (reserveIn + inputWithFee);

    const spotPrice = reserveOut / reserveIn;
    const effectivePrice = outputAmount / input;
    const priceImpact = ((spotPrice - effectivePrice) / spotPrice) * 100;

    return {
      outputAmount: outputAmount.toFixed(7),
      priceImpact: Math.abs(priceImpact),
    };
  }

  async findBestPath(
    fromAsset: StellarSDK.Asset,
    toAsset: StellarSDK.Asset,
    amount: string,
    maxHops: number = 3
  ): Promise<SwapPath[]> {
    const paths: SwapPath[] = [];

    const directPools = await this.findLiquidityPools(fromAsset, toAsset);
    for (const pool of directPools) {
      const fromReserve = pool.reserves.find(r => this.assetsEqual(r.asset, fromAsset));
      const toReserve = pool.reserves.find(r => this.assetsEqual(r.asset, toAsset));

      if (fromReserve && toReserve) {
        const { outputAmount, priceImpact } = this.calculateSwapOutput(
          amount,
          fromReserve.amount,
          toReserve.amount,
          pool.fee
        );

        paths.push({
          path: [fromAsset, toAsset],
          pools: [pool],
          estimatedOutput: outputAmount,
          priceImpact,
          hops: 1,
        });
      }
    }

    if (maxHops >= 2) {
      const xlm = StellarSDK.Asset.native();
      if (!this.assetsEqual(fromAsset, xlm) && !this.assetsEqual(toAsset, xlm)) {
        const fromToXlmPools = await this.findLiquidityPools(fromAsset, xlm);
        const xlmToToPools = await this.findLiquidityPools(xlm, toAsset);

        for (const pool1 of fromToXlmPools) {
          for (const pool2 of xlmToToPools) {
            const fromReserve = pool1.reserves.find(r => this.assetsEqual(r.asset, fromAsset));
            const xlmReserve1 = pool1.reserves.find(r => this.assetsEqual(r.asset, xlm));
            const xlmReserve2 = pool2.reserves.find(r => this.assetsEqual(r.asset, xlm));
            const toReserve = pool2.reserves.find(r => this.assetsEqual(r.asset, toAsset));

            if (fromReserve && xlmReserve1 && xlmReserve2 && toReserve) {
              const hop1 = this.calculateSwapOutput(
                amount,
                fromReserve.amount,
                xlmReserve1.amount,
                pool1.fee
              );

              const hop2 = this.calculateSwapOutput(
                hop1.outputAmount,
                xlmReserve2.amount,
                toReserve.amount,
                pool2.fee
              );

              paths.push({
                path: [fromAsset, xlm, toAsset],
                pools: [pool1, pool2],
                estimatedOutput: hop2.outputAmount,
                priceImpact: hop1.priceImpact + hop2.priceImpact,
                hops: 2,
              });
            }
          }
        }
      }
    }

    return paths.sort((a, b) => parseFloat(b.estimatedOutput) - parseFloat(a.estimatedOutput));
  }

  async getSwapQuote(
    fromAsset: StellarSDK.Asset,
    toAsset: StellarSDK.Asset,
    amount: string,
    options: SwapOptions = {}
  ): Promise<SwapQuote> {
    if (parseFloat(amount) <= 0) {
      throw new Error('Amount must be positive');
    }

    if (this.assetsEqual(fromAsset, toAsset)) {
      throw new Error('Cannot swap the same asset');
    }

    const paths = await this.findBestPath(fromAsset, toAsset, amount, options.maxHops || 3);

    if (paths.length === 0) {
      const fromCode = fromAsset.isNative() ? 'XLM' : fromAsset.code;
      const toCode = toAsset.isNative() ? 'XLM' : toAsset.code;
      throw new Error(
        `No liquidity pool found for ${fromCode}/${toCode}. Try a different token pair or check back later.`
      );
    }

    const bestPath = paths[0];
    const slippageTolerance = options.slippageTolerance || 1;
    const minOutput = (
      parseFloat(bestPath.estimatedOutput) *
      (1 - slippageTolerance / 100)
    ).toFixed(7);

    return {
      fromAsset,
      toAsset,
      inputAmount: amount,
      estimatedOutput: bestPath.estimatedOutput,
      minimumOutput: minOutput,
      path: bestPath,
      alternativePaths: paths.slice(1, 4),
      priceImpact: bestPath.priceImpact,
      slippageTolerance,
      timestamp: Date.now(),
    };
  }

  async buildSwapTransaction(
    fromAddress: string,
    quote: SwapQuote,
    options: SwapOptions = {}
  ): Promise<any> {
    if (!StellarSDK.StrKey.isValidEd25519PublicKey(fromAddress)) {
      throw new Error('Invalid sender Stellar address');
    }

    try {
      const sourceAccount = await this.server.loadAccount(fromAddress);
      const txBuilder = new StellarSDK.TransactionBuilder(sourceAccount, {
        fee: options.fee || StellarSDK.BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      });

      let path: StellarSDK.Asset[] = [];
      if (quote.path.hops > 1) {
        path = quote.path.path.slice(1, -1);
      }

      txBuilder.addOperation(
        StellarSDK.Operation.pathPaymentStrictSend({
          sendAsset: quote.fromAsset,
          sendAmount: quote.inputAmount,
          destination: fromAddress,
          destAsset: quote.toAsset,
          destMin: quote.minimumOutput,
          path,
        })
      );

      if (options.memo) {
        txBuilder.addMemo(StellarSDK.Memo.text(options.memo));
      }

      txBuilder.setTimeout(options.timeout || 300);

      const builtTransaction = txBuilder.build();
      const xdr = builtTransaction.toXDR();

      return {
        id: `swap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'swap',
        from: fromAddress,
        quote,
        sequence: sourceAccount.sequence,
        fee: options.fee || StellarSDK.BASE_FEE,
        memo: options.memo,
        timestamp: Date.now(),
        status: 'pending',
        xdr,
        networkKey: this.networkKey,
      };
    } catch (error) {
      console.error('Failed to build swap transaction:', error);
      throw new Error('Failed to build swap transaction');
    }
  }

  private isWalletConnectProvider(provider: any): boolean {
    return !!(provider.client && provider.session && typeof provider.client.request === 'function');
  }

  async executeSwapWithWalletConnect(transaction: any, walletProvider: any): Promise<string> {
    try {
      console.log('Preparing Stellar swap transaction via WalletConnect...');

      if (!transaction.xdr) {
        console.error('Missing XDR data');
        throw new Error('Stellar transaction requires XDR data');
      }

      const isMainnet = this.networkPassphrase.includes('Public Global Stellar Network');
      const network = isMainnet ? 'pubnet' : 'TESTNET';

      const signParams = {
        xdr: transaction.xdr,
        networkPassphrase: this.networkPassphrase,
        network,
      };

      console.log('Stellar swap sign params:', signParams);

      let result: any;

      if (this.isWalletConnectProvider(walletProvider)) {
        console.log('Using WalletConnect client.request() for Stellar swap');

        const topic = walletProvider.session?.topic;
        if (!topic) {
          console.error('No WalletConnect session topic found');
          throw new Error('No active WalletConnect session for Stellar wallet');
        }

        const chainCAIP = `stellar:${network}`;

        console.log('WalletConnect request params:', {
          topic,
          chainId: chainCAIP,
          method: 'stellar_signAndSubmitXDR',
        });

        result = await walletProvider.client.request({
          topic,
          chainId: chainCAIP,
          request: {
            method: 'stellar_signAndSubmitXDR',
            params: signParams,
          },
        });
      } else {
        console.log('Using direct provider.request() for Stellar swap');
        result = await walletProvider.request({
          method: 'stellar_signAndSubmitXDR',
          params: signParams,
        });
      }

      console.log('WalletConnect provider response:', result);
      if (result?.status === 'success' || result?.hash || result?.signedXDR) {
        console.log('Stellar swap transaction successful!');
        return result.hash || result.transactionHash || 'stellar_submitted';
      }

      if (typeof result === 'string') {
        console.log('Stellar swap returned string hash');
        return result;
      }

      console.error('Stellar swap failed - unexpected response:', result);
      throw new Error('Stellar transaction failed - unexpected response format');
    } catch (error: any) {
      console.error('Failed to execute swap via WalletConnect:', {
        message: error.message,
        code: error.code,
        fullError: error,
      });

      if (error?.response?.data?.extras?.result_codes) {
        const codes = error.response.data.extras.result_codes;
        throw new Error(`Swap failed: ${codes.transaction} - ${codes.operations?.join(', ')}`);
      }

      throw new Error(
        `Swap execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private assetsEqual(a: StellarSDK.Asset, b: StellarSDK.Asset): boolean {
    if (a.isNative() && b.isNative()) return true;
    if (a.isNative() || b.isNative()) return false;
    return a.code === b.code && a.issuer === b.issuer;
  }

  async checkLiquidityAvailable(
    fromAsset: StellarSDK.Asset,
    toAsset: StellarSDK.Asset
  ): Promise<boolean> {
    if (this.assetsEqual(fromAsset, toAsset)) return false;

    try {
      const directPools = await this.findLiquidityPools(fromAsset, toAsset);
      if (directPools.length > 0) return true;
      const xlm = StellarSDK.Asset.native();
      if (!this.assetsEqual(fromAsset, xlm) && !this.assetsEqual(toAsset, xlm)) {
        const fromToXlm = await this.findLiquidityPools(fromAsset, xlm);
        const xlmToTo = await this.findLiquidityPools(xlm, toAsset);
        if (fromToXlm.length > 0 && xlmToTo.length > 0) return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to check liquidity availability:', error);
      return false;
    }
  }

  getPopularAssets(): StellarSDK.Asset[] {
    const popular = [StellarSDK.Asset.native()];
    const isMainnet = this.networkPassphrase.includes('Public Global Stellar Network');

    if (isMainnet) {
      popular.push(
        new StellarSDK.Asset('USDC', 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'),
        new StellarSDK.Asset('AQUA', 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA'),
        new StellarSDK.Asset('yXLM', 'GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55')
      );
    } else {
      popular.push(
        new StellarSDK.Asset('USDC', 'GAHPYWLK6YRN7CVYZOO4H3VDRZ7PVF5UJGLZCSPAEIKJE2XSWF5LAGER'),
        new StellarSDK.Asset('USDT', 'GAHPYWLK6YRN7CVYZOO4H3VDRZ7PVF5UJGLZCSPAEIKJE2XSWF5LAGER'),
        new StellarSDK.Asset('BTC', 'GAHPYWLK6YRN7CVYZOO4H3VDRZ7PVF5UJGLZCSPAEIKJE2XSWF5LAGER'),
        new StellarSDK.Asset('ETH', 'GAHPYWLK6YRN7CVYZOO4H3VDRZ7PVF5UJGLZCSPAEIKJE2XSWF5LAGER'),
        new StellarSDK.Asset('AQUA', 'GAHPYWLK6YRN7CVYZOO4H3VDRZ7PVF5UJGLZCSPAEIKJE2XSWF5LAGER')
      );
    }

    return popular;
  }
}
