import { Loader2, X, Copy, ChevronRight, } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useDydxWithdraw } from '../hooks/useDydxWithdraw';
import { useSubaccounts } from '../hooks/useSubaccounts';
import { SUBACCOUNT_CONSTANTS } from '../types/trading.types';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';

interface DydxWithdrawModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const DydxWithdrawModal: React.FC<DydxWithdrawModalProps> = ({
    isOpen,
    onClose,
}) => {
    const {
        childSubaccounts,
        crossSubaccount,
        totalEquity,
        totalFreeCollateral: globalFreeCollateral,
    } = useSubaccounts();

    const evmWallet = useWalletStore(state => state.connectedWallets.evm);
    const evmAddress = evmWallet?.address || '';

    const { withdraw, isWithdrawing, withdrawError, clearWithdrawError } = useDydxWithdraw();

    const [activeTab, setActiveTab] = useState<'perpetuals' | 'spot'>('perpetuals');
    const [fromSubaccount, setFromSubaccount] = useState<number>(SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT);
    const [amount, setAmount] = useState('');
    const [success, setSuccess] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    // Reset state on open
    useEffect(() => {
        if (isOpen) {
            setAmount('');
            setSuccess(false);
            clearWithdrawError();
            setFromSubaccount(SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT);
        }
    }, [isOpen]);

    const sourceBalance = useMemo(() => {
        if (fromSubaccount === SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT && crossSubaccount) {
            return parseFloat(crossSubaccount.freeCollateral);
        }
        const source = childSubaccounts.find(c => c.subaccountNumber === fromSubaccount);
        return source ? parseFloat(source.freeCollateral) : 0;
    }, [childSubaccounts, crossSubaccount, fromSubaccount]);

    const amountValue = parseFloat(amount) || 0;



    const baseFee = 0.05;
    // const bridgeFee = 0.03;
    const totalDeduction = amountValue > 0 ? amountValue : 0;
    const actualWidthdrawAmount = Math.max(0, amountValue - baseFee);

    const isValidAmount = amountValue > 0 && amountValue <= sourceBalance;

    const freeCollateralBefore = sourceBalance;
    const freeCollateralAfter = Math.max(0, sourceBalance - totalDeduction);

    const equityBefore = parseFloat(totalEquity) || 0;
    const globalFreeCol = parseFloat(globalFreeCollateral) || 0;
    const equityAfter = Math.max(0, equityBefore - totalDeduction);

    const marginUsageAfter = equityAfter > 0 ? ((equityBefore - globalFreeCol) / equityAfter) * 100 : 0;

    const handleCopy = () => {
        if (!evmAddress) return;
        navigator.clipboard.writeText(evmAddress);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const handleSetMax = () => {
        setAmount(sourceBalance.toFixed(6));
    };

    const handleWithdraw = useCallback(async () => {
        if (!isValidAmount) return;

        clearWithdrawError();
        setSuccess(false);

        const destAddress = evmAddress;

        const result = await withdraw(amountValue.toString(), destAddress);

        if (result.success) {
            setSuccess(true);
            setTimeout(() => {
                onClose();
            }, 2000);
        }
    }, [isValidAmount, withdraw, amountValue, evmAddress, clearWithdrawError, onClose]);

    if (!isOpen) return null;

    const formatCurr = (val: number) => `$${val.toFixed(2)}`;
    const formatPct = (val: number) => `${val.toFixed(2)}%`;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-secondary rounded-2xl border border-color w-full max-w-[440px] shadow-2xl overflow-hidden font-sans">

                <div className="flex items-center justify-between p-5 pb-3">
                    <h3 className="text-xl font-medium text-primary">Withdraw</h3>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-muted hover:text-primary transition-colors rounded-lg hover:bg-hover"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-5 pb-5 space-y-4">

                    <div className="flex p-1 bg-tertiary rounded-xl border border-color">
                        <button
                            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'perpetuals'
                                ? 'bg-secondary text-primary shadow-sm'
                                : 'text-muted hover:text-primary'
                                }`}
                            onClick={() => setActiveTab('perpetuals')}
                        >
                            Perpetuals
                        </button>
                        <button
                            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'spot'
                                ? 'bg-secondary text-primary shadow-sm'
                                : 'text-muted hover:text-primary'
                                }`}
                            onClick={() => setActiveTab('spot')}
                        >
                            Spot
                        </button>
                    </div>

                    {/* Address Block */}
                    <div className="p-4 rounded-xl border border-color bg-tertiary">
                        <div className="text-xs text-muted mb-1">Address</div>
                        <div className="flex items-start justify-between">
                            <div className="overflow-hidden pr-4">
                                <div className="text-primary font-medium text-[15px] truncate">
                                    {evmAddress ? `${evmAddress.slice(0, 18)}...${evmAddress.slice(-4)}` : 'Connect EVM Wallet'}
                                </div>
                                <div className="flex items-center gap-1.5 mt-1">
                                    <span className="text-xs text-muted font-mono">
                                        {evmAddress ? `${evmAddress.slice(0, 6)}...${evmAddress.slice(-4)}` : '0x...'}
                                    </span>
                                    <button
                                        onClick={handleCopy}
                                        className="text-muted hover:text-primary transition-colors"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                    </button>
                                    {isCopied && <span className="text-[10px] text-success">Copied!</span>}
                                </div>
                            </div>
                            <button className="flex items-center gap-2 bg-secondary hover:bg-hover transition-colors pl-2.5 pr-2 py-1.5 rounded-lg border border-color">
                                <img src="https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=029" alt="ETH" className="w-4 h-4" />
                                <span className="text-sm font-medium text-primary">Ethereum</span>
                                <ChevronRight className="w-4 h-4 text-muted" />
                            </button>
                        </div>
                    </div>

                    {/* Amount Block */}
                    <div className="p-4 rounded-xl border border-color bg-tertiary">
                        <div className="flex justify-between items-center mb-2">
                            <div className="text-xs text-muted">
                                Amount &bull; <span className="text-secondary">${sourceBalance.toFixed(6)} Available</span>
                            </div>
                            <button
                                onClick={handleSetMax}
                                className="text-xs font-medium text-brand hover:text-opacity-80 transition-colors"
                            >
                                Max
                            </button>
                        </div>
                        <input
                            type="text"
                            value={amount}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                    setAmount(val);
                                }
                            }}
                            placeholder="0.00"
                            className="w-full bg-transparent text-primary text-2xl font-medium focus:outline-none placeholder-muted"
                        />
                        {amountValue > sourceBalance && (
                            <p className="text-xs text-danger mt-2">Insufficient available balance</p>
                        )}
                    </div>

                    {/* <div className="p-3.5 rounded-xl border border-color bg-secondary flex items-start gap-3">
                        <div className="bg-brand p-1 rounded-full text-white shrink-0 mt-0.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                        <div>
                            <div className="text-sm font-medium text-primary">3m</div>
                            <div className="text-xs text-muted mt-0.5">${bridgeFee.toFixed(2)}</div>
                        </div>
                    </div> */}


                    <div className="space-y-3 pt-2">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-muted">Withdraw</span>
                            <span className="text-sm text-primary font-medium">{formatCurr(actualWidthdrawAmount)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-muted">Free Collateral</span>
                            <div className="text-sm font-medium text-primary flex items-center gap-2">
                                <span className="text-secondary">{formatCurr(freeCollateralBefore)}</span>
                                <span className="text-muted">&rarr;</span>
                                <span>{formatCurr(freeCollateralAfter)}</span>
                            </div>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-muted">Margin Usage</span>
                            <span className="text-sm text-primary font-medium">{formatPct(marginUsageAfter)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-muted">Equity</span>
                            <div className="text-sm font-medium text-primary flex items-center gap-2">
                                <span className="text-secondary">{formatCurr(equityBefore)}</span>
                                <span className="text-muted">&rarr;</span>
                                <span>{formatCurr(equityAfter)}</span>
                            </div>
                        </div>
                    </div>

                    {withdrawError && (
                        <div className="p-3 bg-danger-bg border border-danger rounded-lg">
                            <p className="text-sm text-danger">{withdrawError}</p>
                        </div>
                    )}

                    {success && (
                        <div className="p-3 bg-success-bg border border-success rounded-lg">
                            <p className="text-sm text-success">Withdrawal initiated successfully! ✓</p>
                        </div>
                    )}


                    <button
                        onClick={handleWithdraw}
                        disabled={isWithdrawing || !isValidAmount || amountValue <= 0 || !evmAddress}
                        className="w-full py-3.5 btn btn-primary rounded-xl font-medium text-[15px] transition-all bg-brand text-white hover:opacity-90 disabled:bg-hover disabled:text-muted disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
                    >
                        {isWithdrawing ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Processing...
                            </>
                        ) : !evmAddress ? (
                            'Connect EVM Wallet'
                        ) : (
                            'Withdraw'
                        )}
                    </button>

                    <div className="h-2"></div>
                </div>
            </div>
        </div>
    );
};
