import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import * as StellarSdk from '@stellar/stellar-sdk';
import { ethers } from 'ethers';

import { ERC20_ABI, getTokenAddressesForChain } from '../../../config/tokenConfig';
import { type NetworkType, getEVMChains, getStellarConfig } from '../config/chains';
import { WalletType } from '../constants/Wallet';
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
    chainId?: number;
    chainType?: 'evm' | 'stellar';
    isNative?: boolean;
}

interface PortfolioState {
    assets: Asset[];
    isLoading: boolean;
    lastFetched: number;
    network: string;
    isFetching: boolean; // Prevent concurrent fetches
}

interface PortfolioActions {
    fetchAssets: (
        connectedWallets: Record<string, { address: string } | undefined>,
        network: string,
        force?: boolean
    ) => Promise<void>;
    refreshAssets: (
        connectedWallets: Record<string, { address: string } | undefined>,
        network: string
    ) => Promise<void>;
    updateAsset: (asset: Asset) => void;
    getAssetBalance: (chainId: number, symbol: string) => number;
    clearAssets: () => void;
    enrichPrices: () => Promise<void>;
}

// Cache TTL: 60 seconds (production-ready)
const CACHE_TTL = 60000;

// Minimum time between fetches (prevents rapid calls on tab switches)
const MIN_FETCH_INTERVAL = 5000;

export const usePortfolioStore = create<PortfolioState & PortfolioActions>()(
    subscribeWithSelector((set, get) => ({
        assets: [],
        isLoading: false,
        lastFetched: 0,
        network: 'mainnet',
        isFetching: false,

        updateAsset: (newAsset: Asset) => {
            set(state => {
                const index = state.assets.findIndex(a => a.id === newAsset.id);
                const nextAssets = [...state.assets];
                if (index >= 0) {
                    nextAssets[index] = { ...nextAssets[index], ...newAsset };
                } else {
                    nextAssets.push(newAsset);
                }
                // Sort by USD value descending
                return {
                    assets: nextAssets.sort(
                        (a, b) => (b.balance || 0) * b.current_price - (a.balance || 0) * a.current_price
                    ),
                };
            });
        },

        getAssetBalance: (chainId: number, symbol: string) => {
            const asset = get().assets.find(
                a => a.chainId === chainId && a.symbol.toUpperCase() === symbol.toUpperCase()
            );
            return asset?.balance || 0;
        },

        clearAssets: () => {
            set({ assets: [], lastFetched: 0 });
        },

        fetchAssets: async (connectedWallets, network, force = false) => {
            const state = get();
            const now = Date.now();

            // Prevent concurrent fetches
            if (state.isFetching) {
                console.log('[PortfolioStore] Already fetching, skipping');
                return;
            }

            // Skip if data is fresh (within TTL) and not forced
            if (!force && now - state.lastFetched < CACHE_TTL && state.network === network) {
                console.log('[PortfolioStore] Using cached data, age:', now - state.lastFetched, 'ms');
                return;
            }

            // Prevent rapid fetches (min interval check)
            if (!force && now - state.lastFetched < MIN_FETCH_INTERVAL) {
                console.log('[PortfolioStore] Too soon since last fetch, skipping');
                return;
            }

            console.log('[PortfolioStore] Fetching portfolio data...');
            set({ isLoading: true, isFetching: true, network });

            const evmAddr = connectedWallets[WalletType.EVM]?.address;
            const stellarAddr = connectedWallets[WalletType.STELLAR]?.address;

            // Clear assets only if network changed
            if (state.network !== network) {
                set({ assets: [] });
            }

            const { updateAsset } = get();

            try {
                // Fetch all in parallel for speed
                const fetchPromises: Promise<void>[] = [];

                // 1. STELLAR FETCH
                if (stellarAddr) {
                    fetchPromises.push(
                        (async () => {
                            try {
                                const config = getStellarConfig(network as NetworkType);
                                const server = new StellarSdk.Horizon.Server(config.horizonUrl);
                                const acc = await server.loadAccount(stellarAddr);

                                for (const b of acc.balances) {
                                    const balanceNum = parseFloat(b.balance);
                                    if (balanceNum > 0) {
                                        const symbol = 'asset_code' in b ? b.asset_code : 'XLM';
                                        const meta = await portfolioUtils.getAssetMetadata(symbol);
                                        updateAsset({
                                            id: `stellar-${symbol}`,
                                            symbol,
                                            name: meta.name,
                                            image: meta.image,
                                            balance: balanceNum,
                                            current_price: 0,
                                            price_change_percentage_24h: 0,
                                            chainName: 'Stellar',
                                            chainType: 'stellar',
                                        });
                                    }
                                }
                            } catch (err) {
                                console.warn('[PortfolioStore] Stellar fetch failed:', err);
                            }
                        })()
                    );
                }

                // 2. EVM FETCH - Batch calls per chain
                if (evmAddr) {
                    const chains = getEVMChains(network as NetworkType);

                    for (const chain of chains) {
                        fetchPromises.push(
                            (async () => {
                                try {
                                    const provider = new ethers.JsonRpcProvider(chain.rpcUrl);

                                    // Native Balance
                                    const bal = await provider.getBalance(evmAddr);
                                    const balanceNum = parseFloat(ethers.formatEther(bal));

                                    if (balanceNum > 0) {
                                        const meta = await portfolioUtils.getAssetMetadata(chain.nativeCurrency.symbol);
                                        updateAsset({
                                            id: `${chain.chainId}-native`,
                                            symbol: chain.nativeCurrency.symbol,
                                            name: chain.name,
                                            image: meta.image,
                                            balance: balanceNum,
                                            current_price: 0,
                                            price_change_percentage_24h: 0,
                                            chainName: chain.name,
                                            chainId: chain.chainId,
                                            chainType: 'evm',
                                            isNative: true,
                                        });
                                    }

                                    // ERC20 Tokens - Batch with Promise.allSettled
                                    const tokens = getTokenAddressesForChain(chain.chainId);
                                    const tokenPromises = Object.entries(tokens).map(async ([symbol, address]) => {
                                        try {
                                            const contract = new ethers.Contract(address, ERC20_ABI, provider);
                                            const [tokenBal, dec] = await Promise.all([
                                                contract.balanceOf(evmAddr),
                                                contract.decimals(),
                                            ]);
                                            const tokenBalanceNum = parseFloat(ethers.formatUnits(tokenBal, dec));

                                            if (tokenBalanceNum > 0) {
                                                const meta = await portfolioUtils.getAssetMetadata(symbol);
                                                updateAsset({
                                                    id: `${chain.chainId}-${symbol}`,
                                                    symbol,
                                                    name: meta.name,
                                                    image: meta.image,
                                                    balance: tokenBalanceNum,
                                                    current_price: 0,
                                                    price_change_percentage_24h: 0,
                                                    chainName: chain.name,
                                                    chainId: chain.chainId,
                                                    chainType: 'evm',
                                                });
                                            }
                                        } catch {
                                            // Token fetch failed, skip
                                        }
                                    });

                                    await Promise.allSettled(tokenPromises);
                                } catch (err) {
                                    console.warn(`[PortfolioStore] Chain ${chain.name} fetch failed:`, err);
                                }
                            })()
                        );
                    }
                }

                // Wait for all fetches
                await Promise.allSettled(fetchPromises);
            } finally {
                set({ isLoading: false, isFetching: false, lastFetched: Date.now() });
            }

            // Enrich prices in background
            setTimeout(() => get().enrichPrices(), 1000);
        },

        refreshAssets: async (connectedWallets, network) => {
            await get().fetchAssets(connectedWallets, network, true);
        },

        enrichPrices: async () => {
            const { assets, updateAsset } = get();
            const needsPrice = assets.filter(a => a.current_price === 0 && a.balance !== null);

            if (needsPrice.length === 0) return;

            try {
                const metadata = await Promise.all(
                    needsPrice.map(a => portfolioUtils.getAssetMetadata(a.symbol))
                );
                const ids = metadata.map(m => m.id);
                const prices = await portfolioUtils.fetchPrices(ids);

                needsPrice.forEach((asset, index) => {
                    const cgId = ids[index];
                    if (prices[cgId]) {
                        updateAsset({
                            ...asset,
                            current_price: prices[cgId].usd,
                            price_change_percentage_24h: prices[cgId].usd_24h_change,
                        });
                    }
                });
            } catch (err) {
                console.warn('[PortfolioStore] Price enrichment failed:', err);
            }
        },
    }))
);

// Selectors
export const selectTotalValue = (state: PortfolioState) =>
    portfolioUtils.calculateTotalUSD(state.assets);

export const selectAssetsByChain = (chainId: number) => (state: PortfolioState) =>
    state.assets.filter(a => a.chainId === chainId);

export const selectEvmAssets = (state: PortfolioState) =>
    state.assets.filter(a => a.chainType === 'evm');

export const selectStellarAssets = (state: PortfolioState) =>
    state.assets.filter(a => a.chainType === 'stellar');
