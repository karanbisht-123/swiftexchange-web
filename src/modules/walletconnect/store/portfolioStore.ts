import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { persist, createJSONStorage } from 'zustand/middleware';
import { portfolioService } from '../portfolio/PortfolioService';
import { portfolioUtils } from '../utils/portfolioUtils';

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  image: string;
  balance: number | null;
  current_price: number;
  price_change_percentage_24h: number;
  chainName: string;
  chainId?: number | string;
  chainType?: 'evm' | 'stellar' | 'dydx';
  isNative?: boolean;
  address?: string;
  decimals?: number;
  blockExplorerUrl?: string;
}

export interface ProviderStatus {
  status: 'idle' | 'loading' | 'success' | 'error';
  lastUpdated: number;
  error?: string;
}

interface PortfolioState {
  assets: Asset[];
  isLoading: boolean;
  lastFetched: number;
  network: string;
  isFetching: boolean;
  hasError: boolean;
  errorMessage: string | null;
  providerStatus: Record<string, ProviderStatus>;
  lastConnectedWalletsStr: string;
}

interface PortfolioActions {
  fetchAssets: (
    connectedWallets: Record<string, { address: string; dydxAddress?: string } | undefined>,
    network: string,
    force?: boolean
  ) => Promise<void>;
  refreshAssets: (
    connectedWallets: Record<string, { address: string; dydxAddress?: string } | undefined>,
    network: string
  ) => Promise<void>;
  updateAsset: (asset: Asset) => void;
  getAssetBalance: (chainId: number | string, symbol: string) => number;
  clearAssets: () => void;
  clearAssetsByType: (chainType: 'evm' | 'stellar' | 'dydx') => void;
  enrichPrices: () => Promise<void>;
}


const CACHE_TTL = 60_000;
let enrichInFlight = false;

export const usePortfolioStore = create<PortfolioState & PortfolioActions>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        assets: [],
        isLoading: false,
        lastFetched: 0,
        network: 'mainnet',
        isFetching: false,
        hasError: false,
        errorMessage: null,
        providerStatus: {},
        lastConnectedWalletsStr: '',

        updateAsset: (newAsset: Asset) => {
          set((state) => {
            const index = state.assets.findIndex((a) => a.id === newAsset.id);
            const nextAssets = [...state.assets];
            if (index >= 0) {
              nextAssets[index] = { ...nextAssets[index], ...newAsset };
            } else {
              nextAssets.push(newAsset);
            }
            return {
              assets: nextAssets.sort((a, b) => {
                const valA = (a.balance || 0) * (a.current_price || 0);
                const valB = (b.balance || 0) * (b.current_price || 0);
                return valB - valA;
              }),
            };
          });
        },

        getAssetBalance: (chainId: number | string, symbol: string) => {
          const asset = get().assets.find(
            (a) => a.chainId === chainId && a.symbol.toUpperCase() === symbol.toUpperCase()
          );
          return asset?.balance || 0;
        },

        clearAssets: () => {
          set({ assets: [], lastFetched: 0 });
          try {
            usePortfolioStore.persist?.clearStorage();
          } catch {
            /* ignore */
          }
        },

        clearAssetsByType: (chainType: 'evm' | 'stellar' | 'dydx') => {
          set((state) => ({
            assets: state.assets.filter((a) => a.chainType !== chainType),
            lastFetched: 0,
            providerStatus: {
              ...state.providerStatus,
              [chainType]: { status: 'idle', lastUpdated: 0 }
            }
          }));
        },

        fetchAssets: async (
          connectedWallets: Record<string, { address: string; dydxAddress?: string } | undefined>,
          network: string,
          force: boolean = false
        ) => {
          const state = get();
          const now = Date.now();

          if (state.isFetching) return;

          const currentWalletsStr = JSON.stringify(connectedWallets);
          const walletsChanged = state.lastConnectedWalletsStr !== currentWalletsStr;

          const isRecentlyFetched = (now - state.lastFetched) < CACHE_TTL;
          const isNetworkSame = state.network === network;
          const hasData = state.assets.length > 0;

          if (!force && !walletsChanged && isRecentlyFetched && isNetworkSame && hasData) {
            return;
          }

          const providersToFetch = portfolioService.getProviders().filter(p => {
            if (p.id === 'evm') return !!connectedWallets.evm?.address;
            if (p.id === 'stellar') return !!connectedWallets.stellar?.address;
            if (p.id === 'dydx') return !!(connectedWallets.evm?.dydxAddress || connectedWallets.cosmos?.dydxAddress);
            return true;
          });

          if (providersToFetch.length === 0) return;

          set({
            isLoading: state.assets.length === 0,
            isFetching: true,
            network,
            hasError: false,
            errorMessage: null,
            lastConnectedWalletsStr: currentWalletsStr,
            providerStatus: providersToFetch.reduce((acc, p) => ({
              ...acc,
              [p.id]: { status: 'loading', lastUpdated: Date.now() }
            }), state.providerStatus)
          });

          const updateStateWithAssets = (newAssets: Asset[], chainType: string) => {
            set((s) => {
              const otherAssets = s.assets.filter(a => a.chainType !== chainType);

              const combined = [...otherAssets, ...newAssets];
              const sorted = combined.sort((a, b) => {
                const valA = (a.balance || 0) * (a.current_price || 0);
                const valB = (b.balance || 0) * (b.current_price || 0);
                return valB - valA;
              });

              return { assets: sorted };
            });
          };

          let completedCount = 0;
          const fetchPromises = providersToFetch.map(async (p) => {
            try {
              const assets = await p.fetch({ connectedWallets, network });

              updateStateWithAssets(assets, p.id);

              set(s => ({
                providerStatus: {
                  ...s.providerStatus,
                  [p.id]: { status: 'success', lastUpdated: Date.now() }
                }
              }));
            } catch (e) {
              console.error(`[PortfolioStore] Provider ${p.id} failed`, e);
              set(s => ({
                providerStatus: {
                  ...s.providerStatus,
                  [p.id]: { status: 'error', lastUpdated: Date.now(), error: String(e) }
                }
              }));
            } finally {
              completedCount++;
              if (completedCount === providersToFetch.length) {
                const finalState = get();
                const anyError = Object.values(finalState.providerStatus).some(ps => ps.status === 'error');

                set({
                  isFetching: false,
                  isLoading: false,
                  lastFetched: Date.now(),
                  hasError: Object.values(finalState.providerStatus).every(ps => ps.status === 'error'),
                  errorMessage: anyError ? 'Some portfolio data could not be synced' : null
                });

                if (!enrichInFlight && get().assets.some(a => (a.balance || 0) > 0)) {
                  enrichInFlight = true;
                  get().enrichPrices().finally(() => {
                    enrichInFlight = false;
                  });
                }
              }
            }
          });

          await Promise.all(fetchPromises);
        },

        refreshAssets: async (
          connectedWallets: Record<string, { address: string; dydxAddress?: string } | undefined>,
          network: string
        ) => {
          await get().fetchAssets(connectedWallets, network, true);
        },

        enrichPrices: async () => {
          const { assets } = get();
          const needsPrice = assets.filter(
            (a) => a.current_price === 0 && (a.balance || 0) > 0
          );
          if (needsPrice.length === 0) return;

          try {
            const symbols = needsPrice.map((a) => a.symbol);
            const priceData = await portfolioUtils.fetchBatchPrices(symbols);

            set((s) => {
              const updatedAssets = s.assets.map((asset) => {
                const newData = priceData[asset.symbol.toUpperCase()];
                if (asset.current_price === 0 && newData) {
                  return {
                    ...asset,
                    current_price: newData.usd,
                    price_change_percentage_24h: newData.usd_24h_change || 0,
                  };
                }
                return asset;
              });

              return {
                assets: updatedAssets.sort((a, b) => {
                  const valA = (a.balance || 0) * (a.current_price || 0);
                  const valB = (b.balance || 0) * (b.current_price || 0);
                  return valB - valA;
                }),
              };
            });
          } catch (err) {
            console.warn('[PortfolioStore] Price enrichment failed:', err);
          }
        },
      }),
      {
        name: 'portfolio-storage',
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          assets: state.assets,
          lastFetched: state.lastFetched,
          network: state.network,
        }),
      }
    )
  )
);


export const selectTotalValue = (state: PortfolioState) =>
  portfolioUtils.calculateTotalUSD(state.assets);

export const selectAssetsByChain = (chainId: number | string) => (state: PortfolioState) =>
  state.assets.filter((a) => a.chainId === chainId);

export const selectEvmAssets = (state: PortfolioState) =>
  state.assets.filter((a) => a.chainType === 'evm');

export const selectStellarAssets = (state: PortfolioState) =>
  state.assets.filter((a) => a.chainType === 'stellar');

export const selectPortfolioAssets = (state: PortfolioState) =>
  state.assets.filter((a) => (a.balance || 0) > 0);
