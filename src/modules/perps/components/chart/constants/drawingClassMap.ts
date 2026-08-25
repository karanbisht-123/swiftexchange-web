import * as Drawings from 'lightweight-charts-drawing';

import {
    FILLED_STYLE_TYPES,
    LIGHT_FILL_TYPES,
    getFillColor,
} from './toolCategories';

export const DRAWING_CLASS_MAP: Record<string, any> = {
    'trend-line': Drawings.TrendLine,
    ray: Drawings.Ray,
    'extended-line': Drawings.ExtendedLine,
    'trend-angle': Drawings.TrendAngle,
    'horizontal-line': Drawings.HorizontalLine,
    'horizontal-ray': Drawings.HorizontalRay,
    'vertical-line': Drawings.VerticalLine,
    'cross-line': Drawings.CrossLine,
    'info-line': Drawings.InfoLine,
    'parallel-channel': Drawings.ParallelChannel,
    'disjoint-channel': Drawings.DisjointChannel,
    'regression-trend': Drawings.RegressionTrend,
    'andrews-pitchfork': Drawings.AndrewsPitchfork,
    'fibonacci-retracement': Drawings.FibRetracement,
    'fib-retracement': Drawings.FibRetracement,
    'fib-channel': Drawings.FibChannel,
    'fib-circles': Drawings.FibCircles,
    'fib-arcs': Drawings.FibArcs,
    'fib-extension': Drawings.FibExtension,
    curve: Drawings.Curve,
    'double-curve': Drawings.DoubleCurve,
    arrow: Drawings.Arrow,
    brush: Drawings.Brush,
    callout: Drawings.Callout,
    circle: Drawings.Circle,
    ellipse: Drawings.Ellipse,
    'date-price-range': Drawings.DatePriceRange,
    'date-range': Drawings.DateRange,
    text: Drawings.TextAnnotation,
    'text-annotation': Drawings.TextAnnotation,
    'bars-pattern': Drawings.BarsPattern,
    'anchored-text': Drawings.AnchoredText,
    'arrow-marker': Drawings.ArrowMarker,
    'arrow-markup': Drawings.ArrowMarkUp,
    'arrow-markdown': Drawings.ArrowMarkDown,
    comment: Drawings.Comment,
    arc: Drawings.Arc,
    'gann-box': Drawings.GannBox,
    'gann-fan': Drawings.GannFan,
    'gann-square': Drawings.GannSquare,
    'long-position': Drawings.LongPosition,
    'short-position': Drawings.ShortPosition,
    path: Drawings.Path,
    'price-label': Drawings.PriceLabel,
    'price-note': Drawings.PriceNote,
    'price-range': Drawings.PriceRange,
    'rotated-rectangle': Drawings.RotatedRectangle,
    triangle: Drawings.Triangle,
    'fib-speed-fan': Drawings.FibSpeedFan,
    'fib-spiral': Drawings.FibSpiral,
    'fib-time-extension': Drawings.FibTimeExtension,
    'fib-time-zone': Drawings.FibTimeZone,
    'fib-wedge': Drawings.FibWedge,
    'gann-square-fixed': Drawings.GannSquareFixed,
    'schiff-pitchfork': Drawings.SchiffPitchfork,
    'modified-schiff-pitchfork': Drawings.ModifiedSchiffPitchfork,
    'inside-pitchfork': Drawings.InsidePitchfork,
    pitchfan: Drawings.Pitchfan,
    'flat-top-bottom': Drawings.FlatTopBottom,
    highlighter: Drawings.Highlighter,
    polyline: Drawings.Polyline,
    note: Drawings.Note,
    pin: Drawings.Pin,
    signpost: Drawings.Signpost,
    table: Drawings.Table,
    'flag-mark': Drawings.FlagMark,
    forecast: Drawings.Forecast,
    projection: Drawings.Projection,
};

/**
 * Factory: instantiate a drawing of the given type with sensible default
 * styles + options based on its category (filled shapes, brushes, text, etc).
 */
export function createDrawingInstance(
    type: string,
    id: string,
    points: any[],
    color = '#3b82f6',
    width = 2
) {
    const DrawingClass = DRAWING_CLASS_MAP[type];
    if (!DrawingClass) return null;

    const defaultStyle = { lineColor: color, lineWidth: width };
    let style: any = defaultStyle;
    let options: any = undefined;

    if (FILLED_STYLE_TYPES.has(type)) {
        style = { ...defaultStyle, fillColor: getFillColor(color, 0.05) };
        options = { filled: true };
    } else if (LIGHT_FILL_TYPES.has(type)) {
        style = { ...defaultStyle, fillColor: getFillColor(color, 0.1) };
        options = { filled: true };
    } else if (
        ['fib-channel', 'fib-circles', 'bars-pattern', 'gann-square-fixed'].includes(type)
    ) {
        options = { filled: true };
    } else if (type === 'brush' || type === 'highlighter') {
        style = { lineColor: color };
        options = { brushSize: width * 2 };
    } else if (type === 'path' || type === 'polyline') {
        style = { lineColor: color, lineWidth: width };
    } else if (type === 'callout') {
        options = { text: 'Callout' };
    } else if (type === 'anchored-text') {
        options = { text: 'Text' };
    } else if (type === 'comment') {
        options = { text: 'Comment' };
    } else if (type === 'price-note' || type === 'note') {
        options = { text: 'Note' };
    } else if (type === 'arrow-marker') {
        options = { direction: 'up', size: 15 };
    } else if (['arrow-markup', 'arrow-markdown'].includes(type)) {
        options = { size: 15 };
    } else if (['text', 'text-annotation'].includes(type)) {
        style = {
            lineColor: color,
            lineWidth: width,
            labelColor: color,
            showLabels: true,
        };
    }

    return new DrawingClass(id, points, style, options);
}

/**
 * Re-hydrate a saved drawing from its serialized form (used by DrawingManager
 * when loading drawings from localStorage on chart mount / market switch).
 */
export function hydrateDrawing(type: string, data: any): any | null {
    const DrawingClass = DRAWING_CLASS_MAP[type];
    if (!DrawingClass) return null;
    return new DrawingClass(data.id, data.anchors, data.style, data.options);
}
