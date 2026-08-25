/* eslint-disable react-refresh/only-export-components */
import {
    Activity,
    BarChart3,
    Minus,
    Sigma,
    Slash,
    Square,
    TrendingUp,
    Type,
} from 'lucide-react';

import type { ToolCategory } from '../types';

export const TOOL_CATEGORIES: ToolCategory[] = [
    {
        id: 'lines',
        label: 'Trend Line Tools',
        icon: <Slash className="w-4 h-4" />,
        sections: [
            {
                header: 'TREND LINES',
                tools: [
                    { id: 'trend-line', label: 'Trend Line', icon: <Slash className="w-4 h-4" /> },
                    { id: 'ray', label: 'Ray', icon: <TrendingUp className="w-4 h-4" /> },
                    { id: 'extended-line', label: 'Extended Line', icon: <Minus className="w-4 h-4" /> },
                    { id: 'trend-angle', label: 'Trend Angle', icon: <TrendingUp className="w-4 h-4 rotate-45" /> },
                    { id: 'info-line', label: 'Info Line', icon: <Activity className="w-4 h-4" /> },
                    { id: 'horizontal-line', label: 'Horizontal Line', icon: <Minus className="w-4 h-4" /> },
                    { id: 'horizontal-ray', label: 'Horizontal Ray', icon: <Minus className="w-4 h-4 opacity-70" /> },
                    { id: 'vertical-line', label: 'Vertical Line', icon: <Minus className="w-4 h-4 rotate-90" /> },
                    { id: 'cross-line', label: 'Cross Line', icon: <TrendingUp className="w-4 h-4 opacity-50" /> },
                    { id: 'arrow', label: 'Arrow', icon: <TrendingUp className="w-4 h-4 rotate-45" /> },
                ],
            },
        ],
    },
    {
        id: 'fibonacci',
        label: 'Gann and Fibonacci Tools',
        icon: <Activity className="w-4 h-4" />,
        sections: [
            {
                header: 'FIBONACCI',
                tools: [
                    { id: 'fibonacci-retracement', label: 'Fib Retracement', icon: <Activity className="w-4 h-4" /> },
                    { id: 'fib-channel', label: 'Fib Channel', icon: <TrendingUp className="w-4 h-4" /> },
                    { id: 'fib-circles', label: 'Fib Circles', icon: <Sigma className="w-4 h-4" /> },
                    { id: 'fib-arcs', label: 'Fib Arcs', icon: <Activity className="w-4 h-4" /> },
                    { id: 'fib-extension', label: 'Fib Extension', icon: <Activity className="w-4 h-4" /> },
                    { id: 'fib-speed-fan', label: 'Fib Speed Resistance Fan', icon: <TrendingUp className="w-4 h-4" /> },
                    { id: 'fib-spiral', label: 'Fib Spiral', icon: <Sigma className="w-4 h-4" /> },
                    { id: 'fib-time-extension', label: 'Trend-Based Fib Time Extension', icon: <Activity className="w-4 h-4" /> },
                    { id: 'fib-time-zone', label: 'Fib Time Zone', icon: <Activity className="w-4 h-4" /> },
                    { id: 'fib-wedge', label: 'Fib Wedge', icon: <TrendingUp className="w-4 h-4 rotate-45" /> },
                ],
            },
            {
                header: 'GANN',
                tools: [
                    { id: 'gann-box', label: 'Gann Box', icon: <Square className="w-4 h-4" /> },
                    { id: 'gann-fan', label: 'Gann Fan', icon: <TrendingUp className="w-4 h-4 rotate-45" /> },
                    { id: 'gann-square', label: 'Gann Square', icon: <Square className="w-4 h-4" /> },
                    { id: 'gann-square-fixed', label: 'Gann Square Fixed', icon: <Square className="w-4 h-4" /> },
                ],
            },
            {
                header: 'PITCHFORKS',
                tools: [
                    { id: 'andrews-pitchfork', label: 'Andrews Pitchfork', icon: <Activity className="w-4 h-4 rotate-90" /> },
                    { id: 'schiff-pitchfork', label: 'Schiff Pitchfork', icon: <Activity className="w-4 h-4 rotate-90" /> },
                    { id: 'modified-schiff-pitchfork', label: 'Modified Schiff Pitchfork', icon: <Activity className="w-4 h-4 rotate-90" /> },
                    { id: 'inside-pitchfork', label: 'Inside Pitchfork', icon: <Activity className="w-4 h-4 rotate-90" /> },
                    { id: 'pitchfan', label: 'Pitchfan', icon: <TrendingUp className="w-4 h-4 rotate-45" /> },
                ],
            },
        ],
    },
    {
        id: 'channels',
        label: 'Channel Tools',
        icon: <TrendingUp className="w-4 h-4" />,
        sections: [
            {
                header: 'CHANNELS',
                tools: [
                    { id: 'parallel-channel', label: 'Parallel Channel', icon: <TrendingUp className="w-4 h-4" /> },
                    { id: 'disjoint-channel', label: 'Disjoint Channel', icon: <Activity className="w-4 h-4" /> },
                    { id: 'regression-trend', label: 'Regression Trend', icon: <TrendingUp className="w-4 h-4 opacity-80" /> },
                    { id: 'flat-top-bottom', label: 'Flat Top/Bottom', icon: <Minus className="w-4 h-4" /> },
                ],
            },
        ],
    },
    {
        id: 'shapes',
        label: 'Geometric Shapes',
        icon: <Square className="w-4 h-4" />,
        sections: [
            {
                header: 'GEOMETRIC SHAPES',
                tools: [
                    { id: 'rectangle', label: 'Rectangle', icon: <Square className="w-4 h-4" /> },
                    { id: 'circle', label: 'Circle', icon: <Sigma className="w-4 h-4" /> },
                    { id: 'ellipse', label: 'Ellipse', icon: <Sigma className="w-4 h-4" /> },
                    { id: 'triangle', label: 'Triangle', icon: <Square className="w-4 h-4" /> },
                    { id: 'rotated-rectangle', label: 'Rotated Rectangle', icon: <Square className="w-4 h-4" /> },
                    { id: 'arc', label: 'Arc', icon: <Activity className="w-4 h-4" /> },
                ],
            },
            {
                header: 'PATH TOOLS',
                tools: [
                    { id: 'curve', label: 'Curve', icon: <Slash className="w-4 h-4 rotate-45" /> },
                    { id: 'double-curve', label: 'Double Curve', icon: <Activity className="w-4 h-4" /> },
                    { id: 'brush', label: 'Brush', icon: <Slash className="w-4 h-4" /> },
                    { id: 'highlighter', label: 'Highlighter', icon: <Slash className="w-4 h-4" /> },
                    { id: 'path', label: 'Path', icon: <Activity className="w-4 h-4" /> },
                    { id: 'polyline', label: 'Polyline', icon: <Activity className="w-4 h-4" /> },
                ],
            },
        ],
    },
    {
        id: 'annotations',
        label: 'Annotation and Measurement Tools',
        icon: <Type className="w-4 h-4" />,
        sections: [
            {
                header: 'ANNOTATIONS',
                tools: [
                    { id: 'text', label: 'Text', icon: <Type className="w-4 h-4" /> },
                    { id: 'anchored-text', label: 'Anchored Text', icon: <Type className="w-4 h-4 opacity-50" /> },
                    { id: 'callout', label: 'Callout', icon: <Type className="w-4 h-4 opacity-70" /> },
                    { id: 'comment', label: 'Comment', icon: <Type className="w-4 h-4" /> },
                    { id: 'price-label', label: 'Price Label', icon: <Type className="w-4 h-4" /> },
                    { id: 'price-note', label: 'Price Note', icon: <Type className="w-4 h-4" /> },
                    { id: 'note', label: 'Note', icon: <Type className="w-4 h-4" /> },
                    { id: 'pin', label: 'Pin', icon: <Type className="w-4 h-4" /> },
                    { id: 'signpost', label: 'Signpost', icon: <Type className="w-4 h-4" /> },
                    { id: 'table', label: 'Table', icon: <Type className="w-4 h-4" /> },
                    { id: 'flag-mark', label: 'Flag Mark', icon: <Type className="w-4 h-4" /> },
                ],
            },
            {
                header: 'TRADING & MEASUREMENT',
                tools: [
                    { id: 'long-position', label: 'Long Position', icon: <TrendingUp className="w-4 h-4 text-emerald-500" /> },
                    { id: 'short-position', label: 'Short Position', icon: <TrendingUp className="w-4 h-4 rotate-180 text-rose-500" /> },
                    { id: 'date-price-range', label: 'Date/Price Range', icon: <Activity className="w-4 h-4" /> },
                    { id: 'date-range', label: 'Date Range', icon: <Activity className="w-4 h-4" /> },
                    { id: 'price-range', label: 'Price Range', icon: <Activity className="w-4 h-4" /> },
                    { id: 'bars-pattern', label: 'Bars Pattern', icon: <BarChart3 className="w-4 h-4" /> },
                    { id: 'arrow-marker', label: 'Arrow Marker', icon: <TrendingUp className="w-4 h-4 rotate-90" /> },
                    { id: 'arrow-markup', label: 'Buy Signal', icon: <TrendingUp className="w-4 h-4 text-emerald-500" /> },
                    { id: 'arrow-markdown', label: 'Sell Signal', icon: <TrendingUp className="w-4 h-4 rotate-180 text-rose-500" /> },
                    { id: 'forecast', label: 'Forecast', icon: <Activity className="w-4 h-4" /> },
                    { id: 'projection', label: 'Projection', icon: <TrendingUp className="w-4 h-4" /> },
                ],
            },
        ],
    },
];

// ---- Anchor-count sets (used by getRequiredAnchors) ----
export const ANCHOR_COUNT_1 = new Set([
    'horizontal-line', 'horizontal-ray', 'vertical-line', 'cross-line',
    'text', 'text-annotation', 'arrow-marker', 'arrow-markup', 'arrow-markdown',
    'comment', 'price-label', 'price-note', 'flag-mark', 'note', 'pin',
    'signpost', 'table',
]);

export const ANCHOR_COUNT_3 = new Set([
    'parallel-channel', 'andrews-pitchfork', 'fib-channel', 'fib-extension',
    'double-curve', 'bars-pattern', 'arc', 'long-position', 'short-position',
    'rotated-rectangle', 'triangle', 'fib-time-extension', 'schiff-pitchfork',
    'modified-schiff-pitchfork', 'inside-pitchfork', 'pitchfan', 'flat-top-bottom',
]);

export const ANCHOR_COUNT_4 = new Set(['disjoint-channel', 'curve']);

export const FILLED_STYLE_TYPES = new Set([
    'parallel-channel', 'disjoint-channel', 'andrews-pitchfork', 'gann-box',
    'gann-square', 'long-position', 'short-position', 'rotated-rectangle',
    'triangle', 'inside-pitchfork', 'schiff-pitchfork', 'modified-schiff-pitchfork',
    'flat-top-bottom',
]);

export const LIGHT_FILL_TYPES = new Set([
    'circle', 'ellipse', 'date-price-range', 'date-range', 'arc',
    'price-range', 'forecast', 'projection',
]);

export function getRequiredAnchors(type: string): number {
    if (ANCHOR_COUNT_1.has(type)) return 1;
    if (ANCHOR_COUNT_3.has(type)) return 3;
    if (ANCHOR_COUNT_4.has(type)) return 4;
    return 2;
}

export function getFillColor(lineColor: string, alpha = 0.1): string {
    if (lineColor === '#3b82f6') return `rgba(59, 130, 246, ${alpha})`;
    if (lineColor === '#10b981') return `rgba(16, 185, 129, ${alpha})`;
    if (lineColor === '#f43f5e') return `rgba(244, 63, 94, ${alpha})`;
    if (lineColor === '#f59e0b') return `rgba(245, 158, 11, ${alpha})`;
    if (lineColor === '#f97316') return `rgba(249, 115, 22, ${alpha})`;
    if (lineColor === '#ffffff') return `rgba(255, 255, 255, ${alpha})`;
    return `rgba(59, 130, 246, ${alpha})`;
}

export const DRAWING_COLORS = [
    { hex: '#3b82f6', label: 'Blue' },
    { hex: '#10b981', label: 'Green' },
    { hex: '#f43f5e', label: 'Red' },
    { hex: '#f59e0b', label: 'Yellow' },
    { hex: '#f97316', label: 'Orange' },
    { hex: '#ffffff', label: 'White' },
];

export const DRAWING_WIDTHS = [1, 2, 3, 4];

export const TIMEFRAMES: { value: import('../types').CandleResolution; label: string }[] = [
    { value: '1MIN', label: '1m' },
    { value: '5MINS', label: '5m' },
    { value: '15MINS', label: '15m' },
    { value: '30MINS', label: '30m' },
    { value: '1HOUR', label: '1H' },
    { value: '4HOURS', label: '4H' },
    { value: '1DAY', label: '1D' },
];

export const MAX_INDICATORS = 4;

export const INDICATOR_RECALC_THROTTLE_MS = 250;
