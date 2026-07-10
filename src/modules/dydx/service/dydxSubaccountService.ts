import { LocalWallet, SubaccountInfo } from '@dydxprotocol/v4-client-js';
import { Long } from '@dydxprotocol/v4-proto/src/codegen/helpers';

import { walletService } from '../../walletconnect/services/walletService';
import { type MarginMode, SUBACCOUNT_CONSTANTS, type TransferResult } from '../types/trading.types';
import { dydxWalletService } from './dydxWalletService';

interface SubaccountBalanceCache {
  equity: number;
  availableBalance: number;
  marginUsed: number;
  timestamp: number;
}

const BALANCE_CACHE_TTL = 10_000;
const MIN_SWEEP_THRESHOLD = 0.01;
const MAINTENANCE_MARGIN_SAFETY_FACTOR = 1.1;
const USDC_QUANTUM_FACTOR = 1e6;

class DydxSubaccountService {
  private balanceCache: SubaccountBalanceCache | null = null;

  async fetchSubaccountBalance(
    address: string,
    subaccountNumber: number
  ): Promise<SubaccountBalanceCache> {
    const now = Date.now();
    if (this.balanceCache && now - this.balanceCache.timestamp < BALANCE_CACHE_TTL) {
      return this.balanceCache;
    }

    const indexerClient = dydxWalletService.getIndexerClient();
    const subaccountResp = await indexerClient.account
      .getSubaccount(address, subaccountNumber)
      .catch(() => ({ subaccount: null }));

    const equity = parseFloat(subaccountResp.subaccount?.equity || '0');
    const freeCollateral = parseFloat(subaccountResp.subaccount?.freeCollateral || '0');
    const marginUsed = Math.max(0, equity - freeCollateral);

    this.balanceCache = { equity, availableBalance: freeCollateral, marginUsed, timestamp: now };
    return this.balanceCache;
  }

  invalidateBalanceCache(): void {
    this.balanceCache = null;
  }

  async transfer(
    fromSubaccount: number,
    toSubaccount: number,
    amount: string
  ): Promise<TransferResult> {
    try {
      const client = await dydxWalletService.getCompositeClient();
      const address = dydxWalletService.getAddress();

      if (!client || !address) {
        throw new Error('Wallet not connected');
      }

      const localWallet = await this.getSigningWallet();
      const amountInQuantums = Math.floor(parseFloat(amount) * USDC_QUANTUM_FACTOR);

      if (amountInQuantums <= 0) {
        throw new Error('Transfer amount must be greater than 0');
      }
      const senderSubaccount = SubaccountInfo.forLocalWallet(localWallet, fromSubaccount);

      const result = await client.validatorClient.post.transfer(
        senderSubaccount,
        address,
        toSubaccount,
        0,
        Long.fromString(amountInQuantums.toString())
      );
      const txHash = this.extractHash(result.hash);

      return {
        success: true,
        transactionHash: txHash,
        fromSubaccount,
        toSubaccount,
        amount,
      };
    } catch (error: any) {
      console.error('[dydxSubaccountService] Transfer failed:', error);
      return {
        success: false,
        error: error.message || 'Transfer failed',
        fromSubaccount,
        toSubaccount,
        amount,
      };
    }
  }

  getNextIsolatedSubaccount(
    market: string,
    childSubaccounts: Array<{
      subaccountNumber: number;
      openPerpetualPositions: Record<string, any>;
    }>
  ): number {
    const existingSubaccount = childSubaccounts.find(child => {
      const markets = Object.keys(child.openPerpetualPositions || {});
      return (
        markets.includes(market) && child.subaccountNumber >= SUBACCOUNT_CONSTANTS.ISOLATED_START
      );
    });

    if (existingSubaccount) {
      return existingSubaccount.subaccountNumber;
    }

    const emptySubaccount = childSubaccounts.find(child => {
      const isIsolated = child.subaccountNumber >= SUBACCOUNT_CONSTANTS.ISOLATED_START;
      const hasPositions = Object.keys(child.openPerpetualPositions || {}).length > 0;

      return isIsolated && !hasPositions;
    });

    if (emptySubaccount) {
      return emptySubaccount.subaccountNumber;
    }

    const usedNumbers = new Set(
      childSubaccounts
        .map(c => c.subaccountNumber)
        .filter(n => n >= SUBACCOUNT_CONSTANTS.ISOLATED_START)
    );

    let nextNumber = SUBACCOUNT_CONSTANTS.ISOLATED_START;
    while (usedNumbers.has(nextNumber)) {
      nextNumber++;
    }

    return nextNumber;
  }

  validateIsolatedEquity(
    subaccountNumber: number,
    childSubaccounts: Array<{
      subaccountNumber: number;
      equity: string;
    }>
  ): { isValid: boolean; equity: number; required: number } {
    const subaccount = childSubaccounts.find(c => c.subaccountNumber === subaccountNumber);
    const equity = subaccount ? parseFloat(subaccount.equity) : 0;
    const required = SUBACCOUNT_CONSTANTS.MIN_ISOLATED_EQUITY;

    return {
      isValid: equity >= required,
      equity,
      required,
    };
  }

  calculateRequiredCollateral(size: number, oraclePrice: number, leverage: number): number {
    const notionalValue = size * oraclePrice;
    const initialMargin = notionalValue / leverage;
    const withBuffer = initialMargin * 1.02;
    return withBuffer;
  }

  getMarginMode(subaccountNumber: number): MarginMode {
    return subaccountNumber >= SUBACCOUNT_CONSTANTS.ISOLATED_START ? 'ISOLATED' : 'CROSS';
  }

  isValidSubaccount(subaccountNumber: number): boolean {
    return subaccountNumber >= 0 && subaccountNumber <= SUBACCOUNT_CONSTANTS.ISOLATED_END;
  }

  async sweepToCross(
    childSubaccounts: Array<{
      subaccountNumber: number;
      freeCollateral: string;
      openPerpetualPositions: Record<string, any>;
    }>
  ): Promise<{ success: boolean; swept: number; errors: string[] }> {
    const errors: string[] = [];
    let sweptTotal = 0;
    const sweepable = childSubaccounts.filter(child => {
      const hasNoPositions = Object.keys(child.openPerpetualPositions || {}).length === 0;
      const hasFreeCollateral = parseFloat(child.freeCollateral) > MIN_SWEEP_THRESHOLD;
      const isIsolated = child.subaccountNumber >= SUBACCOUNT_CONSTANTS.ISOLATED_START;
      return isIsolated && hasNoPositions && hasFreeCollateral;
    });

    for (const child of sweepable) {
      const result = await this.transfer(
        child.subaccountNumber,
        SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT,
        child.freeCollateral
      );

      if (result.success) {
        sweptTotal += parseFloat(child.freeCollateral);
      } else {
        errors.push(`Subaccount ${child.subaccountNumber}: ${result.error}`);
      }
    }

    return {
      success: errors.length === 0,
      swept: sweptTotal,
      errors,
    };
  }

  async sweepSubaccountToCross(
    subaccountNumber: number
  ): Promise<{ success: boolean; swept: number; error?: string }> {
    try {
      const indexerClient = dydxWalletService.getIndexerClient();
      const address = dydxWalletService.getAddress();

      if (!address) throw new Error('Wallet not connected');

      let equity = 0;
      let freeCollateral = 0;
      let hasPositions = false;

      try {
        const subaccountResponse = await indexerClient.account.getSubaccount(
          address,
          subaccountNumber
        );
        equity = parseFloat(subaccountResponse.subaccount?.equity || '0');
        freeCollateral = parseFloat(subaccountResponse.subaccount?.freeCollateral || '0');
        const positions = subaccountResponse.subaccount?.openPerpetualPositions || {};
        hasPositions = Object.keys(positions).length > 0;
      } catch {
        return { success: true, swept: 0 };
      }

      if (hasPositions) {
        return { success: false, swept: 0, error: 'Subaccount still has open positions' };
      }

      if (equity <= MIN_SWEEP_THRESHOLD) {
        return { success: true, swept: 0 };
      }

      const sweepAmount = freeCollateral > MIN_SWEEP_THRESHOLD ? freeCollateral : equity;
      if (sweepAmount <= MIN_SWEEP_THRESHOLD) {
        return { success: true, swept: 0 };
      }

      const result = await this.transfer(
        subaccountNumber,
        SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT,
        sweepAmount.toFixed(6)
      );

      if (result.success) {
        return { success: true, swept: sweepAmount };
      }

      return { success: false, swept: 0, error: result.error };
    } catch (error: any) {
      console.error('[dydxSubaccountService] sweepSubaccountToCross failed:', error);
      return { success: false, swept: 0, error: error.message };
    }
  }

  async ensureIsolatedEquity(
    targetSubaccount: number,
    requiredAmount: number
  ): Promise<{ success: boolean; transferredAmount: number; error?: string }> {
    try {
      const indexerClient = dydxWalletService.getIndexerClient();
      const address = dydxWalletService.getAddress();

      if (!address) throw new Error('Wallet not connected');

      const [currentEquityResult, crossCollateralResult] = await Promise.allSettled([
        (async () => {
          try {
            const subaccountResponse = await indexerClient.account.getSubaccount(
              address,
              targetSubaccount
            );
            return parseFloat(subaccountResponse.subaccount?.equity || '0');
          } catch {
            return 0;
          }
        })(),
        (async () => {
          const crossSubResponse = await indexerClient.account.getSubaccount(
            address,
            SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT
          );
          return parseFloat(crossSubResponse.subaccount?.freeCollateral || '0');
        })(),
      ]);

      const currentEquity =
        currentEquityResult.status === 'fulfilled' ? currentEquityResult.value : 0;

      if (currentEquity >= requiredAmount) {
        return { success: true, transferredAmount: 0 };
      }

      const shortfall = requiredAmount - currentEquity;
      if (shortfall <= 0.01) {
        return { success: true, transferredAmount: 0 };
      }

      if (crossCollateralResult.status === 'rejected') {
        return {
          success: false,
          transferredAmount: 0,
          error: `Failed to verify cross margin balance: ${crossCollateralResult.reason?.message}`,
        };
      }

      const crossFreeCollateral = crossCollateralResult.value;

      if (crossFreeCollateral < shortfall) {
        return {
          success: false,
          transferredAmount: 0,
          error: `Insufficient free collateral in Cross Margin. Need $${shortfall.toFixed(2)}, available $${crossFreeCollateral.toFixed(2)}`,
        };
      }

      const transferResult = await this.transfer(
        SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT,
        targetSubaccount,
        shortfall.toFixed(6)
      );

      if (transferResult.success) {
        return { success: true, transferredAmount: shortfall };
      } else {
        return { success: false, transferredAmount: 0, error: transferResult.error };
      }
    } catch (error: any) {
      console.error('[dydxSubaccountService] Auto-deposit failed:', error);
      return { success: false, transferredAmount: 0, error: error.message };
    }
  }

  getEligibleSourceSubaccounts(
    excludeId: number,
    childSubaccounts: Array<{
      subaccountNumber: number;
      equity: string;
      openPerpetualPositions?: Record<string, any>;
    }>,
    positions: any[],
    marketCache: Record<string, any>
  ): Array<{ value: number; label: string; available: number; equity: number }> {
    const eligible: Array<{ value: number; label: string; available: number; equity: number }> = [];

    childSubaccounts.forEach(sub => {
      const subNumber = sub.subaccountNumber;
      if (subNumber === excludeId || subNumber < SUBACCOUNT_CONSTANTS.ISOLATED_START) return;

      const equity = parseFloat(sub.equity || '0');
      if (equity <= 0) return;

      const subPositions = positions.filter(p => p.subaccountNumber === subNumber);
      if (subPositions.length === 0) return;

      let totalMinRequired = 0;
      subPositions.forEach(p => {
        const mktData = marketCache[p.market];
        const oraclePrice = mktData ? parseFloat(mktData.oraclePrice) : parseFloat(p.entryPrice);
        const mmf = mktData?.maintenanceMarginFraction
          ? parseFloat(mktData.maintenanceMarginFraction)
          : 0.03;
        const size = Math.abs(parseFloat(p.size));
        const notional = size * oraclePrice;
        totalMinRequired += notional * mmf * MAINTENANCE_MARGIN_SAFETY_FACTOR;
      });

      const transferable = Math.max(0, equity - totalMinRequired);

      if (transferable > 0) {
        eligible.push({
          value: subNumber,
          label: `Isolated: ${subPositions[0].market} (${subNumber})`,
          available: transferable,
          equity,
        });
      }
    });

    return eligible.sort((a, b) => b.available - a.available);
  }

  async transferMarginBetweenSubaccounts(
    fromSubaccount: number,
    toSubaccount: number,
    amount: string
  ): Promise<TransferResult> {
    try {
      if (fromSubaccount === 0 || toSubaccount === 0) {
        return await this.transfer(fromSubaccount, toSubaccount, amount);
      }

      const directResult = await this.transfer(fromSubaccount, toSubaccount, amount);

      if (directResult.success) {
        return directResult;
      }

      console.warn(
        '[dydxSubaccountService] Direct isolated transfer failed, attempting 2-hop routing',
        directResult.error
      );

      const toCrossResult = await this.transfer(fromSubaccount, 0, amount);
      if (!toCrossResult.success) {
        return toCrossResult;
      }

      const toDestResult = await this.transfer(0, toSubaccount, amount);
      if (!toDestResult.success) {
        return {
          ...toDestResult,
          error: `Partial transfer failure: Funds moved to Cross but failed to reach destination. ${toDestResult.error}`,
        };
      }

      return {
        success: true,
        transactionHash: toDestResult.transactionHash,
        fromSubaccount,
        toSubaccount,
        amount,
      };
    } catch (error: any) {
      console.error('[dydxSubaccountService] transferMarginBetweenSubaccounts failed:', error);
      return {
        success: false,
        error: error.message || 'Transfer failed',
        fromSubaccount,
        toSubaccount,
        amount,
      };
    }
  }

  private getSigningWallet(): LocalWallet {
    const evmSession = walletService.getSession('evm');
    if (!evmSession?.evmAddress) {
      throw new Error('EVM wallet not connected');
    }

    const wallet = walletService.getSigningWallet();
    if (!wallet) {
      throw new Error('Signing wallet not available - please derive dYdX wallet first');
    }

    return wallet;
  }

  private extractHash(hash: any): string {
    if (typeof hash === 'string') return hash;

    const data = hash?.data || hash;
    if (Array.isArray(data) || data instanceof Uint8Array) {
      return Array.from(data)
        .map((b: any) => b.toString(16).padStart(2, '0'))
        .join('');
    }

    return 'unknown';
  }
}

export const dydxSubaccountService = new DydxSubaccountService();
