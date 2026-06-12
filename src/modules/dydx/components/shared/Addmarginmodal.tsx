import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useDydxWallet } from '../../hooks/useDydxWallet';
import { useSubaccounts } from '../../hooks/useSubaccounts';
import { useDydxData } from '../../hooks/useDydxData';
import useMarketStore from '../../store/marketStore';
import { dydxSubaccountService } from '../../service/dydxSubaccountService';
import { type Position } from '../../types/trading.types';

interface AddMarginModalProps {
    isOpen: boolean;
    onClose: () => void;
    position: Position;
    onSuccess?: () => void;
    marketIcon?: React.ReactNode;
}

type ModalState = 'idle' | 'loading' | 'success' | 'error';
type TabState = 'add' | 'remove';

const QUICK_PERCENTAGES = [10, 25, 50, 75, 100];

function validateAmount(raw: string, available: number, mode: TabState, isolatedEquity?: number): string | null {
    const n = parseFloat(raw);
    if (!raw || isNaN(n)) return 'Enter an amount';
    if (n <= 0) return 'Amount must be greater than 0';
    if (n < 1) return 'Minimum transfer is $1';

    if (mode === 'add') {
        if (n > available) return `Exceeds available balance ($${available.toFixed(2)})`;
    } else {
        if (n > (isolatedEquity || 0)) return `Exceeds position equity ($${(isolatedEquity || 0).toFixed(2)})`;
    }
    return null;
}

function mapTransferError(msg: string): string {
    if (msg.includes('insufficient')) return 'Insufficient funds';
    if (msg.includes('network') || msg.includes('timeout')) return 'Network error — please try again';
    if (msg.includes('Wallet not connected') || msg.includes('Signing wallet'))
        return 'Wallet session expired — please reconnect';
    return msg;
}

const AddMarginModal: React.FC<AddMarginModalProps> = ({ isOpen, onClose, position, onSuccess, marketIcon }) => {
    const [activeTab, setActiveTab] = useState<TabState>('add');
    const [amount, setAmount] = useState('');
    const [modalState, setModalState] = useState<ModalState>('idle');
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const subaccountNumber = position.subaccountNumber ?? 0;
    const isIsolated = subaccountNumber >= 128;

    const { balance } = useDydxWallet();
    const { positions } = useDydxData();
    const marketCache = useMarketStore(state => state.marketCache);
    const { getBalance, transfer, isTransferring, transferError, clearTransferError, childSubaccounts } = useSubaccounts();

    const crossFreeCollateral = parseFloat(balance?.freeCollateral ?? '0');
    const crossMarginUsage = 0;

    const isolatedBalance = getBalance(subaccountNumber);
    const isolatedEquity = parseFloat(isolatedBalance?.equity ?? '0');

    const [selectedSource, setSelectedSource] = useState<number>(0);

    const eligibleSources = useMemo(() => {
        const sources = dydxSubaccountService.getEligibleSourceSubaccounts(
            subaccountNumber,
            childSubaccounts,
            positions as Position[],
            marketCache
        );

        const list = [
            {
                value: 0,
                label: 'Cross Account',
                available: crossFreeCollateral,
                equity: parseFloat(balance?.crossEquity ?? '0')
            },
            ...sources
        ];
        return list.filter((s: { value: number; label: string; available: number; equity: number }) => s.value !== subaccountNumber && (s.available > 0 || s.value === 0));
    }, [subaccountNumber, childSubaccounts, positions, marketCache, crossFreeCollateral, balance?.crossEquity]);

    useEffect(() => {
        if (isOpen && activeTab === 'add' && eligibleSources.length > 0) {
            const crossSource = eligibleSources.find((s: { value: number; label: string; available: number; equity: number }) => s.value === 0);
            setSelectedSource(crossSource ? 0 : eligibleSources[0].value);
        }
    }, [isOpen, activeTab, eligibleSources.length]);

    useEffect(() => {
        let timerId: ReturnType<typeof setTimeout> | undefined;
        if (isOpen) {
            setAmount('');
            setError(null);
            setModalState('idle');
            setActiveTab('add');
            clearTransferError();
            timerId = setTimeout(() => inputRef.current?.focus(), 100);
        }
        return () => {
            if (timerId) {
                clearTimeout(timerId);
            }
        };
    }, [isOpen]);

    useEffect(() => {
        if (transferError) {
            setError(mapTransferError(transferError));
            setModalState('error');
        }
    }, [transferError]);

    const selectedSourceData = useMemo(() =>
        eligibleSources.find((s: { value: number; label: string; available: number; equity: number }) => s.value === selectedSource)
        , [eligibleSources, selectedSource]);

    const available = activeTab === 'add'
        ? (selectedSourceData?.available ?? 0)
        : isolatedEquity;

    const amountError = amount ? validateAmount(amount, available, activeTab, isolatedEquity) : null;
    const loading = modalState === 'loading' || isTransferring;
    const numericAmount = parseFloat(amount) || 0;
    const canSubmit = !amountError && amount !== '' && modalState === 'idle' && !isTransferring && available >= numericAmount && numericAmount > 0;

    const handleAmountChange = (val: string) => {
        if (/^\d*\.?\d{0,2}$/.test(val) || val === '') {
            setAmount(val);
            setError(null);
        }
    };

    const handlePercentage = (percent: number) => {
        if (available <= 0) return;
        const calcAmount = (available * percent) / 100;
        setAmount(calcAmount.toFixed(2));
        setError(null);
    };

    const handleSubmit = useCallback(async () => {
        const validationError = validateAmount(amount, available, activeTab, isolatedEquity);
        if (validationError) {
            setError(validationError);
            return;
        }

        setModalState('loading');
        setError(null);

        const fromSub = activeTab === 'add' ? selectedSource : subaccountNumber;
        const toSub = activeTab === 'add' ? subaccountNumber : 0;

        const result = await transfer(fromSub, toSub, amount);

        if (result.success) {
            setModalState('success');
            setTimeout(() => {
                onSuccess?.();
                onClose();
            }, 1800);
        } else {
            setModalState('error');
            if (result.error) setError(mapTransferError(result.error));
        }
    }, [amount, available, subaccountNumber, activeTab, isolatedEquity, transfer, onSuccess, onClose]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && canSubmit) handleSubmit();
        if (e.key === 'Escape' && !loading) onClose();
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && !loading) onClose();
    };

    if (!isOpen) return null;

    const positionMargin = isIsolated ? isolatedEquity : parseFloat(balance?.crossEquity ?? '0');
    const positionLeverage = position.leverage || '0.00';
    const liquidationPrice = position.liquidationPrice ? parseFloat(position.liquidationPrice) : 0;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={handleBackdropClick}
        >
            <div
                className="relative w-full max-w-sm mx-4 bg-secondary border border-(--color-border) rounded-2xl shadow-2xl overflow-hidden"
                onKeyDown={handleKeyDown}
            >
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-orange-500/5 blur-3xl" />
                </div>

                <div className="relative flex items-center justify-between px-5 pt-5 pb-4">
                    <div className="flex items-center gap-3">
                        {marketIcon && (
                            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                                {marketIcon}
                            </div>
                        )}
                        <h2 className="text-base font-semibold text-(--color-text-primary)">
                            {isIsolated ? 'Adjust Isolated Margin' : 'Add Cross Margin'}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="flex items-center justify-center p-1 rounded-lg text-(--color-text-secondary) hover:text-(--color-text-primary) transition-all disabled:opacity-40"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="px-5 pb-5 space-y-4 relative">
                    {isIsolated && (
                        <div className="flex p-1 bg-(--color-bg-tertiary) rounded-full border border-(--color-border)">
                            <button
                                onClick={() => { setActiveTab('add'); setAmount(''); setError(null); }}
                                className={`flex-1 py-1.5 text-[13px] font-medium rounded-full transition-all ${activeTab === 'add' ? 'bg-(--color-bg-hover) text-(--color-text-primary)' : 'text-(--color-text-muted) hover:text-(--color-text-primary)'}`}
                            >
                                Add Margin
                            </button>
                            <button
                                onClick={() => { setActiveTab('remove'); setAmount(''); setError(null); }}
                                className={`flex-1 py-1.5 text-[13px] font-medium rounded-full transition-all ${activeTab === 'remove' ? 'bg-(--color-bg-hover) text-(--color-text-primary)' : 'text-(--color-text-muted) hover:text-(--color-text-primary)'}`}
                            >
                                Remove Margin
                            </button>
                        </div>
                    )}

                    <div className="flex gap-1.5">
                        {QUICK_PERCENTAGES.map(val => {
                            const disabled = loading || available <= 0;
                            return (
                                <button
                                    key={val}
                                    onClick={() => handlePercentage(val)}
                                    disabled={disabled}
                                    className={`flex-1 py-1.5 text-xs font-medium rounded border transition-all ${disabled
                                        ? 'border-(--color-border) text-(--color-text-muted) opacity-40 cursor-not-allowed bg-(--color-bg-tertiary)'
                                        : 'border-(--color-border) text-(--color-text-secondary) bg-(--color-bg-tertiary) hover:bg-(--color-bg-hover) hover:text-(--color-text-primary)'
                                        }`}
                                >
                                    {val}%
                                </button>
                            );
                        })}
                    </div>

                    {activeTab === 'add' && (
                        <div className="bg-(--color-bg-tertiary) border border-(--color-border) rounded-xl overflow-hidden p-3.5">
                            <label className="block text-[11px] text-(--color-text-secondary) font-medium mb-1.5">
                                Source Account
                            </label>
                            {eligibleSources.length === 0 ? (
                                <div className="text-xs text-(--color-warning) font-medium leading-relaxed">
                                    No other subaccounts have available margin to transfer. Please deposit USDC directly to your Cross account.
                                </div>
                            ) : eligibleSources.length === 1 && eligibleSources[0].value === 0 ? (
                                <div className="text-sm font-medium text-(--color-text-primary) flex justify-between items-center">
                                    <span>Cross Account</span>
                                    <span className="text-(--color-text-muted) text-xs">No other positions have margin.</span>
                                </div>
                            ) : (
                                <select
                                    value={selectedSource}
                                    onChange={(e) => {
                                        setSelectedSource(Number(e.target.value));
                                        setAmount('');
                                    }}
                                    disabled={loading || modalState === 'success'}
                                    className="w-full bg-transparent text-sm font-medium text-(--color-text-primary) outline-none cursor-pointer"
                                >
                                    {eligibleSources.map((s: { value: number; label: string; available: number; equity: number }) => (
                                        <option key={s.value} value={s.value} className="bg-secondary text-primary">
                                            {s.label}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    )}

                    <div className="bg-(--color-bg-tertiary) border border-(--color-border) rounded-xl overflow-hidden">
                        <div className="px-3.5 pt-2.5 pb-1">
                            <label className="text-[11px] text-(--color-text-muted) font-medium">
                                {activeTab === 'add' ? 'Amount to Add' : 'Amount to Remove'}
                            </label>
                        </div>
                        <div className={`flex items-center gap-2 px-3.5 pb-2.5 transition-all ${amountError ? 'text-(--color-danger)' : ''}`}>
                            <span className="text-xl text-(--color-text-muted) font-medium">$</span>
                            <input
                                ref={inputRef}
                                type="text"
                                inputMode="decimal"
                                value={amount}
                                onChange={e => handleAmountChange(e.target.value)}
                                disabled={loading || modalState === 'success'}
                                placeholder="0.00"
                                className={`flex-1 bg-transparent text-xl font-medium text-(--color-text-primary) placeholder-(--color-text-muted) outline-none disabled:opacity-50`}
                            />
                        </div>
                    </div>

                    <div className="flex justify-between items-center px-1 text-[11px] text-(--color-text-muted)">
                        <span>Available to transfer: ${available.toFixed(2)}</span>
                        {activeTab === 'add' && selectedSource !== 0 && selectedSourceData && (
                            <span>Minimum retained in source: ${(
                                selectedSourceData.equity - available
                            ).toFixed(2)}</span>
                        )}
                    </div>

                    {amountError && (
                        <div className="flex items-center gap-1.5 text-xs text-(--color-danger)">
                            <AlertTriangle size={12} />
                            <span>{amountError}</span>
                        </div>
                    )}

                    {activeTab === 'add' && selectedSource !== 0 && selectedSourceData ? (
                        <div className="space-y-2 py-1">
                            <div className="flex justify-between items-center text-[13px]">
                                <span className="text-(--color-text-secondary)">Source Bal. after transfer</span>
                                <span className="text-(--color-text-primary) font-medium">
                                    ${Math.max(0, selectedSourceData.equity - numericAmount).toFixed(2)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-[13px]">
                                <span className="text-(--color-text-secondary)">Dest Bal. after transfer</span>
                                <span className="text-(--color-text-primary) font-medium">
                                    ${(isolatedEquity + numericAmount).toFixed(2)}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2 py-1">
                            <div className="flex justify-between items-center text-[13px]">
                                <span className="text-(--color-text-secondary)">Cross Free Collateral</span>
                                <span className="text-(--color-text-primary) font-medium">${crossFreeCollateral.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-[13px]">
                                <span className="text-(--color-text-secondary)">Cross Margin Usage</span>
                                <span className="text-(--color-text-primary) font-medium">{crossMarginUsage.toFixed(2)}%</span>
                            </div>
                        </div>
                    )}

                    <div className="bg-(--color-bg-tertiary) rounded-xl p-3 border border-(--color-border)">
                        <div className="flex justify-between items-start text-[13px]">
                            <div className="flex flex-col text-(--color-text-secondary)">
                                <span>Estimated</span>
                                <span>Liquidation Price</span>
                            </div>
                            <span className="text-(--color-text-primary) font-medium">${liquidationPrice.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                    </div>

                    <div className="space-y-2 py-1">
                        <div className="flex justify-between items-center text-[13px]">
                            <span className="text-(--color-text-secondary)">Position Margin</span>
                            <span className="text-(--color-text-primary) font-medium">${positionMargin.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-[13px]">
                            <span className="text-(--color-text-secondary)">Position Leverage</span>
                            <span className="text-(--color-text-primary) font-medium">{parseFloat(positionLeverage).toFixed(2)}×</span>
                        </div>
                    </div>

                    {error && modalState === 'error' && (
                        <div className="flex items-start gap-2.5 px-3 py-2.5 bg-(--color-danger-bg) border border-(--color-danger)/20 rounded-xl">
                            <AlertTriangle size={14} className="text-(--color-danger) mt-0.5 shrink-0" />
                            <p className="text-xs text-(--color-danger) leading-relaxed">{error}</p>
                        </div>
                    )}

                    {modalState === 'success' && (
                        <div className="flex items-center gap-2.5 px-3 py-2.5 bg-(--color-success-bg) border border-(--color-success)/20 rounded-xl">
                            <CheckCircle2 size={14} className="text-(--color-success) shrink-0" />
                            <p className="text-xs text-(--color-success)">Margin {activeTab === 'add' ? 'added' : 'removed'} successfully</p>
                        </div>
                    )}

                    <button
                        onClick={handleSubmit}
                        disabled={!canSubmit && amount === '' ? false : !canSubmit}
                        className={`w-full py-3 text-[13px] font-semibold rounded-lg transition-all flex items-center justify-center gap-2 border ${
                            modalState === 'success'
                                ? 'bg-(--color-success-bg) text-(--color-success) border-(--color-success)/30'
                                : !canSubmit || amount === ''
                                ? 'bg-(--color-bg-tertiary) text-(--color-text-muted) border-(--color-border) opacity-50 cursor-not-allowed'
                                : 'bg-(--color-brand-primary) text-(--color-text-inverse) border-transparent hover:bg-(--color-brand-primary-hover)'
                        }`}
                    >
                        {loading && <Loader2 size={14} className="animate-spin" />}
                        {modalState === 'success' && <CheckCircle2 size={14} />}
                        {loading ? 'Processing…' : modalState === 'success' ? 'Done' : (!canSubmit || amount === '') ? <><AlertTriangle size={14} /> Modify amount</> : 'Modify Margin'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddMarginModal;