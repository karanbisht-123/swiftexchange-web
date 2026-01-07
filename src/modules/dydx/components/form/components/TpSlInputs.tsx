import { useEffect, useState } from 'react';
import type { OrderSideEnum } from '../../../types/trading.types';

interface TpSlInputsProps {
    side: OrderSideEnum;
    entryPrice: number;
    tpPrice: string;
    slPrice: string;
    onChangeTp: (price: string) => void;
    onChangeSl: (price: string) => void;
}

export const TpSlInputs: React.FC<TpSlInputsProps> = ({
    side,
    entryPrice,
    tpPrice,
    slPrice,
    onChangeTp,
    onChangeSl,
}) => {
    const [tpGain, setTpGain] = useState('');
    const [slLoss, setSlLoss] = useState('');

    // Calculate percentages when prices change
    useEffect(() => {
        if (!entryPrice || entryPrice <= 0) return;

        if (tpPrice) {
            const price = parseFloat(tpPrice);
            if (!isNaN(price)) {
                const gain =
                    side === 'BUY'
                        ? ((price - entryPrice) / entryPrice) * 100
                        : ((entryPrice - price) / entryPrice) * 100;
                setTpGain(gain.toFixed(2));
            } else {
                setTpGain('');
            }
        } else {
            setTpGain('');
        }

        if (slPrice) {
            const price = parseFloat(slPrice);
            if (!isNaN(price)) {
                const loss =
                    side === 'BUY'
                        ? ((entryPrice - price) / entryPrice) * 100
                        : ((price - entryPrice) / entryPrice) * 100;
                setSlLoss(loss.toFixed(2));
            } else {
                setSlLoss('');
            }
        } else {
            setSlLoss('');
        }
    }, [tpPrice, slPrice, entryPrice, side]);

    const handleTpGainChange = (gainStr: string) => {
        setTpGain(gainStr);
        const gain = parseFloat(gainStr);
        if (!isNaN(gain) && entryPrice > 0) {
            const price =
                side === 'BUY' ? entryPrice * (1 + gain / 100) : entryPrice * (1 - gain / 100);
            onChangeTp(price.toFixed(2)); // basic formatting, ideally usage token precision
        } else {
            onChangeTp('');
        }
    };

    const handleSlLossChange = (lossStr: string) => {
        setSlLoss(lossStr);
        const loss = parseFloat(lossStr);
        if (!isNaN(loss) && entryPrice > 0) {
            const price =
                side === 'BUY' ? entryPrice * (1 - loss / 100) : entryPrice * (1 + loss / 100);
            onChangeSl(price.toFixed(2));
        } else {
            onChangeSl('');
        }
    };

    return (
        <div className="space-y-4 px-4 pt-2 pb-4 border-b border-gray-700/50 bg-gray-800/20 rounded-lg mx-2 my-2">
            <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-gray-300">Take Profit / Stop Loss</div>
            </div>

            {/* Take Profit Row */}
            <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-gray-400">
                    <span>Take Profit</span>
                    <span className="text-green-500 font-medium">Target</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="relative group">
                        <input
                            type="number"
                            value={tpPrice}
                            onChange={(e) => onChangeTp(e.target.value)}
                            placeholder="Price"
                            className="w-full bg-gray-900/50 border border-gray-700 group-hover:border-gray-600 rounded-lg px-3 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
                        />
                        <span className="absolute right-3 top-2.5 text-[10px] text-gray-500 pointer-events-none">$</span>
                    </div>
                    <div className="relative group">
                        <input
                            type="number"
                            value={tpGain}
                            onChange={(e) => handleTpGainChange(e.target.value)}
                            placeholder="Gain"
                            className="w-full bg-gray-900/50 border border-gray-700 group-hover:border-gray-600 rounded-lg px-3 py-2.5 text-xs text-green-400 placeholder-gray-600 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20 transition-all text-right pr-8"
                        />
                        <span className="absolute right-3 top-2.5 text-[10px] text-gray-500 pointer-events-none">%</span>
                    </div>
                </div>
            </div>

            {/* Stop Loss Row */}
            <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-gray-400">
                    <span>Stop Loss</span>
                    <span className="text-red-500 font-medium">Protection</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="relative group">
                        <input
                            type="number"
                            value={slPrice}
                            onChange={(e) => onChangeSl(e.target.value)}
                            placeholder="Price"
                            className="w-full bg-gray-900/50 border border-gray-700 group-hover:border-gray-600 rounded-lg px-3 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 transition-all"
                        />
                        <span className="absolute right-3 top-2.5 text-[10px] text-gray-500 pointer-events-none">$</span>
                    </div>
                    <div className="relative group">
                        <input
                            type="number"
                            value={slLoss}
                            onChange={(e) => handleSlLossChange(e.target.value)}
                            placeholder="Loss"
                            className="w-full bg-gray-900/50 border border-gray-700 group-hover:border-gray-600 rounded-lg px-3 py-2.5 text-xs text-red-400 placeholder-gray-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 transition-all text-right pr-8"
                        />
                        <span className="absolute right-3 top-2.5 text-[10px] text-gray-500 pointer-events-none">%</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
