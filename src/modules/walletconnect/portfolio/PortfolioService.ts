import { type Asset } from '../store/portfolioStore';
import { type IPortfolioProvider, type PortfolioFetchParams } from './types';
import { EVMPortfolioProvider } from './providers/EVMPortfolioProvider';
import { StellarPortfolioProvider } from './providers/StellarPortfolioProvider';
import { DydxPortfolioProvider } from './providers/DydxPortfolioProvider';


export class PortfolioService {
  private providers: IPortfolioProvider[] = [];

  constructor() {
    this.registerProvider(new EVMPortfolioProvider());
    this.registerProvider(new StellarPortfolioProvider());
    this.registerProvider(new DydxPortfolioProvider());
  }

  public registerProvider(provider: IPortfolioProvider): void {
    const exists = this.providers.find((p) => p.id === provider.id);
    if (!exists) {
      this.providers.push(provider);
    }
  }

  public getProviders(): IPortfolioProvider[] {
    return this.providers;
  }

  public async fetchAll(params: PortfolioFetchParams): Promise<Asset[]> {
    const fetchTasks = this.providers.map(async (provider) => {
      try {
        return await provider.fetch(params);
      } catch (error) {
        return [];
      }
    });

    const results = await Promise.all(fetchTasks);
    const flattened = results.flat();

    const mergedMap = new Map<string, Asset>();
    flattened.forEach((asset) => {
      mergedMap.set(asset.id, asset);
    });

    return Array.from(mergedMap.values());
  }
}
export const portfolioService = new PortfolioService();
