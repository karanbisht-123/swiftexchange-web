import { AlertTriangle, CheckCircle2, ChevronRight, Loader2, Plus, TrendingDown, TrendingUp, X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useDydxWallet } from '../../hooks/useDydxWallet';
import { useSubaccounts } from '../../hooks/useSubaccounts';
import { type Position } from '../../types/trading.types';

interface AddMarginModalProps {
    isOpen: boolean;
    onClose: () => void;
    position: Position;
    onSuccess?: () => void;
}

type ModalState = 'idle' | 'loading' | 'success' | 'error';

const QUICK_AMOUNTS = [10, 25, 50, 100];

function validateAmount(raw: string, available: number): string | null {
    const n = parseFloat(raw);
    if (!raw || isNaN(n)) return 'Enter an amount';
    if (n <= 0) return 'Amount must be greater than 0';
    if (n < 1) return 'Minimum transfer is $1';
    if (n > available) return `Exceeds available balance ($${available.toFixed(2)})`;
    return null;
}

function mapTransferError(msg: string): string {
    if (msg.includes('insufficient')) return 'Insufficient free collateral in cross account';
    if (msg.includes('network') || msg.includes('timeout')) return 'Network error — please try again';
    if (msg.includes('Wallet not connected') || msg.includes('Signing wallet'))
        return 'Wallet session expired — please reconnect';
    return msg;
}

const AddMarginModal: React.FC<AddMarginModalProps> = ({ isOpen, onClose, position, onSuccess }) => {
    const [amount, setAmount] = useState('');
    const [modalState, setModalState] = useState<ModalState>('idle');
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const subaccountNumber = position.subaccountNumber ?? 0;
    const isIsolated = subaccountNumber >= 128;

    const { balance } = useDydxWallet();
    const { getBalance, transfer, isTransferring, transferError, clearTransferError } = useSubaccounts();

    const crossFreeCollateral = parseFloat(balance?.freeCollateral ?? '0');
    const isolatedBalance = getBalance(subaccountNumber);
    const isolatedEquity = parseFloat(isolatedBalance?.equity ?? '0');

    useEffect(() => {
        if (isOpen) {
            setAmount('');
            setError(null);
            setModalState('idle');
            clearTransferError();
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen, clearTransferError]);

    useEffect(() => {
        if (transferError) {
            setError(mapTransferError(transferError));
            setModalState('error');
        }
    }, [transferError]);

    const available = crossFreeCollateral;
    const amountError = amount ? validateAmount(amount, available) : null;
    const loading = modalState === 'loading' || isTransferring;
    const canSubmit = !amountError && amount !== '' && modalState === 'idle' && !isTransferring && available > 0;

    const handleAmountChange = (val: string) => {
        if (/^\d*\.?\d{0,2}$/.test(val) || val === '') {
            setAmount(val);
            setError(null);
        }
    };

    const handleQuickAmount = (val: number) => {
        setAmount(Math.min(val, available).toFixed(2));
        setError(null);
    };

    const handleMax = () => {
        if (available > 0) {
            setAmount(available.toFixed(2));
            setError(null);
        }
    };

    const handleSubmit = useCallback(async () => {
        const validationError = validateAmount(amount, available);
        if (validationError) {
            setError(validationError);
            return;
        }

        setModalState('loading');
        setError(null);

        const result = await transfer(0, subaccountNumber, amount);

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
    }, [amount, available, subaccountNumber, transfer, onSuccess, onClose]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && canSubmit) handleSubmit();
        if (e.key === 'Escape' && !loading) onClose();
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && !loading) onClose();
    };

    if (!isOpen || !isIsolated) return null;

    const numericAmount = parseFloat(amount) || 0;
    const newEstimatedEquity = isolatedEquity + numericAmount;
    const isLong = position.side === 'LONG';

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={handleBackdropClick}
        >
            <div
                className="relative w-full max-w-sm mx-4 bg-[#0f1117] border border-[#1e2330] rounded-2xl shadow-2xl overflow-hidden"
                onKeyDown={handleKeyDown}
            >
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-blue-500/5 blur-3xl" />
                    <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-purple-500/5 blur-3xl" />
                </div>

                <div className="relative flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#1e2330]">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20">
                            <Plus size={14} className="text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-white">Add Margin</h2>
                            <p className="text-[10px] text-[#6b7280] mt-0.5">Isolated position</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="flex items-center justify-center w-7 h-7 rounded-lg text-[#4b5563] hover:text-white hover:bg-[#1e2330] transition-all disabled:opacity-40"
                    >
                        <X size={14} />
                    </button>
                </div>

                <div className="relative px-5 py-4 space-y-4">
                    <div className="flex items-center justify-between p-3 bg-[#0a0d14] border border-[#1e2330] rounded-xl">
                        <div className="flex items-center gap-2.5">
                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${isLong
                                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                }`}>
                                {isLong ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                                {position.side}
                            </div>
                            <span className="text-xs font-semibold text-white">{position.market}</span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#1e2330] text-[#9ca3af] font-medium">
                            Sub #{subaccountNumber}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="p-3 bg-[#0a0d14] border border-[#1e2330] rounded-xl space-y-1">
                            <p className="text-[9px] uppercase tracking-wider text-[#6b7280] font-medium">Cross Available</p>
                            <p className="text-sm font-mono font-semibold text-white">
                                ${crossFreeCollateral.toFixed(2)}
                            </p>
                        </div>
                        <div className="p-3 bg-[#0a0d14] border border-[#1e2330] rounded-xl space-y-1">
                            <p className="text-[9px] uppercase tracking-wider text-[#6b7280] font-medium">Position Equity</p>
                            <p className="text-sm font-mono font-semibold text-white">
                                ${isolatedEquity.toFixed(2)}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] uppercase tracking-wider text-[#6b7280] font-medium">
                                Amount (USDC)
                            </label>
                            <button
                                onClick={handleMax}
                                disabled={available <= 0 || loading}
                                className="text-[10px] text-blue-400 hover:text-blue-300 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Max
                            </button>
                        </div>

                        <div className={`flex items-center gap-2 px-3.5 py-3 bg-[#0a0d14] border rounded-xl transition-all ${amountError
                                ? 'border-red-500/50 focus-within:border-red-500'
                                : 'border-[#1e2330] focus-within:border-blue-500/50'
                            }`}>
                            <span className="text-sm text-[#6b7280] font-mono">$</span>
                            <input
                                ref={inputRef}
                                type="text"
                                inputMode="decimal"
                                value={amount}
                                onChange={e => handleAmountChange(e.target.value)}
                                disabled={loading || modalState === 'success'}
                                placeholder="0.00"
                                className="flex-1 bg-transparent text-sm font-mono text-white placeholder-[#374151] outline-none disabled:opacity-50"
                            />
                        </div>

                        {amountError && (
                            <div className="flex items-center gap-1.5 text-[10px] text-red-400">
                                <AlertTriangle size={10} />
                                <span>{amountError}</span>
                            </div>
                        )}

                        <div className="flex gap-1.5">
                            {QUICK_AMOUNTS.map(val => {
                                const disabled = val > available || loading || available <= 0;
                                const isActive = parseFloat(amount) === Math.min(val, available);
                                return (
                                    <button
                                        key={val}
                                        onClick={() => handleQuickAmount(val)}
                                        disabled={disabled}
                                        className={`flex-1 py-1.5 text-[10px] font-medium rounded-lg border transition-all ${disabled
                                                ? 'border-[#1e2330] text-[#374151] cursor-not-allowed'
                                                : isActive
                                                    ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                                                    : 'border-[#1e2330] text-[#9ca3af] hover:border-[#374151] hover:text-white'
                                            }`}
                                    >
                                        ${val}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {numericAmount > 0 && !amountError && (
                        <div className="flex items-center justify-between px-3 py-2.5 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[9px] uppercase tracking-wider text-[#6b7280] font-medium">Est. New Equity</span>
                                <span className="text-xs font-mono font-semibold text-blue-300">
                                    ${newEstimatedEquity.toFixed(2)}
                                </span>
                            </div>
                            <ChevronRight size={12} className="text-[#374151]" />
                            <div className="flex flex-col gap-0.5 items-end">
                                <span className="text-[9px] uppercase tracking-wider text-[#6b7280] font-medium">Cross Remaining</span>
                                <span className="text-xs font-mono font-semibold text-[#9ca3af]">
                                    ${Math.max(0, available - numericAmount).toFixed(2)}
                                </span>
                            </div>
                        </div>
                    )}

                    {error && modalState === 'error' && (
                        <div className="flex items-start gap-2.5 px-3 py-2.5 bg-red-500/5 border border-red-500/20 rounded-xl">
                            <AlertTriangle size={13} className="text-red-400 mt-0.5 shrink-0" />
                            <p className="text-[11px] text-red-300 leading-relaxed">{error}</p>
                        </div>
                    )}

                    {modalState === 'success' && (
                        <div className="flex items-center gap-2.5 px-3 py-2.5 bg-green-500/5 border border-green-500/20 rounded-xl">
                            <CheckCircle2 size={13} className="text-green-400 shrink-0" />
                            <p className="text-[11px] text-green-300">Margin added successfully</p>
                        </div>
                    )}
                </div>

                <div className="relative px-5 pb-5 flex gap-2.5">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 py-2.5 text-xs font-medium text-[#9ca3af] bg-[#0a0d14] border border-[#1e2330] rounded-xl hover:border-[#374151] hover:text-white transition-all disabled:opacity-40"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className={`flex-1 py-2.5 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${modalState === 'success'
                                ? 'bg-green-500/20 border border-green-500/30 text-green-400 cursor-default'
                                : canSubmit
                                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                                    : 'bg-[#1e2330] text-[#374151] cursor-not-allowed'
                            }`}
                    >
                        {loading && <Loader2 size={12} className="animate-spin" />}
                        {modalState === 'success' && <CheckCircle2 size={12} />}
                        {loading ? 'Transferring…' : modalState === 'success' ? 'Done' : 'Add Margin'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddMarginModal;