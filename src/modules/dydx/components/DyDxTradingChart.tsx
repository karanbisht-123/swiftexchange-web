import {
  Activity,
  BarChart3,
  CandlestickChart,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eraser,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer2,
  Search,
  Settings,
  Sigma,
  Slash,
  Square,
  TrendingUp,
  Type,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts';
import { DrawingManager } from 'lightweight-charts-drawing';
import * as Drawings from 'lightweight-charts-drawing';
import { indicatorRegistry } from 'lightweight-charts-indicators';

import { useThemeStore } from '../../../store/themeStore';
import { type CandleResolution, useRealtimeChart } from '../hooks/useCandles';
import useMarketStore from '../store/marketStore';

type ChartType = 'candlestick' | 'line' | 'area';

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return isMobile;
};

const chartTypeIcons: Record<ChartType, React.ReactNode> = {
  candlestick: <CandlestickChart className="w-4 h-4" />,
  line: <TrendingUp className="w-4 h-4" />,
  area: <BarChart3 className="w-4 h-4" />,
};

function isValidCandle(c: { open: number; high: number; low: number; close: number }): boolean {
  return (
    c.open > 0 &&
    c.high > 0 &&
    c.low > 0 &&
    c.close > 0 &&
    isFinite(c.open) &&
    isFinite(c.high) &&
    isFinite(c.low) &&
    isFinite(c.close)
  );
}

function getPlot(result: any, ...keys: string[]): { time: number; value: number }[] {
  if (!result) return [];
  const plots = result.plots || result;
  for (const key of keys) {
    if (Array.isArray(plots?.[key]) && plots[key].length > 0) {
      return plots[key].filter((d: any) => d && typeof d.value === 'number' && isFinite(d.value));
    }
  }
  return [];
}

function findAt(arr: { time: number; value: number }[], time: number) {
  if (!arr || arr.length === 0) return undefined;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].time === time) return arr[i];
    if (arr[i].time < time) return undefined;
  }
  return undefined;
}

function formatNum(value: number | undefined, digits = 2) {
  if (value === undefined || value === null || !isFinite(value)) return '-';
  return value.toFixed(digits);
}

interface DrawingToolItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface ToolSection {
  header: string;
  tools: DrawingToolItem[];
}

interface ToolCategory {
  id: string;
  label: string;
  icon: React.ReactNode;
  sections: ToolSection[];
}

const TOOL_CATEGORIES: ToolCategory[] = [
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
          {
            id: 'trend-angle',
            label: 'Trend Angle',
            icon: <TrendingUp className="w-4 h-4 rotate-45" />,
          },
          { id: 'info-line', label: 'Info Line', icon: <Activity className="w-4 h-4" /> },
          { id: 'horizontal-line', label: 'Horizontal Line', icon: <Minus className="w-4 h-4" /> },
          {
            id: 'horizontal-ray',
            label: 'Horizontal Ray',
            icon: <Minus className="w-4 h-4 opacity-70" />,
          },
          {
            id: 'vertical-line',
            label: 'Vertical Line',
            icon: <Minus className="w-4 h-4 rotate-90" />,
          },
          {
            id: 'cross-line',
            label: 'Cross Line',
            icon: <TrendingUp className="w-4 h-4 opacity-50" />,
          },
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
          {
            id: 'fibonacci-retracement',
            label: 'Fib Retracement',
            icon: <Activity className="w-4 h-4" />,
          },
          { id: 'fib-channel', label: 'Fib Channel', icon: <TrendingUp className="w-4 h-4" /> },
          { id: 'fib-circles', label: 'Fib Circles', icon: <Sigma className="w-4 h-4" /> },
          { id: 'fib-arcs', label: 'Fib Arcs', icon: <Activity className="w-4 h-4" /> },
          { id: 'fib-extension', label: 'Fib Extension', icon: <Activity className="w-4 h-4" /> },
          {
            id: 'fib-speed-fan',
            label: 'Fib Speed Resistance Fan',
            icon: <TrendingUp className="w-4 h-4" />,
          },
          { id: 'fib-spiral', label: 'Fib Spiral', icon: <Sigma className="w-4 h-4" /> },
          {
            id: 'fib-time-extension',
            label: 'Trend-Based Fib Time Extension',
            icon: <Activity className="w-4 h-4" />,
          },
          { id: 'fib-time-zone', label: 'Fib Time Zone', icon: <Activity className="w-4 h-4" /> },
          {
            id: 'fib-wedge',
            label: 'Fib Wedge',
            icon: <TrendingUp className="w-4 h-4 rotate-45" />,
          },
        ],
      },
      {
        header: 'GANN',
        tools: [
          { id: 'gann-box', label: 'Gann Box', icon: <Square className="w-4 h-4" /> },
          { id: 'gann-fan', label: 'Gann Fan', icon: <TrendingUp className="w-4 h-4 rotate-45" /> },
          { id: 'gann-square', label: 'Gann Square', icon: <Square className="w-4 h-4" /> },
          {
            id: 'gann-square-fixed',
            label: 'Gann Square Fixed',
            icon: <Square className="w-4 h-4" />,
          },
        ],
      },
      {
        header: 'PITCHFORKS',
        tools: [
          {
            id: 'andrews-pitchfork',
            label: 'Andrews Pitchfork',
            icon: <Activity className="w-4 h-4 rotate-90" />,
          },
          {
            id: 'schiff-pitchfork',
            label: 'Schiff Pitchfork',
            icon: <Activity className="w-4 h-4 rotate-90" />,
          },
          {
            id: 'modified-schiff-pitchfork',
            label: 'Modified Schiff Pitchfork',
            icon: <Activity className="w-4 h-4 rotate-90" />,
          },
          {
            id: 'inside-pitchfork',
            label: 'Inside Pitchfork',
            icon: <Activity className="w-4 h-4 rotate-90" />,
          },
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
          {
            id: 'parallel-channel',
            label: 'Parallel Channel',
            icon: <TrendingUp className="w-4 h-4" />,
          },
          {
            id: 'disjoint-channel',
            label: 'Disjoint Channel',
            icon: <Activity className="w-4 h-4" />,
          },
          {
            id: 'regression-trend',
            label: 'Regression Trend',
            icon: <TrendingUp className="w-4 h-4 opacity-80" />,
          },
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
          {
            id: 'rotated-rectangle',
            label: 'Rotated Rectangle',
            icon: <Square className="w-4 h-4" />,
          },
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
          {
            id: 'anchored-text',
            label: 'Anchored Text',
            icon: <Type className="w-4 h-4 opacity-50" />,
          },
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
          {
            id: 'long-position',
            label: 'Long Position',
            icon: <TrendingUp className="w-4 h-4 text-emerald-500" />,
          },
          {
            id: 'short-position',
            label: 'Short Position',
            icon: <TrendingUp className="w-4 h-4 rotate-180 text-rose-500" />,
          },
          {
            id: 'date-price-range',
            label: 'Date/Price Range',
            icon: <Activity className="w-4 h-4" />,
          },
          { id: 'date-range', label: 'Date Range', icon: <Activity className="w-4 h-4" /> },
          { id: 'price-range', label: 'Price Range', icon: <Activity className="w-4 h-4" /> },
          { id: 'bars-pattern', label: 'Bars Pattern', icon: <BarChart3 className="w-4 h-4" /> },
          {
            id: 'arrow-marker',
            label: 'Arrow Marker',
            icon: <TrendingUp className="w-4 h-4 rotate-90" />,
          },
          {
            id: 'arrow-markup',
            label: 'Buy Signal',
            icon: <TrendingUp className="w-4 h-4 text-emerald-500" />,
          },
          {
            id: 'arrow-markdown',
            label: 'Sell Signal',
            icon: <TrendingUp className="w-4 h-4 rotate-180 text-rose-500" />,
          },
          { id: 'forecast', label: 'Forecast', icon: <Activity className="w-4 h-4" /> },
          { id: 'projection', label: 'Projection', icon: <TrendingUp className="w-4 h-4" /> },
        ],
      },
    ],
  },
];

function getRequiredAnchors(type: string): number {
  switch (type) {
    case 'horizontal-line':
    case 'horizontal-ray':
    case 'vertical-line':
    case 'cross-line':
    case 'text':
    case 'text-annotation':
    case 'arrow-marker':
    case 'arrow-markup':
    case 'arrow-markdown':
    case 'comment':
    case 'price-label':
    case 'price-note':
    case 'flag-mark':
    case 'note':
    case 'pin':
    case 'signpost':
    case 'table':
      return 1;
    case 'trend-line':
    case 'ray':
    case 'extended-line':
    case 'trend-angle':
    case 'info-line':
    case 'fibonacci-retracement':
    case 'fib-retracement':
    case 'rectangle':
    case 'circle':
    case 'ellipse':
    case 'arrow':
    case 'brush':
    case 'callout':
    case 'date-price-range':
    case 'date-range':
    case 'price-range':
    case 'fib-circles':
    case 'fib-arcs':
    case 'regression-trend':
    case 'anchored-text':
    case 'gann-box':
    case 'gann-fan':
    case 'gann-square':
    case 'path':
    case 'fib-speed-fan':
    case 'fib-spiral':
    case 'fib-time-zone':
    case 'fib-wedge':
    case 'gann-square-fixed':
    case 'highlighter':
    case 'polyline':
    case 'forecast':
    case 'projection':
      return 2;
    case 'parallel-channel':
    case 'andrews-pitchfork':
    case 'fib-channel':
    case 'fib-extension':
    case 'double-curve':
    case 'bars-pattern':
    case 'arc':
    case 'long-position':
    case 'short-position':
    case 'rotated-rectangle':
    case 'triangle':
    case 'fib-time-extension':
    case 'schiff-pitchfork':
    case 'modified-schiff-pitchfork':
    case 'inside-pitchfork':
    case 'pitchfan':
    case 'flat-top-bottom':
      return 3;
    case 'disjoint-channel':
    case 'curve':
      return 4;
    default:
      return 2;
  }
}

function getFillColor(lineColor: string, alpha = 0.1): string {
  if (lineColor === '#3b82f6') return `rgba(59, 130, 246, ${alpha})`;
  if (lineColor === '#10b981') return `rgba(16, 185, 129, ${alpha})`;
  if (lineColor === '#f43f5e') return `rgba(244, 63, 94, ${alpha})`;
  if (lineColor === '#f59e0b') return `rgba(245, 158, 11, ${alpha})`;
  if (lineColor === '#f97316') return `rgba(249, 115, 22, ${alpha})`;
  if (lineColor === '#ffffff') return `rgba(255, 255, 255, ${alpha})`;
  return `rgba(59, 130, 246, ${alpha})`;
}

const DRAWING_CLASS_MAP: Record<string, any> = {
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

function createDrawingInstance(
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

  if (
    [
      'parallel-channel',
      'disjoint-channel',
      'andrews-pitchfork',
      'gann-box',
      'gann-square',
      'long-position',
      'short-position',
      'rotated-rectangle',
      'triangle',
      'inside-pitchfork',
      'schiff-pitchfork',
      'modified-schiff-pitchfork',
      'flat-top-bottom',
    ].includes(type)
  ) {
    style = { ...defaultStyle, fillColor: getFillColor(color, 0.05) };
    options = { filled: true };
  } else if (
    [
      'circle',
      'ellipse',
      'date-price-range',
      'date-range',
      'arc',
      'price-range',
      'forecast',
      'projection',
    ].includes(type)
  ) {
    style = { ...defaultStyle, fillColor: getFillColor(color, 0.1) };
    options = { filled: true };
  } else if (['fib-channel', 'fib-circles', 'bars-pattern', 'gann-square-fixed'].includes(type)) {
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

interface LegendData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePct: number;
  // Index signature for dynamic indicators
  [key: string]: any;
}

interface ActiveIndicator {
  instanceId: string;
  indicatorId: string;
  inputs: Record<string, any>;
  color: string;
  visible?: boolean;
}

export default function DyDxTradingChart() {
  const isDark = useThemeStore(s => s.theme) === 'dark';
  const isMobile = useIsMobile();
  const [timeframe, setTimeframe] = useState<CandleResolution>(() => {
    try {
      return (localStorage.getItem('dydx_chart_timeframe') as CandleResolution) || '15MINS';
    } catch {
      return '15MINS';
    }
  });
  const [chartType, setChartType] = useState<ChartType>(() => {
    try {
      return (localStorage.getItem('dydx_chart_type') as ChartType) || 'candlestick';
    } catch {
      return 'candlestick';
    }
  });
  const [showVolume, setShowVolume] = useState(() => {
    try {
      const saved = localStorage.getItem('dydx_chart_show_volume');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [showGrid, setShowGrid] = useState(() => {
    try {
      const saved = localStorage.getItem('dydx_chart_show_grid');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [showCrosshair, setShowCrosshair] = useState(() => {
    try {
      const saved = localStorage.getItem('dydx_chart_show_crosshair');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showChartTypeMenu, setShowChartTypeMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [activeDrawTool, setActiveDrawTool] = useState<string | null>(null);
  const [legend, setLegend] = useState<LegendData | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // UI state toggles
  const [showDrawingToolbar, setShowDrawingToolbar] = useState(true);
  const [showIndicatorPills, setShowIndicatorPills] = useState(true);

  // Dynamic Indicator Management States
  const [activeIndicators, setActiveIndicators] = useState<ActiveIndicator[]>(() => {
    try {
      const saved = localStorage.getItem('dydx_active_indicators');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, 4);
        }
      }
      return [];
    } catch {
      return [];
    }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);

  // Custom active drawing styles and price scale mode
  const [isLogScale, setIsLogScale] = useState(() => {
    try {
      const saved = localStorage.getItem('dydx_chart_is_log_scale');
      return saved !== null ? saved === 'true' : false;
    } catch {
      return false;
    }
  });
  const [activeDrawingColor, setActiveDrawingColor] = useState('#3b82f6');
  const [activeDrawingWidth, setActiveDrawingWidth] = useState(2);

  // References and effects for saving settings to localStorage
  const { selectedMarket } = useMarketStore();
  const selectedMarketRef = useRef(selectedMarket);
  const isSwitchingMarketRef = useRef(false);

  useEffect(() => {
    selectedMarketRef.current = selectedMarket;
  }, [selectedMarket]);

  useEffect(() => {
    try {
      localStorage.setItem('dydx_chart_timeframe', timeframe);
    } catch {}
  }, [timeframe]);

  useEffect(() => {
    try {
      localStorage.setItem('dydx_chart_type', chartType);
    } catch {}
  }, [chartType]);

  useEffect(() => {
    try {
      localStorage.setItem('dydx_chart_show_volume', String(showVolume));
    } catch {}
  }, [showVolume]);

  useEffect(() => {
    try {
      localStorage.setItem('dydx_chart_show_grid', String(showGrid));
    } catch {}
  }, [showGrid]);

  useEffect(() => {
    try {
      localStorage.setItem('dydx_chart_show_crosshair', String(showCrosshair));
    } catch {}
  }, [showCrosshair]);

  useEffect(() => {
    try {
      localStorage.setItem('dydx_chart_is_log_scale', String(isLogScale));
    } catch {}
  }, [isLogScale]);

  useEffect(() => {
    try {
      localStorage.setItem('dydx_active_indicators', JSON.stringify(activeIndicators));
    } catch {}
  }, [activeIndicators]);

  const addIndicator = (registryId: string) => {
    if (activeIndicators.length >= 4) {
      alert("Maximum of 4 indicators allowed at a single time.");
      return;
    }
    const entry = indicatorRegistry.find(ind => ind.id === registryId);
    if (!entry) return;

    const defaultInputs: Record<string, any> = {};
    entry.inputConfig.forEach(input => {
      defaultInputs[input.id] = input.defval;
    });

    const newIndicator: ActiveIndicator = {
      instanceId: `${registryId}-${Date.now()}`,
      indicatorId: registryId,
      inputs: defaultInputs,
      color: entry.plotConfig[0]?.color || '#3b82f6',
    };

    setActiveIndicators(prev => [...prev, newIndicator]);
  };

  const removeIndicator = (instanceId: string) => {
    setActiveIndicators(prev => prev.filter(ind => ind.instanceId !== instanceId));
    if (editingInstanceId === instanceId) {
      setEditingInstanceId(null);
    }
  };

  const toggleIndicatorVisibility = (instanceId: string) => {
    setActiveIndicators(prev =>
      prev.map(ind => {
        if (ind.instanceId === instanceId) {
          return { ...ind, visible: ind.visible === false ? true : false };
        }
        return ind;
      })
    );
  };

  // Chart refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const markersPluginRef = useRef<any>(null);

  // Dynamic indicator series refs and results
  const activeSeriesRefs = useRef<
    Map<string, { seriesList: ISeriesApi<any>[]; paneIndex?: number }>
  >(new Map());
  const lastIndicatorResults = useRef<Map<string, any>>(new Map());

  // Data refs
  const drawingManagerRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const activeDrawingRef = useRef<any>(null);
  const isPlacingRef = useRef<boolean>(false);
  const placingAnchorIndexRef = useRef<number>(0);

  const lastCandleDataRef = useRef<any[]>([]);

  const { candles, latestCandle, isLoading, isFetchingMore, error, fetchMore } = useRealtimeChart(
    selectedMarket,
    timeframe,
    1000
  );

  const lastDatasetIdRef = useRef('');
  const lastBarTimeRef = useRef<number>(0);
  const prevMarketRef = useRef<string>('');
  const prevTimeframeRef = useRef<CandleResolution | null>(null);

  const setVisibleRange = useCallback(
    (chart: IChartApi, dataLength: number) => {
      if (dataLength === 0) return;
      const visibleBars = isMobile ? 45 : 80;
      if (dataLength > visibleBars) {
        chart
          .timeScale()
          .setVisibleLogicalRange({ from: dataLength - visibleBars, to: dataLength + 3 });
      } else {
        chart.timeScale().fitContent();
      }
    },
    [isMobile]
  );

  const getThemeColors = useCallback(() => {
    if (isDark) {
      return {
        background: '#0f1528',
        textColor: '#e8edf8',
        gridColor: '#1e28405d',
        borderColor: '#1e2840',
        upColor: '#0ecb81',
        downColor: '#ff4d4d',
        volumeColor: 'rgba(128, 128, 128, 0.2)',
        crosshairColor: '#4a5680',
      };
    }
    return {
      background: '#f7f8fc',
      textColor: '#0f1729',
      gridColor: '#dce3ed',
      borderColor: '#e4e8f0',
      upColor: '#00b074',
      downColor: '#ff3b30',
      volumeColor: 'rgba(107, 114, 128, 0.2)',
      crosshairColor: '#8896b3',
    };
  }, [isDark]);

  const isFetchingMoreRef = useRef(false);
  useEffect(() => {
    isFetchingMoreRef.current = isFetchingMore;
  }, [isFetchingMore]);

  const candlesRef = useRef(candles);
  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  const buildLegend = useCallback(
    (time?: number): LegendData | null => {
      const candleData = lastCandleDataRef.current;
      if (!candleData.length) return null;

      let idx = candleData.length - 1;
      if (time !== undefined) {
        const found = candleData.findIndex(c => c.time === time);
        if (found >= 0) idx = found;
      }

      const bar = candleData[idx];
      const prev = candleData[idx - 1];
      const change = prev ? bar.close - prev.close : 0;
      const changePct = prev && prev.close ? (change / prev.close) * 100 : 0;

      const data: LegendData = {
        time: bar.time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        change,
        changePct,
      };

      activeIndicators.forEach(active => {
        const result = lastIndicatorResults.current.get(active.instanceId);
        if (result && typeof result.legend === 'function') {
          data[active.instanceId] = result.legend(bar.time);
        }
      });

      return data;
    },
    [activeIndicators]
  );

  const applyIndicators = useCallback(
    (candleData: any[]) => {
      if (candleData.length === 0) return;

      const candlestickMarkersMap = new Map<string, any[]>();

      activeIndicators.forEach(active => {
        const entry = indicatorRegistry.find(ind => ind.id === active.indicatorId);
        if (!entry) return;

        const seriesVal = activeSeriesRefs.current.get(active.instanceId);
        if (!seriesVal) return;

        try {
          const result = entry.calculate(candleData, active.inputs);
          lastIndicatorResults.current.set(active.instanceId, result);

          if (entry.group === 'candlestick' || (result && result.markers)) {
            console.log(
              `[Chart] Active indicator calculated: ID=${active.indicatorId}, group=${entry.group}, markerCount=${result?.markers?.length || 0}`,
              result?.markers
            );
          }

          if (active.visible !== false && result && Array.isArray(result.markers)) {
            candlestickMarkersMap.set(active.instanceId, result.markers);
          }

          if (entry.group !== 'candlestick') {
            let seriesIndex = 0;
            (entry.plotConfig || []).forEach(plot => {
              const series = seriesVal.seriesList[seriesIndex++];
              if (!series) return;

              series.applyOptions({ visible: active.visible !== false });
              const plotData = getPlot(result, plot.id);
              series.setData(plotData);
            });

            if (entry.plotCandleConfig) {
              entry.plotCandleConfig.forEach(pc => {
                const series = seriesVal.seriesList[seriesIndex++];
                if (!series) return;

                series.applyOptions({ visible: active.visible !== false });
                const candlePlotData = result.candles?.[pc.id] || [];
                series.setData(candlePlotData);
              });
            }
          }
        } catch (err) {
          console.error(`[Chart] Indicator calculation error (${active.indicatorId}):`, err);
          seriesVal.seriesList.forEach(series => {
            series.setData([]);
          });
        }
      });

      if (seriesRef.current) {
        let combinedMarkers: any[] = [];
        candlestickMarkersMap.forEach(markers => {
          combinedMarkers = combinedMarkers.concat(markers);
        });

        combinedMarkers.sort((a, b) => a.time - b.time);

        const mappedMarkers = combinedMarkers.map(m => {
          let position = 'aboveBar';
          if (m.position === 'belowBar') position = 'belowBar';
          else if (m.position === 'inBar') position = 'inBar';

          let shape = 'arrowDown';
          if (m.shape === 'arrowUp' || m.shape === 'triangleUp') shape = 'arrowUp';
          else if (m.shape === 'arrowDown' || m.shape === 'triangleDown') shape = 'arrowDown';
          else if (m.shape === 'circle') shape = 'circle';
          else if (m.shape === 'square') shape = 'square';

          return {
            time: m.time,
            position: position as any,
            shape: shape as any,
            color: m.color || '#fbbf24',
            text: m.text || '',
          };
        });

        try {
          if (markersPluginRef.current) {
            markersPluginRef.current.setMarkers(mappedMarkers);
          } else {
            markersPluginRef.current = createSeriesMarkers(seriesRef.current, mappedMarkers);
          }
        } catch (err) {
          console.error('[Chart] Error setting candlestick markers:', err);
        }
      }
    },
    [activeIndicators]
  );

  //Sync Active Indicators Series
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;
    const activeIds = new Set(activeIndicators.map(a => a.instanceId));
    activeSeriesRefs.current.forEach((val, instId) => {
      if (!activeIds.has(instId)) {
        val.seriesList.forEach(series => {
          try {
            chart.removeSeries(series);
          } catch {}
        });
        activeSeriesRefs.current.delete(instId);
        lastIndicatorResults.current.delete(instId);
      }
    });

    // 2. Create series for new active indicators
    let nextPaneIndex = 1;
    const colors = getThemeColors();

    activeIndicators.forEach(active => {
      const entry = indicatorRegistry.find(ind => ind.id === active.indicatorId);
      if (!entry) return;

      if (!activeSeriesRefs.current.has(active.instanceId)) {
        const isOverlay = entry.overlay;
        const paneIndex = isOverlay ? 0 : nextPaneIndex++;
        const seriesList: ISeriesApi<any>[] = [];

        if (entry.group === 'candlestick') {
          activeSeriesRefs.current.set(active.instanceId, { seriesList: [], paneIndex });
        } else {
          (entry.plotConfig || []).forEach(plot => {
            let series: ISeriesApi<any>;
            const isHistogram = plot.style === 'histogram' || plot.style === 'columns';

            if (isHistogram) {
              series = chart.addSeries(
                HistogramSeries,
                {
                  color: plot.color || colors.upColor,
                  priceLineVisible: false,
                  lastValueVisible: false,
                  title: plot.title,
                  priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
                  visible: active.visible !== false,
                },
                paneIndex
              );
            } else {
              series = chart.addSeries(
                LineSeries,
                {
                  color: active.color || plot.color || '#3b82f6',
                  lineWidth: (plot.lineWidth || 2) as any,
                  priceLineVisible: false,
                  lastValueVisible: true,
                  title: plot.title,
                  crosshairMarkerVisible: false,
                  priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
                  visible: active.visible !== false,
                },
                paneIndex
              );
            }
            seriesList.push(series);
          });

          if (entry.plotCandleConfig) {
            entry.plotCandleConfig.forEach(pc => {
              const series = chart.addSeries(
                CandlestickSeries,
                {
                  title: pc.title,
                  priceLineVisible: false,
                  lastValueVisible: true,
                  priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
                  visible: active.visible !== false,
                },
                paneIndex
              );
              seriesList.push(series);
            });
          }

          if (paneIndex > 0) {
            chart.panes()[paneIndex]?.setHeight(isMobile ? 80 : 100);
          }

          activeSeriesRefs.current.set(active.instanceId, { seriesList, paneIndex });
        }
      } else {
        const seriesVal = activeSeriesRefs.current.get(active.instanceId);
        if (seriesVal && seriesVal.seriesList.length > 0 && entry.group !== 'candlestick') {
          let seriesIndex = 0;
          (entry.plotConfig || []).forEach(plot => {
            const series = seriesVal.seriesList[seriesIndex++];
            if (series && plot) {
              try {
                const colorToUse = seriesIndex === 1 ? active.color : plot.color || active.color;
                series.applyOptions({
                  color: colorToUse,
                  visible: active.visible !== false,
                });
              } catch (err) {
                console.error('Error applying series option:', err);
              }
            }
          });
          if (entry.plotCandleConfig) {
            entry.plotCandleConfig.forEach(() => {
              const series = seriesVal.seriesList[seriesIndex++];
              if (series) {
                try {
                  series.applyOptions({ visible: active.visible !== false });
                } catch {}
              }
            });
          }
        }
        if (!entry.overlay && entry.group !== 'candlestick') {
          nextPaneIndex++;
        }
      }
    });

    // Re-apply calculations
    if (lastCandleDataRef.current.length > 0) {
      applyIndicators(lastCandleDataRef.current);
    }
  }, [activeIndicators, chartRef.current, getThemeColors, applyIndicators, isMobile]);

  // Main data effect
  useEffect(() => {
    const firstCandleTime = candles[0]?.startedAt || 'none';
    const lastCandleTime = candles[candles.length - 1]?.startedAt || 'none';
    const currentDatasetId = `${selectedMarket}-${timeframe}-${candles.length}-${firstCandleTime}-${lastCandleTime}`;
    const currentCandleTicker = candles[0]?.ticker || '';
    const isMatchingMarket =
      !currentCandleTicker ||
      currentCandleTicker === selectedMarket ||
      selectedMarket.startsWith(currentCandleTicker);

    if (lastDatasetIdRef.current !== currentDatasetId && isMatchingMarket) {
      const colors = getThemeColors();
      const candleData = candles
        .map(c => ({
          time: Math.floor(new Date(c.startedAt).getTime() / 1000) as any,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
          volume: parseFloat(c.usdVolume),
        }))
        .filter(isValidCandle)
        .sort((a, b) => a.time - b.time);

      if (!seriesRef.current) return;

      try {
        if (candleData.length === 0) {
          seriesRef.current.setData([]);
          if (volumeSeriesRef.current) volumeSeriesRef.current.setData([]);
          lastCandleDataRef.current = [];
          setLegend(null);
          return;
        }

        if (chartType === 'candlestick') {
          seriesRef.current.setData(candleData);
        } else {
          seriesRef.current.setData(candleData.map(c => ({ time: c.time, value: c.close })));
        }

        if (candleData.length > 0) lastBarTimeRef.current = candleData[candleData.length - 1].time;

        if (showVolume && volumeSeriesRef.current) {
          volumeSeriesRef.current.setData(
            candleData.map(c => ({
              time: c.time,
              value: c.volume,
              color: c.close >= c.open ? colors.upColor + '40' : colors.downColor + '40',
            }))
          );
        }

        lastCandleDataRef.current = candleData;
        applyIndicators(candleData);
        setLegend(buildLegend());

        const marketOrTimeframeChanged =
          prevMarketRef.current !== selectedMarket || prevTimeframeRef.current !== timeframe;
        if (marketOrTimeframeChanged && chartRef.current) {
          setVisibleRange(chartRef.current, candleData.length);
          prevMarketRef.current = selectedMarket;
          prevTimeframeRef.current = timeframe;
        }

        lastDatasetIdRef.current = currentDatasetId;
      } catch (err) {
        console.error('[Chart] Error setting data:', err);
      }
    }
  }, [
    candles,
    selectedMarket,
    timeframe,
    chartType,
    showVolume,
    getThemeColors,
    applyIndicators,
    buildLegend,
    setVisibleRange,
  ]);

  // Create chart instance
  const createChartInstance = useCallback(() => {
    if (!chartContainerRef.current) return;

    const colors = getThemeColors();
    const container = chartContainerRef.current;

    if (drawingManagerRef.current) {
      try {
        drawingManagerRef.current.detach?.();
      } catch {}
      drawingManagerRef.current = null;
    }

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
    }

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.textColor,
        fontSize: isMobile ? 10 : 12,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
      grid: {
        vertLines: {
          color: showGrid ? colors.gridColor : 'transparent',
          style: LineStyle.Solid,
          visible: showGrid,
        },
        horzLines: {
          color: showGrid ? colors.gridColor : 'transparent',
          style: LineStyle.Solid,
          visible: showGrid,
        },
      },
      crosshair: {
        mode: showCrosshair ? CrosshairMode.Normal : CrosshairMode.Hidden,
        vertLine: {
          color: colors.crosshairColor,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: colors.borderColor,
        },
        horzLine: {
          color: colors.crosshairColor,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: colors.borderColor,
        },
      },
      rightPriceScale: {
        borderColor: colors.borderColor,
        scaleMargins: { top: 0.08, bottom: showVolume ? 0.22 : 0.08 },
        minimumWidth: isMobile ? 50 : 65,
        mode: isLogScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      },
      timeScale: {
        borderColor: colors.borderColor,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: isMobile ? 12 : 20,
        barSpacing: isMobile ? 8 : 12,
        minBarSpacing: isMobile ? 3 : 5,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    chart.timeScale().subscribeVisibleTimeRangeChange(() => {
      if (isFetchingMoreRef.current) return;
      const logicalRange = chart.timeScale().getVisibleLogicalRange();
      if (logicalRange && logicalRange.from < 10) fetchMore();
    });

    chart.subscribeCrosshairMove(param => {
      if (!param || param.time === undefined) setLegend(buildLegend());
      else setLegend(buildLegend(param.time as number));
    });

    chartRef.current = chart;

    //  Main series
    if (chartType === 'candlestick') {
      seriesRef.current = chart.addSeries(CandlestickSeries, {
        upColor: colors.upColor,
        downColor: colors.downColor,
        borderUpColor: colors.upColor,
        borderDownColor: colors.downColor,
        wickUpColor: colors.upColor,
        wickDownColor: colors.downColor,
      });
    } else if (chartType === 'line') {
      seriesRef.current = chart.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
      });
    } else if (chartType === 'area') {
      seriesRef.current = chart.addSeries(AreaSeries, {
        topColor: isDark ? '#3b82f666' : '#3b82f64D',
        bottomColor: '#3b82f600',
        lineColor: '#3b82f6',
        lineWidth: 2,
      });
    }

    // Volume
    if (showVolume) {
      volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
        color: colors.volumeColor,
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    }
    activeSeriesRefs.current.clear();
    markersPluginRef.current = null;

    //Drawing manager
    if (seriesRef.current) {
      try {
        const manager = new DrawingManager();
        manager.attach(chart, seriesRef.current as any, container);
        drawingManagerRef.current = manager;

        // Load drawings from localStorage
        const savedDrawings = localStorage.getItem(`dydx_drawings_${selectedMarketRef.current}`);
        if (savedDrawings) {
          try {
            const parsed = JSON.parse(savedDrawings);
            manager.importDrawings(parsed, (type: string, data: any) => {
              const DrawingClass = DRAWING_CLASS_MAP[type];
              if (!DrawingClass) return null;
              return new DrawingClass(data.id, data.anchors, data.style, data.options);
            });
          } catch (err) {
            console.error('Failed to load initial drawings:', err);
          }
        }

        // Subscribe to drawing events to auto-save to localStorage
        const saveDrawings = () => {
          if (isSwitchingMarketRef.current) return;
          try {
            const list = manager.exportDrawings();
            localStorage.setItem(
              `dydx_drawings_${selectedMarketRef.current}`,
              JSON.stringify(list)
            );
          } catch (err) {
            console.error('Failed to save drawings:', err);
          }
        };

        manager.on('drawing:added', saveDrawings);
        manager.on('drawing:removed', saveDrawings);
        manager.on('drawing:updated', saveDrawings);
        manager.on('drawing:cleared', saveDrawings);
      } catch (err) {
        console.error('[Chart] DrawingManager init error:', err);
        drawingManagerRef.current = null;
      }
    }

    // Load existing data
    const currentCandles = candlesRef.current;
    if (currentCandles.length > 0) {
      const candleData = currentCandles
        .map(c => ({
          time: Math.floor(new Date(c.startedAt).getTime() / 1000) as any,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
          volume: parseFloat(c.usdVolume),
        }))
        .filter(c => c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0)
        .sort((a, b) => a.time - b.time);

      if (candleData.length > 0) {
        if (chartType === 'candlestick') seriesRef.current?.setData(candleData);
        else seriesRef.current?.setData(candleData.map(c => ({ time: c.time, value: c.close })));

        lastBarTimeRef.current = candleData[candleData.length - 1].time;

        if (showVolume && volumeSeriesRef.current) {
          volumeSeriesRef.current.setData(
            candleData.map(c => ({
              time: c.time,
              value: c.volume,
              color: c.close >= c.open ? colors.upColor + '40' : colors.downColor + '40',
            }))
          );
        }

        lastCandleDataRef.current = candleData;
        applyIndicators(candleData);
        setLegend(buildLegend());
        setVisibleRange(chart, candleData.length);
      }
    }
  }, [
    chartType,
    showVolume,
    showGrid,
    showCrosshair,
    isDark,
    isMobile,
    getThemeColors,
    isLogScale,
    applyIndicators,
    buildLegend,
    setVisibleRange,
  ]);

  // ── Resize observer ────
  useEffect(() => {
    if (!chartContainerRef.current) return;
    const container = chartContainerRef.current;
    resizeObserverRef.current = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry || !chartRef.current) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        requestAnimationFrame(() => {
          try {
            chartRef.current?.applyOptions({
              width: Math.floor(width),
              height: Math.floor(height),
            });
          } catch {}
        });
      }
    });
    resizeObserverRef.current.observe(container);
    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, []);

  // ── Init / destroy chart ─────────────────────────────────────────────────
  useEffect(() => {
    createChartInstance();
    return () => {
      if (drawingManagerRef.current) {
        try {
          drawingManagerRef.current.detach?.();
        } catch {}
        drawingManagerRef.current = null;
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      activeDrawingRef.current = null;
      isPlacingRef.current = false;
    };
  }, [createChartInstance]);

  // ── Sync drawings on market change ────────────────────────────────────────
  useEffect(() => {
    const manager = drawingManagerRef.current;
    if (!manager) return;

    isSwitchingMarketRef.current = true;

    // Clear current drawings
    try {
      manager.clearAll?.();
    } catch {}

    // Load new market's drawings
    try {
      const savedDrawings = localStorage.getItem(`dydx_drawings_${selectedMarket}`);
      if (savedDrawings) {
        const parsed = JSON.parse(savedDrawings);
        manager.importDrawings(parsed, (type: string, data: any) => {
          const DrawingClass = DRAWING_CLASS_MAP[type];
          if (!DrawingClass) return null;
          return new DrawingClass(data.id, data.anchors, data.style, data.options);
        });
      }
    } catch (err) {
      console.error('[Chart] Failed to load drawings for market:', selectedMarket, err);
    } finally {
      setTimeout(() => {
        isSwitchingMarketRef.current = false;
      }, 50);
    }
  }, [selectedMarket]);

  // ── Scale mode effect ─
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.priceScale('right').applyOptions({
        mode: isLogScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      });
    }
  }, [isLogScale]);

  // ── Cursor for drawing tools ─────────────────────────────────────────────
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;
    container.style.cursor = activeDrawTool && activeDrawTool !== '' ? 'crosshair' : 'default';
  }, [activeDrawTool]);

  // ── Drawing mouse events ─────────────────────────────────────────────────
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || !activeDrawTool || activeDrawTool === '') return;

    const getChartCoordinates = (e: MouseEvent) => {
      if (!chartRef.current || !seriesRef.current || !container) return null;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const time = chartRef.current.timeScale().coordinateToTime(x);
      const price = seriesRef.current.coordinateToPrice(y);
      if (time === null || price === null) return null;
      return { time, price };
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const coords = getChartCoordinates(e);
      if (!coords) return;
      const manager = drawingManagerRef.current;
      if (!manager) return;
      const reqAnchors = getRequiredAnchors(activeDrawTool);

      if (!isPlacingRef.current) {
        const drawingId = `${activeDrawTool}-${Date.now()}`;
        const points = Array.from({ length: reqAnchors }, () => ({ ...coords }));
        const drawing = createDrawingInstance(
          activeDrawTool,
          drawingId,
          points,
          activeDrawingColor,
          activeDrawingWidth
        );
        if (drawing) {
          manager.addDrawing(drawing);
          activeDrawingRef.current = drawing;
          if (reqAnchors === 1) {
            manager.selectDrawing(drawingId);
            setActiveDrawTool(null);
            isPlacingRef.current = false;
            activeDrawingRef.current = null;
            placingAnchorIndexRef.current = 0;
          } else {
            isPlacingRef.current = true;
            placingAnchorIndexRef.current = 1;
          }
        }
      } else {
        const drawing = activeDrawingRef.current;
        if (drawing) {
          drawing.updateAnchor(placingAnchorIndexRef.current, coords);
          const nextIndex = placingAnchorIndexRef.current + 1;
          if (nextIndex >= reqAnchors) {
            manager.selectDrawing(drawing.id);
            setActiveDrawTool(null);
            isPlacingRef.current = false;
            activeDrawingRef.current = null;
            placingAnchorIndexRef.current = 0;
          } else {
            placingAnchorIndexRef.current = nextIndex;
          }
        }
      }
      e.stopPropagation();
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isPlacingRef.current || !activeDrawingRef.current) return;
      const coords = getChartCoordinates(e);
      if (!coords) return;
      const reqAnchors = getRequiredAnchors(activeDrawTool);
      for (let i = placingAnchorIndexRef.current; i < reqAnchors; i++) {
        activeDrawingRef.current.updateAnchor(i, coords);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isPlacingRef.current && activeDrawingRef.current) {
          const manager = drawingManagerRef.current;
          if (manager) {
            try {
              manager.removeDrawing(activeDrawingRef.current.id);
            } catch {}
          }
        }
        setActiveDrawTool(null);
        isPlacingRef.current = false;
        activeDrawingRef.current = null;
        placingAnchorIndexRef.current = 0;
      }
    };

    container.addEventListener('mousedown', handleMouseDown, true);
    container.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown, true);
      container.removeEventListener('mousemove', handleMouseMove, true);
      window.removeEventListener('keydown', handleKeyDown);
      if (isPlacingRef.current && activeDrawingRef.current) {
        const manager = drawingManagerRef.current;
        if (manager) {
          try {
            manager.removeDrawing(activeDrawingRef.current.id);
          } catch {}
        }
        isPlacingRef.current = false;
        activeDrawingRef.current = null;
        placingAnchorIndexRef.current = 0;
      }
    };
  }, [activeDrawTool, activeDrawingColor, activeDrawingWidth]);

  // ── Real-time candle update ──────────────────────────────────────────────
  useEffect(() => {
    if (!latestCandle || !seriesRef.current || !chartRef.current) return;
    if (latestCandle.ticker && latestCandle.ticker !== selectedMarket) return;

    const open = parseFloat(latestCandle.open);
    const high = parseFloat(latestCandle.high);
    const low = parseFloat(latestCandle.low);
    const close = parseFloat(latestCandle.close);
    if (
      !open ||
      !high ||
      !low ||
      !close ||
      !isFinite(open) ||
      !isFinite(high) ||
      !isFinite(low) ||
      !isFinite(close)
    )
      return;

    const candleTime = Math.floor(new Date(latestCandle.startedAt).getTime() / 1000);
    if (candleTime < lastBarTimeRef.current) return;

    const candlePoint = { time: candleTime as any, open, high, low, close };

    try {
      if (chartType === 'candlestick') seriesRef.current.update(candlePoint);
      else seriesRef.current.update({ time: candlePoint.time, value: close });

      lastBarTimeRef.current = candleTime;
      const volume = parseFloat(latestCandle.usdVolume);

      if (showVolume && volumeSeriesRef.current) {
        const colors = getThemeColors();
        volumeSeriesRef.current.update({
          time: candlePoint.time,
          value: volume,
          color: close >= open ? colors.upColor + '40' : colors.downColor + '40',
        });
      }

      const updatedBar = { time: candleTime, open, high, low, close, volume };
      const candleData = lastCandleDataRef.current;
      if (candleData.length > 0 && candleData[candleData.length - 1].time === candleTime) {
        candleData[candleData.length - 1] = updatedBar;
      } else {
        candleData.push(updatedBar);
      }

      applyIndicators(candleData);
      setLegend(buildLegend());
    } catch (err) {
      console.error('[Chart] Update error:', err);
    }
  }, [
    latestCandle,
    selectedMarket,
    chartType,
    showVolume,
    getThemeColors,
    applyIndicators,
    buildLegend,
  ]);

  // ── Utilities ──────────
  const downloadChart = useCallback(() => {
    if (!chartContainerRef.current) return;
    const canvas = chartContainerRef.current.querySelector('canvas');
    if (canvas) {
      const link = document.createElement('a');
      link.download = `${selectedMarket}-${timeframe}-${Date.now()}.png`;
      link.href = canvas.toDataURL();
      link.click();
    }
  }, [selectedMarket, timeframe]);

  const toggleFullscreen = useCallback(() => setIsFullscreen(prev => !prev), []);

  const handleSelectDrawTool = useCallback(
    (toolId: string | null) => {
      const manager = drawingManagerRef.current;
      if (!manager) return;
      const next = activeDrawTool === toolId ? null : toolId;
      setActiveDrawTool(next);
      try {
        manager.setActiveTool?.(next);
      } catch {}
    },
    [activeDrawTool]
  );

  const clearDrawings = useCallback(() => {
    const manager = drawingManagerRef.current;
    if (!manager) return;
    try {
      manager.clearAll?.();
    } catch {}
    setActiveDrawTool(null);
  }, []);

  // ── Render helpers ──────
  const timeframes: { value: CandleResolution; label: string }[] = [
    { value: '1MIN', label: '1m' },
    { value: '5MINS', label: '5m' },
    { value: '15MINS', label: '15m' },
    { value: '30MINS', label: '30m' },
    { value: '1HOUR', label: '1H' },
    { value: '4HOURS', label: '4H' },
    { value: '1DAY', label: '1D' },
  ];

  const chartTypes: { value: ChartType; label: string; icon: React.ReactNode }[] = [
    { value: 'candlestick', label: 'Candles', icon: <CandlestickChart className="w-4 h-4" /> },
    { value: 'line', label: 'Line', icon: <TrendingUp className="w-4 h-4" /> },
    { value: 'area', label: 'Area', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  const renderTimeframeSelector = () => (
    <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar px-1 flex-1">
      {timeframes.map(tf => (
        <button
          key={tf.value}
          onClick={() => setTimeframe(tf.value)}
          className={`px-2 py-1 text-[11px] font-medium rounded transition-all whitespace-nowrap ${timeframe === tf.value ? 'bg-brand text-white' : 'text-muted hover:text-primary hover:bg-hover'}`}
        >
          {tf.label}
        </button>
      ))}
    </div>
  );

  const renderChartTypeDropdown = () => (
    <div className="relative">
      <button
        onClick={() => setShowChartTypeMenu(!showChartTypeMenu)}
        className="flex items-center gap-1 px-1.5 py-1 hover:bg-hover rounded-md transition-colors min-w-[32px] min-h-[32px] justify-center text-gray-400 hover:text-primary"
        title={`Chart Type: ${chartType}`}
      >
        {chartTypeIcons[chartType]}
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-200 ${showChartTypeMenu ? 'rotate-180' : ''}`}
        />
      </button>
      {showChartTypeMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowChartTypeMenu(false)} />
          <div className="absolute top-full left-0 mt-1 bg-secondary rounded-lg shadow-xl border border-color py-1 min-w-[140px] z-20">
            {chartTypes.map(ct => (
              <button
                key={ct.value}
                onClick={() => {
                  setChartType(ct.value);
                  setShowChartTypeMenu(false);
                }}
                className={`w-full text-left px-3 py-2.5 text-xs hover:bg-hover transition-colors flex items-center gap-2 ${chartType === ct.value ? 'bg-hover text-brand font-medium' : 'text-primary'}`}
              >
                {ct.icon}
                <span>{ct.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const renderToggleRow = (
    label: string,
    value: boolean,
    onToggle: () => void,
    dotColor: string
  ) => (
    <div className="w-full px-4 py-2.5 hover:bg-hover transition-colors flex items-center justify-between group">
      <button
        onClick={onToggle}
        className="flex-1 text-left text-xs flex items-center justify-between text-primary pr-2"
      >
        <span className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
          {label}
        </span>
        <div
          className={`w-9 h-5 rounded-full transition-colors ${value ? 'bg-brand' : 'bg-gray-600'} relative shrink-0`}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${value ? 'translate-x-4.5' : 'translate-x-0.5'}`}
          />
        </div>
      </button>
    </div>
  );

  const renderIndicatorDropdown = () => {
    // Group indicatorRegistry entries by category
    // Flatten all indicators and sort alphabetically by name
    const sortedIndicators = [...indicatorRegistry].sort((a, b) => a.name.localeCompare(b.name));

    // Filter by search query
    const query = searchQuery.toLowerCase().trim();
    const filteredIndicators = sortedIndicators.filter(
      ind =>
        ind.name.toLowerCase().includes(query) ||
        ind.shortName.toLowerCase().includes(query) ||
        (ind.description && ind.description.toLowerCase().includes(query))
    );

    return (
      <div className="relative">
        <button
          onClick={() => setShowIndicatorMenu(!showIndicatorMenu)}
          className="flex items-center gap-1 px-1.5 py-1 hover:bg-hover rounded-md transition-colors min-w-[32px] min-h-[32px] justify-center text-gray-400 hover:text-primary"
          title="Indicators"
        >
          <Sigma className="w-4 h-4" />
          <ChevronDown
            className={`w-3 h-3 transition-transform duration-200 ${showIndicatorMenu ? 'rotate-180' : ''}`}
          />
        </button>

        {showIndicatorMenu && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm pointer-events-auto  select-none animate-fade-in">
            <div
              className="fixed inset-0 cursor-default"
              onClick={() => setShowIndicatorMenu(false)}
            />
            <div className="bg-secondary  rounded-xl w-full max-w-[460px] shadow-2xl py-5  relative text-primary flex flex-col h-[520px] max-h-[85vh] z-10 pointer-events-auto">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 px-4 mb-2">
                <span className="text-sm font-bold uppercase tracking-wider text-primary">
                  Indicators
                </span>
                <button
                  onClick={() => setShowIndicatorMenu(false)}
                  className="p-1 hover:bg-hover rounded-md text-gray-400 hover:text-primary transition-colors"
                  title="Close Menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Search Box */}
              <div className="mb-4 relative w-full">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  placeholder="Search indicators..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-primary text-sm  border border-gray-600 border-l-0 border-r-0 pl-10 pr-3.5 py-3  focus:outline-none focus:border-gray-600 placeholder-gray-500 text-primary"
                  autoFocus
                />
              </div>
              <div className="text-sm uppercase tracking-wider text-muted/60 font-bold mb-2 px-4 ">
                Script Name
              </div>

              {/* Scrollable Indicator List */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-0.5 px-4">
                {filteredIndicators.map(ind => {
                  const firstActive = activeIndicators.find(a => a.indicatorId === ind.id);
                  const isActive = !!firstActive;
                  return (
                    <button
                      key={ind.id}
                      onClick={() => {
                        if (isActive) {
                          removeIndicator(firstActive.instanceId);
                        } else {
                          addIndicator(ind.id);
                        }
                      }}
                      className={`w-full px-3.5 py-2 hover:bg-hover text-left text-xs transition-colors flex items-center justify-between rounded-md group ${isActive ? 'bg-brand/5' : ''}`}
                    >
                      <div className="flex flex-col gap-0.5 max-w-[85%]">
                        <span
                          className={`truncate text-left font-semibold ${isActive ? 'text-brand' : 'text-primary group-hover:text-brand'}`}
                        >
                          {ind.name}
                        </span>
                        {ind.description && (
                          <span className="text-[10px] text-muted/50 font-normal line-clamp-1 truncate text-left">
                            {ind.description}
                          </span>
                        )}
                      </div>
                      {isActive && <Check className="w-4 h-4 text-brand shrink-0" />}
                    </button>
                  );
                })}

                {filteredIndicators.length === 0 && (
                  <div className="text-center py-12 text-xs text-muted/50">
                    No indicators match your search.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSettingsDropdown = () => (
    <div className="relative">
      <button
        onClick={() => setShowSettingsMenu(!showSettingsMenu)}
        className="flex items-center justify-center p-1.5 hover:bg-hover rounded-md transition-colors min-w-[32px] min-h-[32px] text-gray-400 hover:text-primary"
        title="Chart Settings"
      >
        <Settings className="w-4 h-4 text-gray-400" />
      </button>
      {showSettingsMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowSettingsMenu(false)} />
          <div className="absolute top-full right-0 mt-1 bg-secondary rounded-lg shadow-xl border border-color py-1 min-w-[160px] z-20">
            {renderToggleRow('Volume', showVolume, () => setShowVolume(!showVolume), 'bg-gray-400')}
            {renderToggleRow('Grid', showGrid, () => setShowGrid(!showGrid), 'bg-gray-400')}
            {renderToggleRow(
              'Crosshair',
              showCrosshair,
              () => setShowCrosshair(!showCrosshair),
              'bg-gray-400'
            )}
          </div>
        </>
      )}
    </div>
  );

  const renderDrawingToolbar = () => {
    if (!showDrawingToolbar) {
      return (
        <div
          onClick={() => setShowDrawingToolbar(true)}
          className="absolute left-0 top-0 bottom-0 w-2.5 hover:w-5 z-30 transition-all duration-200 cursor-pointer flex items-center group pointer-events-auto bg-transparent hover:bg-hover/10"
          title="Show Drawing Tools"
        >
          <button className="absolute left-0 top-[120px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-secondary border-y border-r border-color rounded-r-md py-2.5 px-0.5 text-gray-400 hover:text-primary shadow-md flex items-center justify-center">
            <ChevronRight className="w-3.5 h-6 text-gray-400" />
          </button>
        </div>
      );
    }

    const activeCatObj = TOOL_CATEGORIES.find(c => c.id === activeCategory);

    return (
      <div className="absolute left-0 top-0 bottom-0 w-[46px] z-20 flex flex-col items-center py-2 bg-secondary border-r border-color shadow-lg select-none gap-1">
        <style>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 4px;
            height: 4px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(156, 163, 175, 0.25);
            border-radius: 4px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: rgba(156, 163, 175, 0.45);
          }
          @keyframes slideIn {
            from {
              transform: translateX(-8px);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
          .animate-slide-in {
            animation: slideIn 0.12s ease-out forwards;
          }
        `}</style>

        <button
          onClick={() => {
            handleSelectDrawTool(null);
            setActiveCategory(null);
          }}
          className={`p-2 rounded-lg transition-colors flex items-center justify-center min-w-[32px] min-h-[32px] ${!activeDrawTool ? 'bg-brand/15 text-brand' : 'text-gray-400 hover:bg-hover hover:text-primary'}`}
          title="Cursor"
        >
          <MousePointer2 className="w-4 h-4" />
        </button>

        <div className="w-6 h-px bg-color my-1 shrink-0" />

        {TOOL_CATEGORIES.map(cat => {
          const isCatActive = cat.sections.some(sec =>
            sec.tools.some(t => t.id === activeDrawTool)
          );
          const isOpen = activeCategory === cat.id;
          const isActive = isOpen || isCatActive;

          let displayIcon = cat.icon;
          for (const sec of cat.sections) {
            const found = sec.tools.find(t => t.id === activeDrawTool);
            if (found) {
              displayIcon = found.icon;
              break;
            }
          }

          return (
            <div key={cat.id} className="relative">
              <button
                onClick={e => {
                  e.stopPropagation();
                  setActiveCategory(activeCategory === cat.id ? null : cat.id);
                }}
                className={`p-2 rounded-lg transition-colors flex items-center justify-center min-w-[32px] min-h-[32px] relative ${isActive ? 'bg-brand/15 text-brand border border-brand/20' : 'text-gray-400 hover:bg-hover hover:text-primary'}`}
                title={cat.label}
              >
                {displayIcon}
              </button>
            </div>
          );
        })}

        <div className="w-6 h-px bg-color my-1 shrink-0" />

        <button
          onClick={() => {
            clearDrawings();
            setActiveCategory(null);
          }}
          className="p-2 rounded-lg transition-colors flex items-center justify-center min-w-[32px] min-h-[32px] text-gray-400 hover:bg-hover hover:text-red-400"
          title="Clear Drawings"
        >
          <Eraser className="w-4 h-4" />
        </button>

        <div className="mt-auto pt-2 border-t border-color w-full flex justify-center shrink-0">
          <button
            onClick={() => {
              setShowDrawingToolbar(false);
              setActiveCategory(null);
            }}
            className="p-2 rounded-lg text-gray-400 hover:bg-hover hover:text-primary transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
            title="Collapse Toolbar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {activeCatObj && (
          <>
            <div
              className="fixed inset-0 z-20 pointer-events-auto"
              onClick={() => setActiveCategory(null)}
            />
            <div
              className="absolute left-[45px] top-0 bottom-0 w-[240px] bg-secondary border-r border-color shadow-2xl z-20 flex flex-col select-none animate-slide-in pointer-events-auto"
              style={{ height: '100%' }}
            >
              <div className="px-4 py-2.5 border-b border-color flex items-center justify-between shrink-0">
                <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                  {activeCatObj.label}
                </span>
                <button
                  onClick={() => setActiveCategory(null)}
                  className="p-1 hover:bg-hover rounded text-gray-400 hover:text-primary transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-4">
                {activeCatObj.sections.map((sec, idx) => (
                  <div key={idx} className="flex flex-col gap-1">
                    <span className="px-2 py-0.5 text-[9px] uppercase tracking-wider text-muted/60 font-bold select-none text-left">
                      {sec.header}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      {sec.tools.map(tool => {
                        const isToolActive = activeDrawTool === tool.id;
                        return (
                          <button
                            key={tool.id}
                            onClick={e => {
                              e.stopPropagation();
                              handleSelectDrawTool(tool.id);
                              setActiveCategory(null);
                            }}
                            className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-xs transition-colors group ${
                              isToolActive
                                ? 'bg-brand/15 text-brand font-medium border border-brand/20'
                                : 'text-gray-400 hover:bg-hover hover:text-primary'
                            }`}
                          >
                            <span
                              className={`shrink-0 ${isToolActive ? 'text-brand' : 'text-gray-400 group-hover:text-primary'}`}
                            >
                              {tool.icon}
                            </span>
                            <span className="truncate">{tool.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderLegend = () => {
    if (!legend) return null;
    const colors = getThemeColors();
    const isUp = legend.close >= legend.open;
    const changeColor = legend.change >= 0 ? colors.upColor : colors.downColor;

    return (
      <div
        className="absolute z-20 top-2 right-[60px] pointer-events-none flex flex-col gap-y-0.5 items-start text-left select-none"
        style={{ left: showDrawingToolbar ? '54px' : '12px' }}
      >
        {/* Main price info */}
        <div className="flex flex-wrap items-center gap-x-1.5 sm:gap-x-2.5 pointer-events-auto leading-normal text-[10px] text-muted font-medium">
          <span className="text-[11px] font-bold text-primary mr-1 shrink-0">{selectedMarket}</span>
          <span
            style={{ color: isUp ? colors.upColor : colors.downColor }}
            className="font-mono font-bold text-[11px] mr-1 shrink-0"
          >
            {formatNum(legend.close, 2)}
          </span>
          <span style={{ color: changeColor }} className="font-mono mr-2.5 shrink-0">
            {legend.change >= 0 ? '+' : ''}
            {formatNum(legend.change, 2)} ({legend.changePct >= 0 ? '+' : ''}
            {formatNum(legend.changePct, 2)}%)
          </span>
          <div className="flex flex-wrap items-center gap-x-1.5 font-mono text-[9px] sm:text-[10px]">
            <span>O<span className="text-primary font-semibold ml-0.5">{formatNum(legend.open)}</span></span>
            <span>H<span className="text-primary font-semibold ml-0.5">{formatNum(legend.high)}</span></span>
            <span>L<span className="text-primary font-semibold ml-0.5">{formatNum(legend.low)}</span></span>
            <span>C<span className="text-primary font-semibold ml-0.5">{formatNum(legend.close)}</span></span>
            <span>Vol<span className="text-primary font-semibold ml-0.5">{formatNum(legend.volume, 0)}</span></span>
          </div>
        </div>

        {/* Global indicators pills collapse toggle */}
        {activeIndicators.length > 0 && (
          <button
            onClick={() => setShowIndicatorPills(!showIndicatorPills)}
            className="flex items-center gap-0.5 hover:bg-hover/50 px-1 py-0.5 rounded text-[8px] sm:text-[9px] font-bold text-muted hover:text-primary pointer-events-auto transition-colors shrink-0 mt-0.5"
            title={showIndicatorPills ? 'Collapse indicators legend' : 'Expand indicators legend'}
          >
            {showIndicatorPills ? (
              <>
                <ChevronLeft className="w-2.5 h-2.5" />
                <span>Hide ({activeIndicators.length})</span>
              </>
            ) : (
              <>
                <ChevronRight className="w-2.5 h-2.5" />
                <span>Show ({activeIndicators.length})</span>
              </>
            )}
          </button>
        )}

        {/* Dynamic Indicators */}
        {showIndicatorPills &&
          activeIndicators.map(active => {
            const entry = indicatorRegistry.find(ind => ind.id === active.indicatorId);
            if (!entry) return null;

            const result = lastIndicatorResults.current.get(active.instanceId);
            const inputVals = Object.values(active.inputs).join(',');

            // Display first plot's value or special display logic
            let valueText = '';
            if (result) {
              const lastTime = legend.time;
              const marker = (result.markers as any[])?.find(m => m.time === lastTime);

              if (entry.group === 'candlestick') {
                valueText = marker ? marker.text || 'Pattern' : '';
              } else {
                const vals = (entry.plotConfig || [])
                  .map(plot => {
                    const arr = result.plots?.[plot.id] || [];
                    const pt = findAt(arr, lastTime);
                    return pt ? `${plot.title || plot.id}: ${formatNum(pt.value)}` : '';
                  })
                  .filter(v => v !== '');

                if (entry.plotCandleConfig && result.candles) {
                  entry.plotCandleConfig.forEach(pc => {
                    const arr = result.candles[pc.id] || [];
                    const cd = arr.find((c: any) => c.time === lastTime);
                    if (cd) {
                      vals.push(
                        `${pc.title || pc.id} (O: ${formatNum(cd.open)} H: ${formatNum(cd.high)} L: ${formatNum(cd.low)} C: ${formatNum(cd.close)})`
                      );
                    }
                  });
                }

                valueText = vals.join(' | ');
                if (marker && marker.text) {
                  valueText = `${marker.text}${valueText ? ` | ${valueText}` : ''}`;
                }
              }
            }

            const isHidden = active.visible === false;

            return (
              <div
                key={active.instanceId}
                className={`flex items-center flex-wrap gap-1 text-[8.5px] sm:text-[9.5px] font-semibold pointer-events-auto transition-opacity ${isHidden ? 'opacity-40' : 'opacity-80 hover:opacity-100'}`}
              >
                <span
                  className="w-1 h-1 rounded-full shrink-0"
                  style={{ backgroundColor: active.color }}
                />
                <span className="text-muted font-normal text-[8px] sm:text-[9px] shrink-0">
                  {entry.shortName || entry.name}({inputVals}):
                </span>
                <span className="font-mono font-medium text-[8px] sm:text-[9px] break-all" style={{ color: active.color }}>
                  {valueText || '-'}
                </span>

                {/* Eye button to toggle visibility */}
                <button
                  onClick={() => toggleIndicatorVisibility(active.instanceId)}
                  className="p-0.5 rounded transition-colors text-muted hover:text-primary hover:bg-hover/40 shrink-0 ml-1"
                  title={isHidden ? `Show ${entry.name}` : `Hide ${entry.name}`}
                >
                  {isHidden ? (
                    <EyeOff className="w-2.5 h-2.5 text-red-400" />
                  ) : (
                    <Eye className="w-2.5 h-2.5" />
                  )}
                </button>

                {/* Settings button */}
                <button
                  onClick={() => setEditingInstanceId(active.instanceId)}
                  className="p-0.5 rounded transition-colors text-muted hover:text-primary hover:bg-hover/40 shrink-0"
                  title={`Configure ${entry.name}`}
                >
                  <Settings className="w-2.5 h-2.5" />
                </button>

                {/* Close button */}
                <button
                  onClick={() => removeIndicator(active.instanceId)}
                  className="p-0.5 rounded transition-colors text-muted hover:text-red-400 hover:bg-hover/40 shrink-0"
                  title={`Remove ${entry.name}`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
      </div>
    );
  };

  const renderDrawingStyleBar = () => {
    if (!activeDrawTool || activeDrawTool === '') return null;

    return (
      <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-secondary px-3 py-1.5 rounded-lg border border-color shadow-lg select-none pointer-events-auto">
        <span className="text-[10px] uppercase font-bold text-muted tracking-wider">Style:</span>
        <div className="flex items-center gap-1.5 border-r border-color pr-3">
          {[
            { hex: '#3b82f6', label: 'Blue' },
            { hex: '#10b981', label: 'Green' },
            { hex: '#f43f5e', label: 'Red' },
            { hex: '#f59e0b', label: 'Yellow' },
            { hex: '#f97316', label: 'Orange' },
            { hex: '#ffffff', label: 'White' },
          ].map(c => (
            <button
              key={c.hex}
              onClick={() => setActiveDrawingColor(c.hex)}
              className={`w-4 h-4 rounded-full border transition-all ${activeDrawingColor === c.hex ? 'scale-125 border-white' : 'border-transparent'}`}
              style={{ backgroundColor: c.hex }}
              title={c.label}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4].map(w => (
            <button
              key={w}
              onClick={() => setActiveDrawingWidth(w)}
              className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${activeDrawingWidth === w ? 'bg-brand text-white' : 'text-muted hover:bg-hover hover:text-primary'}`}
            >
              {w}px
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderScaleModeToggles = () => (
    <div className="absolute bottom-6 right-[68px] z-20 flex items-center gap-1 bg-secondary border border-color rounded p-0.5 shadow-md pointer-events-auto select-none">
      <button
        onClick={() => setIsLogScale(!isLogScale)}
        className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded transition-colors ${isLogScale ? 'bg-brand text-white' : 'text-muted hover:text-primary'}`}
        title="Toggle Logarithmic Price Scale"
      >
        Log
      </button>
    </div>
  );

  const renderIndicatorSettingsModal = () => {
    if (!editingInstanceId) return null;

    const active = activeIndicators.find(ind => ind.instanceId === editingInstanceId);
    if (!active) return null;

    const entry = indicatorRegistry.find(ind => ind.id === active.indicatorId);
    if (!entry) return null;

    const handleFieldChange = (fieldId: string, val: any) => {
      setActiveIndicators(prev =>
        prev.map(ind => {
          if (ind.instanceId === editingInstanceId) {
            return {
              ...ind,
              inputs: {
                ...ind.inputs,
                [fieldId]: val,
              },
            };
          }
          return ind;
        })
      );
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 select-none">
        <div className="bg-secondary border border-color rounded-xl w-80 shadow-2xl p-5 relative text-primary animate-fade-in pointer-events-auto">
          <button
            onClick={() => setEditingInstanceId(null)}
            className="absolute top-4 right-4 p-1 hover:bg-hover rounded-md text-gray-400 hover:text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <h3 className="text-sm font-bold border-b border-color pb-2 pr-8 mb-4 uppercase tracking-wider text-primary flex items-center gap-2">
            <Settings className="w-4 h-4 text-brand" />
            {entry.name} Settings
          </h3>

          <div className="space-y-4 mb-5 max-h-80 overflow-y-auto pr-1">
            {/* Color Configurator (only if not candlestick pattern) */}
            {entry.group !== 'candlestick' && (
              <div className="flex flex-col gap-1.5 pb-3 border-b border-color/40">
                <label className="text-[10px] uppercase font-bold text-muted">Plot Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={active.color}
                    onChange={e => {
                      setActiveIndicators(prev =>
                        prev.map(ind => {
                          if (ind.instanceId === editingInstanceId) {
                            return { ...ind, color: e.target.value };
                          }
                          return ind;
                        })
                      );
                    }}
                    className="w-10 h-7 rounded border border-color cursor-pointer bg-transparent"
                  />
                  <span className="text-xs font-mono font-semibold uppercase">{active.color}</span>
                </div>
              </div>
            )}

            {/* Dynamic Inputs from inputConfig */}
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
                      onClick={() => handleFieldChange(input.id, !val)}
                      className={`w-9 h-5 rounded-full transition-colors ${val ? 'bg-brand' : 'bg-gray-600'} relative shrink-0`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${val ? 'translate-x-4.5' : 'translate-x-0.5'}`}
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
                        handleFieldChange(input.id, isNaN(parsed) ? input.defval : parsed);
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
                const sourceOptions = [
                  'open',
                  'high',
                  'low',
                  'close',
                  'hl2',
                  'hlc3',
                  'ohlc4',
                  'hlcc4',
                ];
                return (
                  <div key={input.id} className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-bold text-muted">
                      {input.title || input.id}
                    </label>
                    <select
                      value={val}
                      onChange={e => handleFieldChange(input.id, e.target.value)}
                      className="w-full bg-primary border border-color rounded px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-brand text-primary appearance-none cursor-pointer"
                    >
                      {sourceOptions.map(opt => (
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
                        onChange={e => handleFieldChange(input.id, e.target.value)}
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
                        onChange={e => handleFieldChange(input.id, e.target.value)}
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
                        onChange={e => handleFieldChange(input.id, e.target.value)}
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
              onClick={() => setEditingInstanceId(null)}
              className="px-4 py-1.5 bg-brand text-white font-semibold text-xs rounded-lg hover:opacity-90 transition-all shadow-md"
            >
              Close Settings
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderWatermark = () => (
    <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none overflow-hidden">
      <span
        className={`font-black tracking-tight ${isMobile ? 'text-5xl' : 'text-8xl'} ${isDark ? 'text-white/[0.03]' : 'text-black/[0.03]'}`}
      >
        {selectedMarket}
      </span>
    </div>
  );

  const renderHistoryLoadingOverlay = () => {
    if (!isFetchingMore) return null;
    return (
      <div
        className={`absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-secondary/90 px-4 py-2 rounded-full border border-color shadow-lg transition-all ${isFetchingMore ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
      >
        <div className="w-4 h-4 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
        <span className="text-xs text-gray-300 font-medium whitespace-nowrap">
          Loading history...
        </span>
      </div>
    );
  };

  const renderMarketTransitionOverlay = () => {
    if (!isLoading) return null;
    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center bg-secondary/80 backdrop-blur-md transition-all duration-300">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-brand/10 rounded-full" />
            <div className="absolute inset-0 border-4 border-t-brand rounded-full animate-spin" />
            <div className="absolute inset-2 border-2 border-brand/5 rounded-full" />
            <div className="absolute inset-2 border-2 border-b-brand/40 rounded-full animate-spin-reverse" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white tracking-tight">Loading Chart</h3>
            <p className="text-gray-400 text-xs font-medium uppercase tracking-widest">
              {selectedMarket}
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderDesktopChart = () => (
    <div
      className={`${isFullscreen && !isMobile ? 'fixed inset-0 z-50' : 'h-full'} bg-primary flex flex-col`}
    >
      <div className="bg-secondary border-b border-color flex-shrink-0">
        <div className="flex items-center justify-between px-2 py-0.5">
          {renderTimeframeSelector()}
          <div className="flex items-center gap-1 px-1 shrink-0">
            <div className="w-px h-4 bg-color mx-2 hidden sm:block" />
            {renderChartTypeDropdown()}
            {renderIndicatorDropdown()}
            {renderSettingsDropdown()}
            <button
              onClick={downloadChart}
              className="p-1.5 hover:bg-hover rounded-md transition-colors hidden sm:flex items-center justify-center min-w-[32px] min-h-[32px]"
              title="Download Chart"
            >
              <Download className="w-4 h-4 text-gray-400" />
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-1.5 hover:bg-hover rounded-md transition-colors flex items-center justify-center min-w-[32px] min-h-[32px]"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4 text-gray-400" />
              ) : (
                <Maximize2 className="w-4 h-4 text-gray-400" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-secondary relative overflow-hidden">
        {renderWatermark()}
        {renderHistoryLoadingOverlay()}
        {renderDrawingToolbar()}
        {renderLegend()}
        {renderDrawingStyleBar()}
        {renderScaleModeToggles()}
        {renderIndicatorSettingsModal()}
        {error && (
          <div className="absolute top-14 left-2 right-2 sm:mx-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg z-10 backdrop-blur-sm">
            <p className="text-xs sm:text-sm text-red-400 font-medium">{error}</p>
          </div>
        )}
        {renderMarketTransitionOverlay()}
        <div
          ref={chartContainerRef}
          className="absolute right-0 top-0 bottom-0 opacity-100 transition-all duration-300"
          style={{ left: showDrawingToolbar ? '46px' : '0px' }}
        />
      </div>
    </div>
  );

  const renderMobileChart = () => (
    <div
      className={`${isFullscreen ? 'fixed inset-0 z-50 animate-fade-in' : 'h-full'} bg-primary flex flex-col`}
    >
      <div
        className={`bg-secondary border-b border-color flex-shrink-0 ${isFullscreen ? 'safe-area-top' : ''}`}
      >
        <div className="flex items-center justify-between px-2 py-0.5">
          {renderTimeframeSelector()}
          <div className="flex items-center gap-0.5 shrink-0">
            {renderChartTypeDropdown()}
            {renderIndicatorDropdown()}
            {renderSettingsDropdown()}
            <button
              onClick={toggleFullscreen}
              className="p-1 hover:bg-hover rounded-md transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
              title={isFullscreen ? 'Exit Fullscreen' : 'Expand Chart'}
            >
              {isFullscreen ? (
                <X className="w-4 h-4 text-gray-400" />
              ) : (
                <Maximize2 className="w-4 h-4 text-gray-400" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-secondary relative overflow-hidden min-h-[200px]">
        {renderWatermark()}
        {renderHistoryLoadingOverlay()}
        {renderDrawingToolbar()}
        {renderLegend()}
        {renderDrawingStyleBar()}
        {renderScaleModeToggles()}
        {renderIndicatorSettingsModal()}
        {error && (
          <div className="absolute top-14 left-2 right-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg z-10">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}
        {renderMarketTransitionOverlay()}
        <div
          ref={chartContainerRef}
          className="absolute right-0 top-0 bottom-0 opacity-100 transition-all duration-300"
          style={{ left: showDrawingToolbar ? '46px' : '0px' }}
        />
      </div>
    </div>
  );

  return isMobile ? renderMobileChart() : renderDesktopChart();
}
