import { dydxSubaccountService } from './dydxSubaccountService';
import { dydxWalletService } from './dydxWalletService';

class DydxRecoveryService {
  private hasRun = false;

  async init() {
    if (this.hasRun) return;
    this.hasRun = true;

    // Give wallet time to fully connect and state to settle
    setTimeout(() => this.recoverStrandedCapital(), 3000);
  }

  private async recoverStrandedCapital() {
    try {
      if (!dydxWalletService.isConnected()) {
        return;
      }

      const address = dydxWalletService.getAddress();
      if (!address) return;

      const indexer = dydxWalletService.getIndexerClient();

      // Get all subaccounts for this address
      const response = await indexer.account.getSubaccounts(address);
      const subaccounts = Array.isArray(response) ? response : (response as any).subaccounts || [];

      let recoveredAmount = 0;

      for (const sub of subaccounts) {
        // We only care about isolated subaccounts (>= 128)
        const subaccountNumber = sub.subaccountNumber;
        if (subaccountNumber < 128) continue;

        const equity = parseFloat(sub.equity || '0');

        // If there's capital stuck in here
        if (equity > 0.01) {
          const openPositions = sub.openPerpetualPositions || {};
          const hasOpenPositions = Object.keys(openPositions).length > 0;

          // If there are no open positions, this capital is stranded
          if (!hasOpenPositions) {
            console.log(
              `[dydxRecoveryService] Found stranded capital in subaccount ${subaccountNumber}. Sweeping $${equity}...`
            );
            const result = await dydxSubaccountService.sweepSubaccountToCross(subaccountNumber);
            if (result.success) {
              recoveredAmount += result.swept;
              console.log(
                `[dydxRecoveryService] Successfully recovered $${result.swept} from subaccount ${subaccountNumber}`
              );
            } else {
              console.error(
                `[dydxRecoveryService] Failed to recover from subaccount ${subaccountNumber}: ${result.error}`
              );
            }
          }
        }
      }

      if (recoveredAmount > 0) {
        console.log(
          `[dydxRecoveryService] Recovery complete. Total recovered: $${recoveredAmount.toFixed(2)}`
        );
      }
    } catch (error) {
      console.error('[dydxRecoveryService] Error running recovery:', error);
    }
  }
}

export const dydxRecoveryService = new DydxRecoveryService();
