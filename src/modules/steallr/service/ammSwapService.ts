import * as StellarSDK from 'stellar-sdk';

import { NETWORK_CONFIGS } from '../../../config';
import { isStellarNetwork } from '../../../utils/transactionUtils';
import type {
  LiquidityPool,
  // AmmSwapTransaction,
  SwapOptions,
  SwapPath,
  SwapQuote,
  TokenInfo,
} from '../types/ammSwap.types';

export class AmmSwapService {
  private server: StellarSDK.Horizon.Server;
  private networkPassphrase: string;
  private networkKey: string;

  constructor(networkKey: string) {
    const config = NETWORK_CONFIGS.stellar;
    console.log(config, 'hii iam config ');
    if (!config || !isStellarNetwork(config)) {
      throw new Error(`Unsupported Stellar network: ${networkKey}`);
    }

    this.server = new StellarSDK.Horizon.Server(config.horizonUrl);
    this.networkPassphrase =
      networkKey === 'stellarMainnet' ? StellarSDK.Networks.PUBLIC : StellarSDK.Networks.TESTNET;
    this.networkKey = networkKey;
  }

  async getTokenBalances(address: string): Promise<TokenInfo[]> {
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
      return [];
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

      const response = await poolsCall.call();

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
          fee: record.fee_bp / 100,
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
    feeBps: number = 30
  ): { outputAmount: string; priceImpact: number } {
    const input = parseFloat(inputAmount);
    const reserveIn = parseFloat(inputReserve);
    const reserveOut = parseFloat(outputReserve);

    const feeMultiplier = 1 - feeBps / 10000;
    const inputWithFee = input * feeMultiplier;

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
    const paths = await this.findBestPath(fromAsset, toAsset, amount, options.maxHops || 3);

    if (paths.length === 0) {
      throw new Error('No swap path found');
    }

    const bestPath = paths[0];
    const minOutput = options.slippageTolerance
      ? (parseFloat(bestPath.estimatedOutput) * (1 - options.slippageTolerance / 100)).toFixed(7)
      : bestPath.estimatedOutput;

    return {
      fromAsset,
      toAsset,
      inputAmount: amount,
      estimatedOutput: bestPath.estimatedOutput,
      minimumOutput: minOutput,
      path: bestPath,
      alternativePaths: paths.slice(1, 4),
      priceImpact: bestPath.priceImpact,
      slippageTolerance: options.slippageTolerance || 1,
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

    const sourceAccount = await this.server.loadAccount(fromAddress);
    const txBuilder = new StellarSDK.TransactionBuilder(sourceAccount, {
      fee: options.fee || StellarSDK.BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    });
    if (quote.path.hops > 1) {
      const path = quote.path.path.slice(1, -1);

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
    } else {
      txBuilder.addOperation(
        StellarSDK.Operation.pathPaymentStrictSend({
          sendAsset: quote.fromAsset,
          sendAmount: quote.inputAmount,
          destination: fromAddress,
          destAsset: quote.toAsset,
          destMin: quote.minimumOutput,
          path: [],
        })
      );
    }

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
      sequence: sourceAccount.sequenceNumber(),
      fee: options.fee || StellarSDK.BASE_FEE,
      memo: options.memo,
      timestamp: Date.now(),
      status: 'pending',
      xdr,
      networkKey: this.networkKey,
    };
  }

  async executeSwap(transaction: any, privateKey: string): Promise<string> {
    if (!privateKey.startsWith('S') || privateKey.length !== 56) {
      throw new Error('Invalid Stellar private key format');
    }

    try {
      const sourceKeypair = StellarSDK.Keypair.fromSecret(privateKey);
      const tx = new StellarSDK.Transaction(transaction.xdr, this.networkPassphrase);

      tx.sign(sourceKeypair);
      const response = await this.server.submitTransaction(tx);

      return response.hash;
    } catch (error) {
      console.error('Failed to execute swap:', error);
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

  getPopularAssets(): StellarSDK.Asset[] {
    const popular = [StellarSDK.Asset.native()];
    if (this.networkKey === 'stellarMainnet') {
      popular.push(
        new StellarSDK.Asset('USDC', 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'),
        new StellarSDK.Asset('AQUA', 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA'),
        new StellarSDK.Asset('yXLM', 'GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55')
      );
    }

    return popular;
  }
}
