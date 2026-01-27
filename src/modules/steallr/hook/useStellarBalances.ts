import { useEffect, useMemo, useState } from 'react';
import { Horizon } from '@stellar/stellar-sdk';
import { getStellarConfig } from '../../walletconnect/config/chains';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';

interface UseStellarBalancesReturn {
    balances: any[];
    loading: boolean;
    error: Error | null;
    server: Horizon.Server | null;
    refetch: () => Promise<void>;
}

export const useStellarBalances = (publicKey?: string): UseStellarBalancesReturn => {
    const [balances, setBalances] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const currentNetwork = useWalletStore((state) => state.network);

    const server = useMemo(() => {
        const config = getStellarConfig(currentNetwork);
        if (!config) return null;
        return new Horizon.Server(config.horizonUrl, {
            allowHttp: config.horizonUrl.startsWith('http://'),
        });
    }, [currentNetwork]);

    const fetchBalances = async () => {
        if (!publicKey || !server) {
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const account = await server.loadAccount(publicKey);
            setBalances(account.balances);
            setError(null);
        } catch (err) {
            setError(err as Error);
            setBalances([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBalances();
    }, [publicKey, server]);

    return { balances, loading, error, server, refetch: fetchBalances };
};