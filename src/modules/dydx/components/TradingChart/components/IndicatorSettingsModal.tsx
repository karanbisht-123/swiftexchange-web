import { memo } from 'react';
import { Settings, X } from 'lucide-react';
import { indicatorRegistry } from 'lightweight-charts-indicators';

import type { ActiveIndicator } from '../types';

const SOURCE_OPTIONS = ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'hlcc4'];

export interface IndicatorSettingsModalProps {
    instanceId: string | null;
    active: ActiveIndicator | undefined;
    onClose: () => void;
    onChangeField: (fieldId: string, val: any) => void;
    onChangeColor: (color: string) => void;
}

export const IndicatorSettingsModal = memo(function IndicatorSettingsModal({
    instanceId,
    active,
    onClose,
    onChangeField,
    onChangeColor,
}: IndicatorSettingsModalProps) {
    if (!instanceId || !active) return null;
    const entry = indicatorRegistry.find(ind => ind.id === active.indicatorId);
    if (!entry) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 select-none">
            <div className="bg-secondary border border-color rounded-xl w-80 shadow-2xl p-5 relative text-primary animate-fade-in pointer-events-auto">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1 hover:bg-hover rounded-md text-gray-400 hover:text-primary transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>

                <h3 className="text-sm font-bold border-b border-color pb-2 pr-8 mb-4 uppercase tracking-wider text-primary flex items-center gap-2">
                    <Settings className="w-4 h-4 text-brand" />
                    {entry.name} Settings
                </h3>

                <div className="space-y-4 mb-5 max-h-80 overflow-y-auto pr-1">
                    {entry.group !== 'candlestick' && (
                        <div className="flex flex-col gap-1.5 pb-3 border-b border-color/40">
                            <label className="text-[10px] uppercase font-bold text-muted">Plot Color</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={active.color}
                                    onChange={e => onChangeColor(e.target.value)}
                                    className="w-10 h-7 rounded border border-color cursor-pointer bg-transparent"
                                />
                                <span className="text-xs font-mono font-semibold uppercase">{active.color}</span>
                            </div>
                        </div>
                    )}

                    {entry.inputConfig.map(input => {
                        const val = active.inputs[input.id] ?? input.defval;

                        if (input.type === 'bool') {
                            return (
                                <div key={input.id} className="flex items-center justify-between py-1">
                                    <label
                                        className="text-[10px] uppercase font-bold text-muted cursor-pointer select-none"
                                        htmlFor={`input-${input.id}`}
                                    >
                                        {input.title || input.id}
                                    </label>
                                    <button
                                        id={`input-${input.id}`}
                                        onClick={() => onChangeField(input.id, !val)}
                                        className={`w-9 h-5 rounded-full transition-colors ${val ? 'bg-brand' : 'bg-gray-600'
                                            } relative shrink-0`}
                                    >
                                        <div
                                            className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${val ? 'translate-x-4.5' : 'translate-x-0.5'
                                                }`}
                                        />
                                    </button>
                                </div>
                            );
                        }

                        if (input.type === 'int' || input.type === 'float') {
                            return (
                                <div key={input.id} className="flex flex-col gap-1.5">
                                    <label className="text-[10px] uppercase font-bold text-muted">
                                        {input.title || input.id}
                                    </label>
                                    <input
                                        type="number"
                                        value={val}
                                        onChange={e => {
                                            const parsed =
                                                input.type === 'int'
                                                    ? parseInt(e.target.value, 10)
                                                    : parseFloat(e.target.value);
                                            onChangeField(input.id, isNaN(parsed) ? input.defval : parsed);
                                        }}
                                        className="w-full bg-primary border border-color rounded px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-brand text-primary"
                                        step={input.step ?? (input.type === 'float' ? 0.1 : 1)}
                                        min={input.min}
                                        max={input.max}
                                    />
                                </div>
                            );
                        }

                        if (input.type === 'source') {
                            return (
                                <div key={input.id} className="flex flex-col gap-1.5">
                                    <label className="text-[10px] uppercase font-bold text-muted">
                                        {input.title || input.id}
                                    </label>
                                    <select
                                        value={val}
                                        onChange={e => onChangeField(input.id, e.target.value)}
                                        className="w-full bg-primary border border-color rounded px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-brand text-primary appearance-none cursor-pointer"
                                    >
                                        {SOURCE_OPTIONS.map(opt => (
                                            <option key={opt} value={opt}>
                                                {opt}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            );
                        }

                        if (input.type === 'string') {
                            const options = input.options || [];
                            return (
                                <div key={input.id} className="flex flex-col gap-1.5">
                                    <label className="text-[10px] uppercase font-bold text-muted">
                                        {input.title || input.id}
                                    </label>
                                    {options.length > 0 ? (
                                        <select
                                            value={val}
                                            onChange={e => onChangeField(input.id, e.target.value)}
                                            className="w-full bg-primary border border-color rounded px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-brand text-primary cursor-pointer"
                                        >
                                            {options.map(opt => (
                                                <option key={opt} value={opt}>
                                                    {opt}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            type="text"
                                            value={val}
                                            onChange={e => onChangeField(input.id, e.target.value)}
                                            className="w-full bg-primary border border-color rounded px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-brand text-primary"
                                        />
                                    )}
                                </div>
                            );
                        }

                        if (input.type === 'color') {
                            return (
                                <div key={input.id} className="flex flex-col gap-1.5">
                                    <label className="text-[10px] uppercase font-bold text-muted">
                                        {input.title || input.id}
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={val}
                                            onChange={e => onChangeField(input.id, e.target.value)}
                                            className="w-10 h-7 rounded border border-color cursor-pointer bg-transparent"
                                        />
                                        <span className="text-xs font-mono font-semibold uppercase">{val}</span>
                                    </div>
                                </div>
                            );
                        }

                        return null;
                    })}
                </div>

                <div className="flex justify-end border-t border-color pt-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 bg-brand text-white font-semibold text-xs rounded-lg hover:opacity-90 transition-all shadow-md"
                    >
                        Close Settings
                    </button>
                </div>
            </div>
        </div>
    );
});
