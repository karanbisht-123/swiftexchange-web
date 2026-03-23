import type { LocalWallet } from '@dydxprotocol/v4-client-js';

class SessionVault {
  private wallet: LocalWallet | null = null;

  store(wallet: LocalWallet): void {
    this.wallet = wallet;
  }

  get(): LocalWallet | null {
    return this.wallet;
  }

  clear(): void {
    this.wallet = null;
  }

  has(): boolean {
    return this.wallet !== null;
  }
}

export const sessionVault = new SessionVault();
