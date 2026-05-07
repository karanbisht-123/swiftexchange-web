import { type Asset } from '../store/portfolioStore';

export interface PortfolioFetchParams {
  connectedWallets: Record<string, { address: string; dydxAddress?: string } | undefined>;
  network: string;
}

export interface IPortfolioProvider {
  /** Unique identifier for the provider (e.g., 'evm', 'stellar') */
  id: string;

  /** 
   * Fetches the portfolio data for the given wallets and network.
   * Returns a list of standardized Asset objects.
   */
  fetch(params: PortfolioFetchParams): Promise<Asset[]>;
}
