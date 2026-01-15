import { BECH32_PREFIX, LocalWallet } from '@dydxprotocol/v4-client-js';

import { walletService } from '../../walletconnect/services/walletService';
import { type MarginMode, SUBACCOUNT_CONSTANTS, type TransferResult } from '../types/trading.types';
import { dydxWalletService } from './dydxWalletService';

class DydxSubaccountService {
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
      const amountInQuantums = Math.floor(parseFloat(amount) * 1e6);

      if (amountInQuantums <= 0) {
        throw new Error('Transfer amount must be greater than 0');
      }
      const senderSubaccount = {
        address,
        subaccountNumber: fromSubaccount,
        signingWallet: localWallet,
      };

      console.log(senderSubaccount, '-------------------------');

      console.log('[dydxSubaccountService] Initiating transfer:', {
        from: fromSubaccount,
        to: toSubaccount,
        amount,
        quantums: amountInQuantums,
      });

      const result = await client.transferToSubaccount(
        senderSubaccount as any,
        // "dydx1xkyyg323a8pl0wr5hetk692xavz2he2s6ntxln",
        address,
        toSubaccount,
        amountInQuantums.toString()
      );

      //    const result = await client.transferToSubaccount(
      //     senderSubaccount as any,
      //     "dydx1xkyyg323a8pl0wr5hetk692xavz2he2s6ntxln",
      //     "128",
      //     amountInQuantums.toString()
      // );
      const txHash = this.extractHash(result.hash);

      console.log('[dydxSubaccountService] Transfer successful:', txHash);

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
      console.log(
        `[dydxSubaccountService] Reusing empty isolated subaccount: ${emptySubaccount.subaccountNumber}`
      );
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

  calculateRequiredCollateral(
    size: number,        // Position size (S)
    oraclePrice: number, // Oracle Price (P)
    leverage: number     // Desired Leverage (L)
  ): number {
    // Formula: IM = (S × P) / L
    const notionalValue = size * oraclePrice;
    const initialMargin = notionalValue / leverage;
    // Add 5% buffer for price movement
    const withBuffer = initialMargin * 1.05;
    console.log('[dydxSubaccountService] Collateral calculation:', {
      size,
      oraclePrice,
      leverage,
      notionalValue,
      initialMargin,
      withBuffer,
    });
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
      const hasFreeCollateral = parseFloat(child.freeCollateral) > 0.01;
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

  async ensureIsolatedEquity(
    targetSubaccount: number,
    requiredAmount: number
  ): Promise<{ success: boolean; transferredAmount: number; error?: string }> {
    try {
      const indexerClient = dydxWalletService.getIndexerClient();
      const address = dydxWalletService.getAddress();

      if (!address) throw new Error('Wallet not connected');

      let currentEquity = 0;
      try {
        const subaccountResponse = await indexerClient.account.getSubaccount(
          address,
          targetSubaccount
        );
        currentEquity = parseFloat(subaccountResponse.subaccount?.equity || '0');
      } catch (err: any) {
        console.log('[dydxSubaccountService] Subaccount lookup failed (likely new):', err.message);
        currentEquity = 0;
      }

      if (currentEquity >= requiredAmount) {
        return { success: true, transferredAmount: 0 };
      }

      const shortfall = requiredAmount - currentEquity;
      console.log('[dydxSubaccountService] Isolated equity shortfall calculation:', {
        targetSubaccount,
        requiredAmount,
        currentEquity,
        shortfall,
      });

      // Skip transfer if shortfall is negligible (less than $0.01)
      if (shortfall <= 0.01) {
        console.log('[dydxSubaccountService] Shortfall negligible, skipping transfer');
        return { success: true, transferredAmount: 0 };
      }

      let crossFreeCollateral = 0;
      try {
        const crossSubResponse = await indexerClient.account.getSubaccount(
          address,
          SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT
        );
        crossFreeCollateral = parseFloat(crossSubResponse.subaccount?.freeCollateral || '0');

        console.log('[dydxSubaccountService] Cross margin check:', {
          crossFreeCollateral,
          shortfall,
          hasEnough: crossFreeCollateral >= shortfall,
        });

        if (crossFreeCollateral < shortfall) {
          return {
            success: false,
            transferredAmount: 0,
            error: `Insufficient free collateral in Cross Margin. Need $${shortfall.toFixed(2)}, available $${crossFreeCollateral.toFixed(2)}`,
          };
        }
      } catch (err: any) {
        console.error('[dydxSubaccountService] Failed to check cross margin balance:', err.message);
        return {
          success: false,
          transferredAmount: 0,
          error: `Failed to verify cross margin balance: ${err.message}`,
        };
      }

      // Transfer the shortfall amount
      console.log('[dydxSubaccountService] Initiating transfer:', {
        from: SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT,
        to: targetSubaccount,
        amount: shortfall.toFixed(6),
      });

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

  private async getSigningWallet(): Promise<LocalWallet> {
    const evmSession = walletService.getSession('evm');
    if (!evmSession?.evmAddress) {
      throw new Error('EVM wallet not connected');
    }

    const mnemonic =
      walletService.getMnemonic(evmSession.evmAddress) ||
      (await walletService.restoreMnemonicFromStorage());

    if (!mnemonic) {
      throw new Error('Mnemonic not found - please reconnect wallet');
    }

    return await LocalWallet.fromMnemonic(mnemonic, BECH32_PREFIX);
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
