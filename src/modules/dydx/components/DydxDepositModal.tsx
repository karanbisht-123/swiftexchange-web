import { AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, Clock, Loader2, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { type Asset, useWalletAssets } from '../../walletconnect/hooks/useWalletAssets';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { useSubaccounts } from '../hooks/useSubaccounts';
import { useDydxDeposit } from '../hooks/useDydxDeposit';

type ModalStep = 'form' | 'select_token';

interface DydxDepositModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const PRIORITY_SYMBOLS = ['USDC', 'USDT', 'ETH'];

const CHAIN_ICONS: Record<string, string> = {
    ETH: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png',
    BNB: 'https://tokens.pancakeswap.finance/images/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c.png',
    STELLAR: 'https://coin-images.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png',
};

const getChainIconUrl = (asset: Asset): string | undefined => {
    if (asset.chainType === 'stellar') return CHAIN_ICONS.STELLAR;
    if (asset.chainId === 1) return CHAIN_ICONS.ETH;
    if (asset.chainId === 56) return CHAIN_ICONS.BNB;
    if (asset.chainName?.includes('Ethereum')) return CHAIN_ICONS.ETH;
    if (asset.chainName?.includes('BNB')) return CHAIN_ICONS.BNB;
    return undefined;
};

const AssetIcon = ({ asset, size = 'md' }: { asset: Asset; size?: 'sm' | 'md' }) => {
    const chainIcon = getChainIconUrl(asset);
    const imgClass = size === 'sm' ? 'w-5 h-5 rounded-full' : 'w-8 h-8 rounded-full';
    const badgeClass = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
    return (
        <div className="relative shrink-0">
            <img src={asset.image} alt={asset.symbol} className={imgClass} />
            <div className={`absolute -bottom-0.5 -right-0.5 ${badgeClass} rounded-full bg-primary border border-color flex items-center justify-center overflow-hidden`}>
                {chainIcon ? (
                    <img src={chainIcon} alt={asset.chainName} className="w-full h-full rounded-full" />
                ) : (
                    <span className="text-[6px] font-bold text-primary leading-none">
                        {asset.chainType === 'stellar' ? '★' : asset.chainName?.[0] || '?'}
                    </span>
                )}
            </div>
        </div>
    );
};

const AssetRow = ({
    asset,
    isSelected,
    onSelect,
}: {
    asset: Asset;
    isSelected: boolean;
    onSelect: (asset: Asset) => void;
}) => {
    const usdValue = (asset.balance || 0) * (asset.current_price || 0);
    return (
        <button
            onClick={() => onSelect(asset)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors ${isSelected ? 'bg-brand/10 border border-brand/30' : 'hover:bg-hover'
                }`}
        >
            <div className="flex items-center gap-3">
                <AssetIcon asset={asset} />
                <div className="text-left">
                    <div className="text-sm font-semibold text-primary">{asset.symbol}</div>
                    <div className="text-xs text-muted">{asset.chainName || 'Ethereum'}</div>
                </div>
            </div>
            <div className="text-right">
                <div className="text-sm font-medium text-primary">
                    {asset.balance?.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                </div>
                <div className="text-xs text-muted">
                    ${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
            </div>
        </button>
    );
};

export const DydxDepositModal: React.FC<DydxDepositModalProps> = ({ isOpen, onClose }) => {
    const { network } = useWalletStore();
    const { assets } = useWalletAssets(network);
    const evmWallet = useWalletStore(state => state.connectedWallets.evm);
    const evmAddress = evmWallet?.address || '';
    const { totalEquity } = useSubaccounts();
    const {
        deposit,
        getRoute,
        reset,
        recoverDeposit,
        checkPendingDeposit,
        pendingQuantums,
        dydxNativeQuantums,
        isCheckingPending,
        step: depositStep,
        stepLabel,
        error: depositError,
        route,
        isLoading,
        MIN_DEPOSIT_USDC,
    } = useDydxDeposit();
    const evmChainId = Number(evmWallet?.chainId ?? 1);

    const [modalStep, setModalStep] = useState<ModalStep>('form');
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
    const [amount, setAmount] = useState('');
    const [goFast, setGoFast] = useState(false);

    const sortedAssets = useMemo(() => {
        return [...assets].sort((a, b) => {
            const aIdx = PRIORITY_SYMBOLS.indexOf(a.symbol.toUpperCase());
            const bIdx = PRIORITY_SYMBOLS.indexOf(b.symbol.toUpperCase());
            if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
            if (aIdx !== -1) return -1;
            if (bIdx !== -1) return 1;
            return ((b.balance || 0) * (b.current_price || 0)) - ((a.balance || 0) * (a.current_price || 0));
        });
    }, [assets]);

    const yourTokens = useMemo(() => sortedAssets.filter(a => (a.balance || 0) > 0), [sortedAssets]);
    const otherTokens = useMemo(() => sortedAssets.filter(a => (a.balance || 0) === 0), [sortedAssets]);

    useEffect(() => {
        if (isOpen && assets.length > 0 && !selectedAsset) {
            const usdc = assets.find(a => a.symbol.toUpperCase() === 'USDC');
            const eth = assets.find(a => a.symbol.toUpperCase() === 'ETH');
            setSelectedAsset(usdc || eth || assets[0]);
        }
    }, [isOpen, assets, selectedAsset]);

    useEffect(() => {
        if (!isOpen) {
            setModalStep('form');
            setAmount('');
            setSelectedAsset(null);
            setGoFast(false);
            reset();
        } else {
            checkPendingDeposit();
        }
    }, [isOpen, reset, checkPendingDeposit]);

    useEffect(() => {
        const parsed = parseFloat(amount);
        if (selectedAsset && parsed > 0) {
            const timer = setTimeout(() => {
                getRoute(selectedAsset.symbol, parsed, evmChainId, goFast);
            }, 400);
            return () => clearTimeout(timer);
        }
    }, [amount, selectedAsset, getRoute, evmChainId, goFast]);

    const handleSelectAsset = useCallback((asset: Asset) => {
        setSelectedAsset(asset);
        setAmount('');
        setModalStep('form');
    }, []);

    const handleSetMax = useCallback(() => {
        if (selectedAsset?.balance) {
            setAmount(selectedAsset.balance.toFixed(6));
        }
    }, [selectedAsset]);

    const handleDeposit = useCallback(async () => {
        if (!selectedAsset || !amount) return;
        await deposit(selectedAsset.symbol, parseFloat(amount), evmChainId, goFast);
    }, [selectedAsset, amount, deposit, evmChainId, goFast]);

    const amountValue = parseFloat(amount) || 0;
    const walletBalance = selectedAsset?.balance || 0;
    const isStable = ['USDC', 'USDT'].includes(selectedAsset?.symbol?.toUpperCase() || '');
    const usdEquivalent = isStable ? amountValue : amountValue * (selectedAsset?.current_price || 0);
    const equityAfter = parseFloat(totalEquity) + usdEquivalent;
    const isBelowMinimum = amountValue > 0 && usdEquivalent < MIN_DEPOSIT_USDC;

    const isValidAmount = amountValue > 0 && amountValue <= walletBalance && !isBelowMinimum;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-secondary rounded-2xl border border-color w-full max-w-[440px] shadow-2xl overflow-hidden font-sans">
                {modalStep === 'form' ? (
                    <>
                        <div className="flex items-center justify-between p-5 pb-4">
                            <h3 className="text-xl font-semibold text-primary flex items-center gap-2">
                                Deposit
                                {isCheckingPending && <Loader2 className="w-4 h-4 animate-spin text-muted" />}
                            </h3>
                            <button
                                onClick={onClose}
                                className="p-1.5 text-muted hover:text-primary transition-colors rounded-lg hover:bg-hover"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {pendingQuantums && (
                            <div className="px-5 pb-4">
                                <div className="p-4 bg-brand/10 border border-brand/30 rounded-xl relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-brand" />
                                    <div className="flex justify-between items-center gap-4">
                                        <div>
                                            <h4 className="text-sm font-semibold text-primary mb-1">Stuck Deposit Detected</h4>
                                            <p className="text-xs text-muted leading-relaxed">
                                                A previous bridge transaction was successful but waiting to be credited.
                                                You have <strong className="text-primary">${(parseInt(pendingQuantums) / 1e6).toFixed(2)} USDC</strong> pending.
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => recoverDeposit(pendingQuantums, 0)}
                                            disabled={isLoading}
                                            className="px-4 py-2 bg-brand text-black rounded-lg text-sm font-semibold shadow-sm hover:brightness-110 active:brightness-90 transition-all disabled:opacity-50 whitespace-nowrap flex items-center gap-2"
                                        >
                                            {isLoading && depositStep === 'transferring' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                            Crediting...
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {dydxNativeQuantums && !pendingQuantums && (
                            <div className="px-5 pb-4">
                                <div className="p-4 bg-tertiary border border-color rounded-xl">
                                    <div className="flex justify-between items-center gap-4">
                                        <div>
                                            <h4 className="text-sm font-semibold text-primary mb-1">Native dYdX Balance</h4>
                                            <p className="text-xs text-muted leading-relaxed">
                                                You have <strong className="text-primary">${(parseInt(dydxNativeQuantums) / 1e6).toFixed(2)} USDC</strong> in your dYdX wallet.
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => recoverDeposit(dydxNativeQuantums, 0)}
                                            disabled={isLoading}
                                            className="px-4 py-2 bg-secondary border border-color text-primary rounded-lg text-sm font-semibold hover:bg-hover transition-all disabled:opacity-50 whitespace-nowrap flex items-center gap-2"
                                        >
                                            {isLoading && depositStep === 'transferring' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                            Deposit All
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="px-5 pb-3">
                            <div className="flex items-start gap-2 p-3 bg-brand/10 border border-brand/20 rounded-xl">
                                <AlertTriangle className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                                <p className="text-xs text-brand leading-relaxed">
                                    Not recommended for use yet. This feature is currently in development mode.
                                </p>
                            </div>
                        </div>

                        {depositStep !== 'success' ? (
                            <div className="px-5 pb-5 space-y-3">
                                <div className="p-4 rounded-xl border border-color bg-tertiary">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <div className="text-xs text-muted mb-0.5">Amount</div>
                                            <input
                                                type="text"
                                                value={amount}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                                        setAmount(val);
                                                    }
                                                }}
                                                placeholder="0.00"
                                                className="w-full bg-transparent text-primary text-3xl font-semibold focus:outline-none placeholder-muted"
                                            />
                                        </div>
                                        <button
                                            onClick={() => setModalStep('select_token')}
                                            className="flex items-center gap-2 bg-secondary hover:bg-hover transition-colors pl-2 pr-2 py-2 rounded-xl border border-color shrink-0"
                                        >
                                            {selectedAsset ? (
                                                <AssetIcon asset={selectedAsset} size="sm" />
                                            ) : (
                                                <div className="w-5 h-5 rounded-full bg-hover" />
                                            )}
                                            <span className="text-sm font-semibold text-primary">
                                                {selectedAsset?.symbol || 'Select'}
                                            </span>
                                            <ChevronDown className="w-4 h-4 text-muted" />
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted">
                                            {usdEquivalent > 0 && !isStable
                                                ? `≈ $${usdEquivalent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                                : null}
                                        </span>
                                        <button
                                            onClick={handleSetMax}
                                            className="text-xs text-muted hover:text-primary transition-colors"
                                        >
                                            {walletBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })} held &bull;{' '}
                                            <span className="text-brand font-medium">Max</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between px-1">
                                    <label className="flex items-center gap-2 cursor-pointer text-sm text-primary">
                                        <input
                                            type="checkbox"
                                            checked={goFast}
                                            onChange={e => setGoFast(e.target.checked)}
                                            className="w-4 h-4 rounded border-color text-brand focus:ring-brand focus:ring-offset-0 bg-transparent"
                                        />
                                        Go Fast (Skip routing)
                                    </label>
                                </div>

                                {route && amountValue > 0 && (
                                    <div className="space-y-2 px-1">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-1.5 text-sm text-muted">
                                                <Clock className="w-3.5 h-3.5" />
                                                Deposit method
                                            </div>
                                            <span className="text-sm text-secondary">{route.estimatedTime}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-muted">Available Balance</span>
                                            <div className="text-sm font-medium text-primary flex items-center gap-1.5">
                                                <span className="text-muted">
                                                    ${parseFloat(totalEquity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                                <span className="text-muted">→</span>
                                                <span>
                                                    ~${equityAfter.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        </div>
                                        {route.fee > 0 && (
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-muted">Bridge Fee</span>
                                                <span className="text-sm text-primary">
                                                    ~${route.fee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {depositError && (
                                    <div className="p-3 bg-danger-bg border border-danger rounded-xl flex items-start gap-2">
                                        <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                                        <p className="text-sm text-danger">{depositError}</p>
                                    </div>
                                )}

                                <button
                                    onClick={handleDeposit}
                                    disabled={isLoading || !isValidAmount || !evmAddress || isBelowMinimum || !!pendingQuantums}
                                    className="w-full py-3.5 btn btn-primary rounded-xl font-semibold text-[15px] transition-all disabled:bg-hover disabled:text-muted disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            {stepLabel}
                                        </>
                                    ) : !evmAddress ? (
                                        'Connect EVM Wallet'
                                    ) : isBelowMinimum ? (
                                        `Min. deposit is $${MIN_DEPOSIT_USDC}`
                                    ) : pendingQuantums ? (
                                        'Please complete pending deposit first'
                                    ) : (
                                        'Deposit'
                                    )}
                                </button>

                            </div>
                        ) : (
                            <div className="px-5 pb-6 flex flex-col items-center text-center gap-4">
                                <div className="w-16 h-16 rounded-full bg-success-bg flex items-center justify-center">
                                    <CheckCircle2 className="w-8 h-8 text-success" />
                                </div>
                                <div>
                                    <div className="text-lg font-semibold text-primary mb-1">Deposit Submitted</div>
                                    <div className="text-sm text-muted">
                                        Your deposit is being processed. Funds will appear in your account shortly.
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="w-full py-3.5 btn btn-primary rounded-xl font-semibold text-[15px]"
                                >
                                    Done
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-3 p-5 pb-3">
                            <button
                                onClick={() => setModalStep('form')}
                                className="p-1.5 -ml-1 text-muted hover:text-primary transition-colors rounded-lg hover:bg-hover"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <h3 className="text-lg font-semibold text-primary">Select token</h3>
                        </div>

                        <div className="max-h-[65vh] overflow-y-auto pb-4 px-3">
                            {yourTokens.length > 0 && (
                                <div className="mb-4">
                                    <div className="text-xs font-semibold text-muted uppercase tracking-wider px-2 mb-2">
                                        Your tokens
                                    </div>
                                    <div className="space-y-0.5">
                                        {yourTokens.map(asset => (
                                            <AssetRow
                                                key={asset.id}
                                                asset={asset}
                                                isSelected={selectedAsset?.id === asset.id}
                                                onSelect={handleSelectAsset}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {otherTokens.length > 0 && (
                                <div>
                                    <div className="text-xs font-semibold text-muted uppercase tracking-wider px-2 mb-2">
                                        Other tokens
                                    </div>
                                    <div className="space-y-0.5">
                                        {otherTokens.map(asset => (
                                            <AssetRow
                                                key={asset.id}
                                                asset={asset}
                                                isSelected={selectedAsset?.id === asset.id}
                                                onSelect={handleSelectAsset}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {assets.length === 0 && (
                                <div className="py-8 text-center text-sm text-muted">
                                    No assets found in connected wallets
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
