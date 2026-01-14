import { ArrowDown, Loader2, X } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';

import { useSubaccounts } from '../hooks/useSubaccounts';
import { SUBACCOUNT_CONSTANTS } from '../types/trading.types';

interface SubaccountTransferProps {
    isOpen: boolean;
    onClose: () => void;
    toSubaccount?: number;
    fromSubaccount?: number;
}

export const SubaccountTransfer: React.FC<SubaccountTransferProps> = ({
    isOpen,
    onClose,
    toSubaccount: initialToSubaccount,
    fromSubaccount: initialFromSubaccount,
}) => {
    const {
        childSubaccounts,
        crossSubaccount,
        transfer,
        isTransferring,
        transferError,
        clearTransferError,
        // totalFreeCollateral,
    } = useSubaccounts();

    const [fromSubaccount, setFromSubaccount] = useState<number>(
        initialFromSubaccount ?? SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT
    );
    const [toSubaccount, setToSubaccount] = useState<number>(
        initialToSubaccount ?? SUBACCOUNT_CONSTANTS.ISOLATED_START
    );
    const [amount, setAmount] = useState('');
    const [success, setSuccess] = useState(false);
    const sourceBalance = useMemo(() => {
        const source = childSubaccounts.find(c => c.subaccountNumber === fromSubaccount);
        return source ? parseFloat(source.freeCollateral) : 0;
    }, [childSubaccounts, fromSubaccount]);
    const amountValue = parseFloat(amount) || 0;
    const isValidAmount = amountValue > 0 && amountValue <= sourceBalance;
    const subaccountOptions = useMemo(() => {
        const options: Array<{ value: number; label: string; balance: string }> = [];
        if (crossSubaccount) {
            options.push({
                value: crossSubaccount.subaccountNumber,
                label: `Cross Margin (${crossSubaccount.subaccountNumber})`,
                balance: `$${parseFloat(crossSubaccount.freeCollateral).toFixed(2)}`,
            });
        }
        childSubaccounts
            .filter(c => c.subaccountNumber >= SUBACCOUNT_CONSTANTS.ISOLATED_START)
            .forEach(c => {
                const markets = Object.keys(c.openPerpetualPositions || {});
                const label = markets.length > 0
                    ? `Isolated: ${markets[0]} (${c.subaccountNumber})`
                    : `Isolated #${c.subaccountNumber}`;
                options.push({
                    value: c.subaccountNumber,
                    label,
                    balance: `$${parseFloat(c.freeCollateral).toFixed(2)}`,
                });
            });

        const usedNumbers = new Set(childSubaccounts.map(c => c.subaccountNumber));
        let nextAvailable = SUBACCOUNT_CONSTANTS.ISOLATED_START;
        while (usedNumbers.has(nextAvailable)) nextAvailable++;

        if (!options.find(o => o.value === nextAvailable)) {
            options.push({
                value: nextAvailable,
                label: `New Isolated (#${nextAvailable})`,
                balance: '$0.00',
            });
        }

        return options;
    }, [childSubaccounts, crossSubaccount]);

    const handleTransfer = useCallback(async () => {
        if (!isValidAmount) return;

        clearTransferError();
        setSuccess(false);

        const result = await transfer(fromSubaccount, toSubaccount, amount);

        if (result.success) {
            setSuccess(true);
            setAmount('');
            setTimeout(() => {
                onClose();
                setSuccess(false);
            }, 2000);
        }
    }, [isValidAmount, transfer, fromSubaccount, toSubaccount, amount, clearTransferError, onClose]);

    const handleSwap = useCallback(() => {
        const temp = fromSubaccount;
        setFromSubaccount(toSubaccount);
        setToSubaccount(temp);
    }, [fromSubaccount, toSubaccount]);

    const handleSetMax = useCallback(() => {
        setAmount(sourceBalance.toFixed(2));
    }, [sourceBalance]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-md shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 className="text-lg font-semibold text-white">Transfer Funds</h3>
                    <button
                        onClick={onClose}
                        className="p-1 text-gray-400 hover:text-white transition-colors rounded"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>


                <div className="p-4 space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                            From
                        </label>
                        <select
                            value={fromSubaccount}
                            onChange={(e) => setFromSubaccount(Number(e.target.value))}
                            className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                        >
                            {subaccountOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label} - {opt.balance}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500">
                            Available: <span className="text-green-400 font-medium">${sourceBalance.toFixed(2)}</span>
                        </p>
                    </div>

                    <div className="flex justify-center">
                        <button
                            onClick={handleSwap}
                            className="p-2 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                        >
                            <ArrowDown className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                            To
                        </label>
                        <select
                            value={toSubaccount}
                            onChange={(e) => setToSubaccount(Number(e.target.value))}
                            className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                        >
                            {subaccountOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label} - {opt.balance}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                            Amount (USDC)
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                value={amount}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (/^\d*\.?\d*$/.test(val)) {
                                        setAmount(val);
                                    }
                                }}
                                placeholder="0.00"
                                className="w-full px-3 py-2.5 pr-16 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                            <button
                                onClick={handleSetMax}
                                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
                            >
                                MAX
                            </button>
                        </div>
                        {amountValue > sourceBalance && (
                            <p className="text-xs text-red-400">Insufficient balance</p>
                        )}
                    </div>

                    {transferError && (
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                            <p className="text-sm text-red-400">{transferError}</p>
                        </div>
                    )}

                    {success && (
                        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                            <p className="text-sm text-green-400">Transfer successful! ✓</p>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-700">
                    <button
                        onClick={handleTransfer}
                        disabled={isTransferring || !isValidAmount || fromSubaccount === toSubaccount}
                        className="w-full py-3 rounded-lg font-semibold text-sm transition-all bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white flex items-center justify-center gap-2"
                    >
                        {isTransferring ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Transferring...
                            </>
                        ) : (
                            'Transfer'
                        )}
                    </button>
                    <p className="text-xs text-gray-500 text-center mt-2">
                        Gas fees will be paid in USDC
                    </p>
                </div>
            </div>
        </div>
    );
};
