import { zipSync, strToU8 } from 'fflate';
import { type HistoricalPnl, type Fill, type Order } from '../modules/dydx/service/dydxOrderService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DydxExportData {
  pnlHistory: HistoricalPnl[];
  fills: Fill[];
  orders: Order[];
  transfers: any[];
  period: string;
}

export interface StellarTradeRow {
  date: string;
  type: 'BUY' | 'SELL' | 'SWAP';
  action: string;
  amount: string;
  price: string;
  usdc: string;
  pnl: string;
  pnlNum: number;
  source: string;
}

export interface StellarPositionRow {
  asset: string;
  issuer: string | null;
  totalBought: number;
  totalSold: number;
  remaining: number;
  avgCost: number;
  currentPrice: number | null;
  priceSource: string | null;
  unrealized: number | null;
  realizedPnL: number;
}

export interface StellarExportData {
  address: string;
  period: string;
  totalPnL: number;
  totalRealized: number;
  totalUnrealized: number;
  usdcSpent: number;
  usdcReceived: number;
  netUSDCFlow: number;
  tradeCount: number;
  positionCount: number;
  disposalCount: number;
  rawCount?: number;
  collapsedCount?: number;
  skippedCount?: number;
  noPriceCount?: number;
  winRate?: number;
  bestTrade?: { date: string; asset: string; pnl: number };
  worstTrade?: { date: string; asset: string; pnl: number };
  firstTradeDate?: string;
  lastTradeDate?: string;
  activeDays?: number;
  mostTradedAsset?: string;
  totalPortfolioValue?: number;
  totalCostBasis?: number;
  openPnLPct?: number;
  largestPosition?: { asset: string; issuer: string; remaining: number; currentValue: number };
  // Full trade & position data from API (for Trade Log + Disposals sheets)
  trades?: StellarTradeRow[];
  positions?: StellarPositionRow[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// ZIP via fflate (DEFLATE compressed — production-grade, smaller files)
// ═══════════════════════════════════════════════════════════════════════════════

function buildZipFromParts(parts: Record<string, Uint8Array>): Uint8Array {
  return zipSync(parts, { level: 6 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// XLSX BUILDER — 4 sheets: Summary · Cost Basis · Disposals · Trade Log
// ═══════════════════════════════════════════════════════════════════════════════

function xe(v: string | number | null | undefined): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    s = String.fromCharCode(64 + ((n - 1) % 26 + 1)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
function ref(r: number, c: number) { return `${colLetter(c)}${r}`; }

// ── Shared string store ──────────────────────────────────────────────────────
function makeSST() {
  const list: string[] = [], map: Record<string, number> = {};
  const add = (v: string | number | null | undefined): number => {
    const k = String(v ?? '');
    if (map[k] === undefined) { map[k] = list.length; list.push(k); }
    return map[k];
  };
  const xml = () =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `count="${list.length}" uniqueCount="${list.length}">\n` +
    list.map(s => `<si><t xml:space="preserve">${xe(s)}</t></si>`).join('\n') +
    `\n</sst>`;
  return { add, xml };
}
type SST = ReturnType<typeof makeSST>;

// ── Cell builders ────────────────────────────────────────────────────────────
const sc = (r: number, c: number, v: string | number | null | undefined, sId: number, sst: SST) =>
  `<c r="${ref(r, c)}" t="s" s="${sId}"><v>${sst.add(v)}</v></c>`;

const nc = (r: number, c: number, v: number | null | undefined, sId: number) =>
  v == null ? `<c r="${ref(r, c)}" s="${sId}"/>` :
    `<c r="${ref(r, c)}" t="n" s="${sId}"><v>${Number(v)}</v></c>`;

// formula cell — string formula
const fc = (r: number, c: number, formula: string, sId: number, cachedVal?: number) =>
  `<c r="${ref(r, c)}" t="n" s="${sId}"><f>${xe(formula)}</f>${cachedVal !== undefined ? `<v>${cachedVal}</v>` : ''}</c>`;

// ── Row builder helper ────────────────────────────────────────────────────────
const row = (r: number, ht: number, cells: string) =>
  `<row r="${r}" ht="${ht}" customHeight="1">${cells}</row>`;

// ── Sheet wrapper ─────────────────────────────────────────────────────────────
function sheet(rowsXml: string, colsXml: string, mergesXml = '', freezeRow = 0): string {
  const freeze = freezeRow > 0
    ? `<sheetView showGridLines="0" workbookViewId="0"><pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView>`
    : `<sheetView showGridLines="0" workbookViewId="0"/>`;
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"`,
    `           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`,
    `  <sheetViews>${freeze}</sheetViews>`,
    `  <cols>${colsXml}</cols>`,
    `  <sheetData>${rowsXml}</sheetData>`,
    mergesXml,
    `</worksheet>`,
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

// Style IDs — keep in sync with stylesXml() order
const S = Object.freeze({
  DEFAULT: 0,
  TITLE: 1,   // white bold on navy
  SUBTITLE: 2,   // grey on light bg, centered
  HDR_NAVY: 3,   // white bold on dark-navy, centered
  HDR_BLUE: 4,   // white bold on blue, centered
  KPI_LBL: 5,   // blue label cell, centered
  KPI_BLUE: 6,   // blue value, $format, centered
  KPI_GREEN: 7,   // green value, $format, centered
  KPI_RED: 8,   // red value, $format, centered
  CELL: 9,   // white bg, bordered
  CELL_ALT: 10,  // light-grey bg, bordered
  NUM: 11,  // number, white bg
  NUM_ALT: 12,  // number, grey bg
  PNL_GREEN: 13,  // green highlight
  PNL_RED: 14,  // red highlight
  WARN_BG: 15,  // amber warning row
  FORMULA_NUM: 16,  // formula number, white
  FORMULA_G: 17,  // formula number, green
  FORMULA_R: 18,  // formula number, red
  TOTAL_LBL: 19,  // total label row
  NUM_RIGHT: 20,  // number right-aligned
  EDITABLE: 21,  // yellow editable cell
  EDITABLE_N: 22,  // yellow editable number cell
  SECTION: 23,  // section separator header
});

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3">
    <numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.0000"/>
    <numFmt numFmtId="165" formatCode="&quot;$&quot;#,##0.00"/>
    <numFmt numFmtId="166" formatCode="#,##0.0000"/>
  </numFmts>
  <fonts count="10">
    <font><sz val="10"/><name val="Calibri"/></font>
    <font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><sz val="9"/><color rgb="FF64748B"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="9"/><color rgb="FF64748B"/><name val="Calibri"/></font>
    <font><b/><sz val="13"/><color rgb="FF1E40AF"/><name val="Calibri"/></font>
    <font><b/><sz val="13"/><color rgb="FF166534"/><name val="Calibri"/></font>
    <font><b/><sz val="13"/><color rgb="FFB91C1C"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF92400E"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF1F2937"/><name val="Calibri"/></font>
  </fonts>
  <fills count="14">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1B365D"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF2E75B6"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD6E4F0"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD5F5E3"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFADBD8"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFDE68A"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE8F5E9"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFCE4EC"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left   style="thin"><color rgb="FFCBD5E1"/></left>
      <right  style="thin"><color rgb="FFCBD5E1"/></right>
      <top    style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
    </border>
    <border>
      <left   style="medium"><color rgb="FFFBBF24"/></left>
      <right  style="medium"><color rgb="FFFBBF24"/></right>
      <top    style="medium"><color rgb="FFFBBF24"/></top>
      <bottom style="medium"><color rgb="FFFBBF24"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="24">
    <!-- 0 DEFAULT -->
    <xf numFmtId="0"   fontId="0" fillId="0"  borderId="0" xfId="0"/>
    <!-- 1 TITLE: bold white on navy, large, center -->
    <xf numFmtId="0"   fontId="1" fillId="2"  borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="0"/></xf>
    <!-- 2 SUBTITLE: small grey, center -->
    <xf numFmtId="0"   fontId="2" fillId="7"  borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 3 HDR_NAVY: white bold on dark navy, center -->
    <xf numFmtId="0"   fontId="3" fillId="2"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 4 HDR_BLUE: white bold on blue, center -->
    <xf numFmtId="0"   fontId="3" fillId="3"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 5 KPI_LBL: bold grey on light blue, center -->
    <xf numFmtId="0"   fontId="4" fillId="4"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 6 KPI_BLUE: blue value, $0.0000, center -->
    <xf numFmtId="164" fontId="5" fillId="13" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 7 KPI_GREEN: green value, $0.0000, center -->
    <xf numFmtId="164" fontId="6" fillId="5"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 8 KPI_RED: red value, $0.0000, center -->
    <xf numFmtId="164" fontId="7" fillId="6"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 9 CELL: left-align, white, bordered -->
    <xf numFmtId="0"   fontId="0" fillId="8"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <!-- 10 CELL_ALT: left-align, grey, bordered -->
    <xf numFmtId="0"   fontId="0" fillId="7"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <!-- 11 NUM: $0.0000 white -->
    <xf numFmtId="164" fontId="0" fillId="8"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 12 NUM_ALT: $0.0000 grey -->
    <xf numFmtId="164" fontId="0" fillId="7"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 13 PNL_GREEN: green bg, $0.0000 -->
    <xf numFmtId="164" fontId="6" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 14 PNL_RED: red bg, $0.0000 -->
    <xf numFmtId="164" fontId="7" fillId="12" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 15 WARN_BG: amber bg text -->
    <xf numFmtId="0"   fontId="8" fillId="9"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <!-- 16 FORMULA_NUM: formula, white $0.0000 -->
    <xf numFmtId="164" fontId="9" fillId="8"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 17 FORMULA_G: formula result, green bg -->
    <xf numFmtId="164" fontId="6" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 18 FORMULA_R: formula result, red bg -->
    <xf numFmtId="164" fontId="7" fillId="12" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 19 TOTAL_LBL: bold on navy, left -->
    <xf numFmtId="0"   fontId="3" fillId="2"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <!-- 20 NUM_RIGHT: plain number right -->
    <xf numFmtId="166" fontId="0" fillId="8"  borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 21 EDITABLE: amber-bordered, yellow bg, left -->
    <xf numFmtId="166" fontId="0" fillId="9"  borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 22 EDITABLE_N: amber-bordered, yellow bg, number -->
    <xf numFmtId="165" fontId="0" fillId="9"  borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 23 SECTION: bold label, light-grey separator -->
    <xf numFmtId="0"   fontId="9" fillId="7"  borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHEET 1 — SUMMARY  (references Cost Basis for adjusted totals)
// ═══════════════════════════════════════════════════════════════════════════════

function buildSummarySheet(d: StellarExportData, sst: SST): string {
  let rows = '';

  // R1 — Title
  rows += row(1, 40, sc(1, 1, 'SwiftEx — Stellar DEX P&L Report', S.TITLE, sst));

  // R2 — subtitle
  rows += row(2, 14, sc(2, 1, `Wallet: ${d.address}  ·  Period: ${d.period}`, S.SUBTITLE, sst));

  // R3 — spacer
  rows += row(3, 8, '');

  // R4 — Warning notice (yellow)
  rows += row(4, 32, sc(4, 1,
    '⚠  All positions start with $0 cost basis from the period start. Go to the "Cost Basis" sheet to enter your opening balances once per asset. The Disposals sheet and this summary will update automatically.',
    S.WARN_BG, sst));

  // R5 — spacer
  rows += row(5, 8, '');

  // R6 — KPI headers
  const kpiHeaders = ['Total Realized P&L', 'Total Unrealized P&L', 'Total P&L', 'USDC Spent', 'USDC Received', 'Net USDC Flow'];
  rows += row(6, 20, kpiHeaders.map((h, i) => sc(6, i + 1, h, S.KPI_LBL, sst)).join(''));

  // R7 — KPI values
  const pnlS = (v: number) => v >= 0 ? S.KPI_GREEN : S.KPI_RED;
  rows += row(7, 32,
    nc(7, 1, d.totalRealized, pnlS(d.totalRealized)) +
    nc(7, 2, d.totalUnrealized, pnlS(d.totalUnrealized)) +
    nc(7, 3, d.totalPnL, pnlS(d.totalPnL)) +
    nc(7, 4, d.usdcSpent, S.KPI_BLUE) +
    nc(7, 5, d.usdcReceived, S.KPI_BLUE) +
    nc(7, 6, d.netUSDCFlow, pnlS(d.netUSDCFlow))
  );

  // R8
  rows += row(8, 10, '');

  // R9 — Adjusted P&L (references Cost Basis TOTAL row via formula)
  const cbPositions = d.positions?.length ?? 0;
  const cbDataStart = 5;
  const cbTotalRow = cbDataStart + Math.max(cbPositions, 5);
  rows += row(9, 22,
    sc(9, 1, 'Adjusted Total P&L (fill Cost Basis sheet to activate)', S.SECTION, sst) +
    fc(9, 6, `${d.totalRealized}+'Cost Basis'!F${cbTotalRow}`, S.FORMULA_NUM, d.totalRealized)
  );

  // R10 — spacer
  rows += row(10, 10, '');

  // R11 — Trade Statistics header
  rows += row(11, 20, sc(11, 1, 'Trade Statistics', S.HDR_NAVY, sst));

  const stats: [string, number][] = [
    ['Raw Trade Legs', d.rawCount ?? d.tradeCount],
    ['Collapsed Trades', d.collapsedCount ?? d.tradeCount],
    ['Disposal Events', d.disposalCount ?? 0],
    ['Scam Tokens Found', d.skippedCount ?? 0],
    ['Unpriced Trades', d.noPriceCount ?? 0],
  ];
  stats.forEach(([label, val], i) => {
    const r = 12 + i;
    const alt = i % 2 === 0;
    rows += row(r, 17,
      sc(r, 1, label, alt ? S.CELL : S.CELL_ALT, sst) +
      nc(r, 2, val, alt ? S.NUM_RIGHT : S.NUM_RIGHT)
    );
  });

  const firstStatRow = 12;
  const lastStatRow = firstStatRow + stats.length - 1;

  // Spacer
  rows += row(lastStatRow + 1, 10, '');

  // R— Current Positions header
  const posHdrRow = lastStatRow + 2;
  rows += row(posHdrRow, 20, sc(posHdrRow, 1, 'Current Positions', S.HDR_NAVY, sst));

  // Position column headers
  const posColHdr = posHdrRow + 1;
  const posHdrs = ['Asset', 'Remaining', 'Avg Cost', 'Current Price', 'Unrealized P&L', 'Realized P&L'];
  rows += row(posColHdr, 18, posHdrs.map((h, i) => sc(posColHdr, i + 1, h, S.HDR_BLUE, sst)).join(''));

  // Positions data
  const positions = d.positions ?? [];
  positions.forEach((pos, i) => {
    const r = posColHdr + 1 + i;
    const alt = i % 2 === 0;
    const bg = alt ? S.CELL : S.CELL_ALT;
    const nbg = alt ? S.NUM : S.NUM_ALT;
    const unrS = (pos.unrealized ?? 0) >= 0 ? S.PNL_GREEN : S.PNL_RED;
    const rzS = pos.realizedPnL >= 0 ? S.PNL_GREEN : S.PNL_RED;
    rows += row(r, 17,
      sc(r, 1, pos.asset, bg, sst) +
      nc(r, 2, pos.remaining, nbg) +
      nc(r, 3, pos.avgCost, nbg) +
      nc(r, 4, pos.currentPrice, nbg) +
      nc(r, 5, pos.unrealized, unrS) +
      nc(r, 6, pos.realizedPnL, rzS)
    );
  });

  if (positions.length === 0) {
    const r = posColHdr + 1;
    rows += row(r, 17, sc(r, 1, 'No position data available', S.CELL, sst));
  }

  // Total row for positions
  const posTotalRow = posColHdr + 1 + Math.max(positions.length, 1);
  const posDataStart = posColHdr + 1;
  const posDataEnd = posColHdr + Math.max(positions.length, 1);
  rows += row(posTotalRow, 20,
    sc(posTotalRow, 1, 'TOTAL', S.TOTAL_LBL, sst) +
    sc(posTotalRow, 2, '', S.TOTAL_LBL, sst) +
    sc(posTotalRow, 3, '', S.TOTAL_LBL, sst) +
    sc(posTotalRow, 4, '', S.TOTAL_LBL, sst) +
    fc(posTotalRow, 5, `SUM(E${posDataStart}:E${posDataEnd})`, S.KPI_GREEN) +
    fc(posTotalRow, 6, `SUM(F${posDataStart}:F${posDataEnd})`, S.KPI_GREEN)
  );

  const cols = [
    `<col min="1" max="1" width="30" customWidth="1"/>`,
    `<col min="2" max="2" width="16" customWidth="1"/>`,
    `<col min="3" max="3" width="16" customWidth="1"/>`,
    `<col min="4" max="4" width="16" customWidth="1"/>`,
    `<col min="5" max="5" width="18" customWidth="1"/>`,
    `<col min="6" max="6" width="18" customWidth="1"/>`,
  ].join('');

  const merges = `<mergeCells count="4">
    <mergeCell ref="A1:F1"/>
    <mergeCell ref="A2:F2"/>
    <mergeCell ref="A4:F4"/>
    <mergeCell ref="A11:B11"/>
  </mergeCells>`;

  return sheet(rows, cols, merges, 6);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHEET 2 — COST BASIS  (user-editable, pre-populated from app data)
// ═══════════════════════════════════════════════════════════════════════════════

function buildCostBasisSheet(d: StellarExportData, sst: SST): string {
  let rows = '';

  // R1 — Title
  rows += row(1, 36, sc(1, 1, 'Cost Basis — Fill In This Sheet (Yellow Cells)', S.TITLE, sst));

  // R2 — instruction
  rows += row(2, 40, sc(2, 1,
    '✏️  INSTRUCTIONS: For each asset held BEFORE this report period, enter how many tokens you held (Column D) and what you paid per token in USD (Column E). Leave blank if you only bought inside the report period. Disposals & Summary update automatically.',
    S.WARN_BG, sst));

  // R3 — spacer
  rows += row(3, 8, '');

  // R4 — Headers: Asset | Issuer | Current Holdings | ← Opening Amount (editable) | ← Cost Per Unit (editable) | Total Opening Cost Basis (formula) | Unrealized P&L (formula)
  const hdrs = ['Asset', 'Issuer', 'Current Holdings\n(from wallet)', '← Opening Amount\n(tokens held before)', '← Cost Per Unit\n(USD you paid)', 'Total Opening\nCost Basis ($)', 'Unrealized P&L\n(approx)'];
  rows += row(4, 40, hdrs.map((h, i) => sc(4, i + 1, h, S.HDR_NAVY, sst)).join(''));

  // Pre-populate from API positions data
  const positions = d.positions ?? [];
  const dataStart = 5;
  const minRows = Math.max(positions.length, 5);

  for (let i = 0; i < minRows; i++) {
    const pos = positions[i];
    const r = dataStart + i;
    const numS = i % 2 === 0 ? S.NUM : S.NUM_ALT;
    if (pos) {
      // Col G: unrealized = current holdings × currentPrice − opening amount × cost per unit
      const unrealFormula = `IFERROR(C${r}*${(pos.currentPrice ?? 0).toFixed(6)}-D${r}*E${r},"—")`;
      rows += row(r, 22,
        sc(r, 1, pos.asset, i % 2 === 0 ? S.CELL : S.CELL_ALT, sst) +
        sc(r, 2, pos.issuer ? `${pos.issuer.slice(0, 10)}...${pos.issuer.slice(-6)}` : 'Native / Stellar', i % 2 === 0 ? S.CELL : S.CELL_ALT, sst) +
        nc(r, 3, pos.remaining, numS) +            // read-only: current holdings from API
        nc(r, 4, null, S.EDITABLE) +               // ← user types: opening amount
        nc(r, 5, null, S.EDITABLE_N) +             // ← user types: cost per unit
        fc(r, 6, `IFERROR(D${r}*E${r},0)`, S.FORMULA_NUM, 0) +
        fc(r, 7, unrealFormula, S.FORMULA_NUM, 0)
      );
    } else {
      rows += row(r, 22,
        sc(r, 1, '', S.CELL, sst) + sc(r, 2, '', S.CELL, sst) + sc(r, 3, '', S.CELL, sst) +
        nc(r, 4, null, S.EDITABLE) + nc(r, 5, null, S.EDITABLE_N) +
        fc(r, 6, `IFERROR(D${r}*E${r},0)`, S.FORMULA_NUM, 0) +
        fc(r, 7, `0`, S.FORMULA_NUM, 0)
      );
    }
  }

  const dataEnd = dataStart + minRows - 1;
  const totalRow = dataEnd + 1;
  rows += row(totalRow, 22,
    sc(totalRow, 1, 'TOTAL', S.TOTAL_LBL, sst) +
    sc(totalRow, 2, '', S.TOTAL_LBL, sst) + sc(totalRow, 3, '', S.TOTAL_LBL, sst) +
    sc(totalRow, 4, '', S.TOTAL_LBL, sst) + sc(totalRow, 5, '', S.TOTAL_LBL, sst) +
    fc(totalRow, 6, `SUM(F${dataStart}:F${dataEnd})`, S.KPI_BLUE, 0) +
    fc(totalRow, 7, `SUM(G${dataStart}:G${dataEnd})`, S.KPI_BLUE, 0)
  );

  const noteRow = totalRow + 2;
  rows += row(noteRow, 16, sc(noteRow, 1,
    '📌  Columns D & E are editable (yellow). All other cells auto-calculate. Disposals sheet uses VLOOKUP on Col A + E for adjusted P&L per trade.',
    S.SECTION, sst));

  const cols = [
    `<col min="1" max="1" width="12" customWidth="1"/>`,
    `<col min="2" max="2" width="24" customWidth="1"/>`,
    `<col min="3" max="3" width="18" customWidth="1"/>`,
    `<col min="4" max="4" width="22" customWidth="1"/>`,
    `<col min="5" max="5" width="20" customWidth="1"/>`,
    `<col min="6" max="6" width="22" customWidth="1"/>`,
    `<col min="7" max="7" width="20" customWidth="1"/>`,
  ].join('');

  const merges = `<mergeCells count="3">
    <mergeCell ref="A1:G1"/>
    <mergeCell ref="A2:G2"/>
    <mergeCell ref="A${noteRow}:G${noteRow}"/>
  </mergeCells>`;

  return sheet(rows, cols, merges, 4);
}



// ═══════════════════════════════════════════════════════════════════════════════
// SHEET 3 — DISPOSALS (tax report, auto-links to Cost Basis via VLOOKUP formula)
// ═══════════════════════════════════════════════════════════════════════════════

function buildDisposalsSheet(d: StellarExportData, sst: SST): string {
  let rows = '';

  // R1 — Title
  rows += row(1, 36, sc(1, 1, 'Disposals — Tax Report', S.TITLE, sst));

  // R2 — notice
  rows += row(2, 30, sc(2, 1,
    'Yellow rows = cost basis unknown. Cost per unit is pulled automatically from the "Cost Basis" sheet. Update the Cost Basis sheet to correct all rows at once.',
    S.WARN_BG, sst));

  // R3 — spacer
  rows += row(3, 8, '');

  // R4 — headers: Date, Asset, Amount Sold, Proceeds($), API P&L($), Cost Per Unit (from CB), Cost Basis($), Adjusted P&L($)
  const hdrs = ['Date', 'Asset', 'Amount Sold', 'Proceeds ($)', 'API P&L ($)', 'Cost Per Unit\n(from Cost Basis)', 'Cost Basis ($)', 'Adjusted P&L ($)'];
  rows += row(4, 36, hdrs.map((h, i) => sc(4, i + 1, h, S.HDR_NAVY, sst)).join(''));

  // Cost Basis sheet lookup range: assets in col A rows 5+, cost per unit in col D
  const cbSheet = "'Cost Basis'";
  const cbLookupRange = `${cbSheet}!$A:$D`;

  // Filter disposals = SELL trades + swap trades (gave side)
  const trades = d.trades ?? [];
  const disposals = trades.filter(t => t.type === 'SELL' || (t.type === 'SWAP' && t.pnlNum !== 0));

  const dataStart = 5;

  disposals.forEach((t, i) => {
    const r = dataStart + i;

    const assetMatch = t.amount.match(/^[\d.]+\s+(\S+)/);
    const assetSymbol = assetMatch ? assetMatch[1] : '';
    const proceeds = parseFloat(t.usdc.replace(/[^0-9.-]/g, '')) || 0;
    const amountSold = parseFloat(t.amount) || 0;
    const apiPnl = t.pnlNum ?? 0;

    const cellStyle = S.CELL;
    const altStyle = S.CELL_ALT;
    const numStyle = S.NUM;
    const numAlt = S.NUM_ALT;

    const useStyle = i % 2 === 0 ? cellStyle : altStyle;
    const numS = i % 2 === 0 ? numStyle : numAlt;
    const pnlS = apiPnl >= 0 ? S.PNL_GREEN : S.PNL_RED;

    const cpuFormula = `IFERROR(VLOOKUP(B${r},${cbLookupRange},5,FALSE),0)`;
    const cbFormula = `C${r}*F${r}`;
    const adjFormula = `D${r}-G${r}`;

    const cpuCached = 0;
    const cbCached = amountSold * cpuCached;
    const adjCached = proceeds - cbCached;

    rows += row(r, 20,
      sc(r, 1, t.date, useStyle, sst) +
      sc(r, 2, assetSymbol, useStyle, sst) +
      nc(r, 3, amountSold, numS) +
      nc(r, 4, proceeds, numS) +
      nc(r, 5, apiPnl, pnlS) +
      fc(r, 6, cpuFormula, S.FORMULA_NUM, cpuCached) +
      fc(r, 7, cbFormula, S.FORMULA_NUM, cbCached) +
      fc(r, 8, adjFormula, adjCached >= 0 ? S.FORMULA_G : S.FORMULA_R, adjCached)
    );
  });

  if (disposals.length === 0) {
    const r = dataStart;
    rows += row(r, 20, sc(r, 1, 'No disposal events found in this period.', S.CELL, sst));
  }

  // Total row
  const dataEnd = dataStart + Math.max(disposals.length, 1) - 1;
  const totalRow = dataEnd + 1;
  rows += row(totalRow, 22,
    sc(totalRow, 1, 'TOTAL', S.TOTAL_LBL, sst) +
    sc(totalRow, 2, '', S.TOTAL_LBL, sst) +
    fc(totalRow, 3, `SUM(C${dataStart}:C${dataEnd})`, S.KPI_BLUE,
      disposals.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)) +
    fc(totalRow, 4, `SUM(D${dataStart}:D${dataEnd})`, S.KPI_BLUE,
      disposals.reduce((s, t) => s + (parseFloat(t.usdc.replace(/[^0-9.-]/g, '')) || 0), 0)) +
    fc(totalRow, 5, `SUM(E${dataStart}:E${dataEnd})`, S.KPI_BLUE,
      disposals.reduce((s, t) => s + (t.pnlNum ?? 0), 0)) +
    sc(totalRow, 6, '', S.TOTAL_LBL, sst) +
    fc(totalRow, 7, `SUM(G${dataStart}:G${dataEnd})`, S.KPI_BLUE, 0) +
    fc(totalRow, 8, `SUM(H${dataStart}:H${dataEnd})`, S.KPI_BLUE, 0)
  );

  const cols = [
    `<col min="1" max="1" width="14" customWidth="1"/>`,
    `<col min="2" max="2" width="12" customWidth="1"/>`,
    `<col min="3" max="3" width="16" customWidth="1"/>`,
    `<col min="4" max="4" width="16" customWidth="1"/>`,
    `<col min="5" max="5" width="16" customWidth="1"/>`,
    `<col min="6" max="6" width="20" customWidth="1"/>`,
    `<col min="7" max="7" width="18" customWidth="1"/>`,
    `<col min="8" max="8" width="18" customWidth="1"/>`,
  ].join('');

  const merges = `<mergeCells count="2">
    <mergeCell ref="A1:H1"/>
    <mergeCell ref="A2:H2"/>
  </mergeCells>`;

  return sheet(rows, cols, merges, 4);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHEET 4 — TRADE LOG  (full chronological record)
// ═══════════════════════════════════════════════════════════════════════════════

function buildTradeLogSheet(d: StellarExportData, sst: SST): string {
  let rows = '';

  // R1 — Title
  rows += row(1, 36, sc(1, 1, 'Full Trade Log', S.TITLE, sst));

  // R2 — headers
  const hdrs = ['Date', 'Type', 'Action', 'Amount', 'Price', 'USDC Value', 'P&L', 'Price Source'];
  rows += row(2, 22, hdrs.map((h, i) => sc(2, i + 1, h, S.HDR_NAVY, sst)).join(''));

  const trades = d.trades ?? [];
  trades.forEach((t, i) => {
    const r = i + 3;
    const alt = i % 2 === 0;
    const bg = alt ? S.CELL : S.CELL_ALT;
    const nbg = alt ? S.NUM : S.NUM_ALT;
    const pnlS = (t.pnlNum ?? 0) > 0 ? S.PNL_GREEN : (t.pnlNum ?? 0) < 0 ? S.PNL_RED : nbg;

    const typeStyle = t.type === 'BUY' ? S.PNL_GREEN : t.type === 'SELL' ? S.PNL_RED : S.KPI_BLUE;

    rows += row(r, 16,
      sc(r, 1, t.date, bg, sst) +
      sc(r, 2, t.type, typeStyle, sst) +
      sc(r, 3, t.action, bg, sst) +
      sc(r, 4, t.amount, bg, sst) +
      sc(r, 5, t.price, nbg, sst) +
      sc(r, 6, t.usdc, nbg, sst) +
      sc(r, 7, t.pnl ?? '', pnlS, sst) +
      sc(r, 8, t.source ?? '', bg, sst)
    );
  });

  if (trades.length === 0) {
    rows += row(3, 16, sc(3, 1, 'No trade data available for this period.', S.CELL, sst));
  }

  // Total row
  const dataStart = 3;
  const dataEnd = dataStart + Math.max(trades.length, 1) - 1;
  const totalRow = dataEnd + 1;
  rows += row(totalRow, 22,
    sc(totalRow, 1, `TOTAL (${trades.length} trades)`, S.TOTAL_LBL, sst)
  );

  const cols = [
    `<col min="1" max="1" width="14" customWidth="1"/>`,
    `<col min="2" max="2" width="9"  customWidth="1"/>`,
    `<col min="3" max="3" width="16" customWidth="1"/>`,
    `<col min="4" max="4" width="36" customWidth="1"/>`,
    `<col min="5" max="5" width="18" customWidth="1"/>`,
    `<col min="6" max="6" width="14" customWidth="1"/>`,
    `<col min="7" max="7" width="14" customWidth="1"/>`,
    `<col min="8" max="8" width="30" customWidth="1"/>`,
  ].join('');

  const merges = `<mergeCells count="1"><mergeCell ref="A1:H1"/></mergeCells>`;

  return sheet(rows, cols, merges, 2);
}

// ═══════════════════════════════════════════════════════════════════════════════
// XLSX PACKAGE ASSEMBLY
// ═══════════════════════════════════════════════════════════════════════════════

function rel(id: string, type: string, target: string): string {
  const base = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  return `<Relationship Id="${id}" Type="${base}${type}" Target="${target}"/>`;
}

function buildXlsxZip(d: StellarExportData): Uint8Array {
  const sst = makeSST();

  // Build sheets (order matters: sst must be built before xml() is called)
  const s1 = buildSummarySheet(d, sst);
  const s2 = buildCostBasisSheet(d, sst);
  const s3 = buildDisposalsSheet(d, sst);
  const s4 = buildTradeLogSheet(d, sst);
  const sstXml = sst.xml();

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml"          ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml"     ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml"            ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rel('rId1', 'officeDocument', 'xl/workbook.xml')}
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Summary"    sheetId="1" r:id="rId1"/>
    <sheet name="Cost Basis" sheetId="2" r:id="rId2"/>
    <sheet name="Disposals"  sheetId="3" r:id="rId3"/>
    <sheet name="Trade Log"  sheetId="4" r:id="rId4"/>
  </sheets>
</workbook>`;

  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rel('rId1', 'worksheet', 'worksheets/sheet1.xml')}
  ${rel('rId2', 'worksheet', 'worksheets/sheet2.xml')}
  ${rel('rId3', 'worksheet', 'worksheets/sheet3.xml')}
  ${rel('rId4', 'worksheet', 'worksheets/sheet4.xml')}
  ${rel('rId5', 'styles', 'styles.xml')}
  ${rel('rId6', 'sharedStrings', 'sharedStrings.xml')}
</Relationships>`;

  const entries: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rootRels),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(wbRels),
    'xl/styles.xml': strToU8(stylesXml()),
    'xl/sharedStrings.xml': strToU8(sstXml),
    'xl/worksheets/sheet1.xml': strToU8(s1),
    'xl/worksheets/sheet2.xml': strToU8(s2),
    'xl/worksheets/sheet3.xml': strToU8(s3),
    'xl/worksheets/sheet4.xml': strToU8(s4),
  };

  return buildZipFromParts(entries);
}

// ─── Download helpers ─────────────────────────────────────────────────────────

function downloadBlob(data: Uint8Array, filename: string, mime: string): void {
  const blob = new Blob([data.buffer as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}


// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API — Stellar Report (real XLSX with 4 sheets + cross-sheet formulas)
// ═══════════════════════════════════════════════════════════════════════════════

export function exportStellarReport(stellar: StellarExportData): void {
  const zip = buildXlsxZip(stellar);
  const suffix = stellar.period.replace(/[^a-zA-Z0-9_-]/g, '_');
  downloadBlob(
    zip,
    `swiftex_stellar_pnl_${suffix}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// dYdX XLSX — 3 sheets: Summary · Trade Log · Transaction History
// ═══════════════════════════════════════════════════════════════════════════════

function usdFmt(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString(); } catch { return String(iso); }
}

function calcDydxStats(dydx: DydxExportData) {
  let closedCount = 0, profitCount = 0, totalPnl = 0;
  dydx.fills.forEach(f => {
    if (f.positionSideBefore && f.positionSizeBefore && f.entryPriceBefore) {
      const sizeBefore = parseFloat(f.positionSizeBefore);
      const entry = parseFloat(f.entryPriceBefore);
      const fp = parseFloat(f.price), fs = parseFloat(f.size);
      let pnl: number | null = null;
      if (f.positionSideBefore === 'LONG' && f.side === 'SELL') pnl = (fp - entry) * Math.min(sizeBefore, fs);
      if (f.positionSideBefore === 'SHORT' && f.side === 'BUY') pnl = (entry - fp) * Math.min(sizeBefore, fs);
      if (pnl !== null) { closedCount++; totalPnl += pnl; if (pnl > 0) profitCount++; }
    }
  });
  const deposits = dydx.transfers.filter(t => t.type === 'DEPOSIT').reduce((s, t) => s + parseFloat(t.size || '0'), 0);
  const withdrawals = dydx.transfers.filter(t => t.type === 'WITHDRAWAL').reduce((s, t) => s + parseFloat(t.size || '0'), 0);
  const startEquity = dydx.pnlHistory.length > 0 ? parseFloat(dydx.pnlHistory[0].equity || '0') : 0;
  const endEquity = dydx.pnlHistory.length > 0 ? parseFloat(dydx.pnlHistory[dydx.pnlHistory.length - 1].equity || '0') : 0;
  return { closedCount, profitCount, totalPnl, deposits, withdrawals, netCapital: deposits - withdrawals, startEquity, endEquity };
}

function buildDydxSummarySheet(dydx: DydxExportData, sst: SST): string {
  const st = calcDydxStats(dydx);
  const winRate = st.closedCount > 0 ? (st.profitCount / st.closedCount) * 100 : 0;
  let rows = '';

  rows += row(1, 40, sc(1, 1, 'SwiftEx — dYdX Perpetuals P&L Report', S.TITLE, sst));
  rows += row(2, 14, sc(2, 1, `Period: ${dydx.period}`, S.SUBTITLE, sst));
  rows += row(3, 8, '');

  const kvRow = (r: number, label: string, val: string | number, isCurrency = false, isPnl = false, pnlVal = 0) => {
    let valCell = '';
    const alt = r % 2 === 0;
    const bg = alt ? S.CELL : S.CELL_ALT;

    if (isCurrency) {
      // currency format, maybe colored if isPnl
      let style: number = alt ? S.NUM : S.NUM_ALT;
      if (isPnl) {
        style = pnlVal >= 0 ? S.PNL_GREEN : S.PNL_RED;
      }
      valCell = nc(r, 2, Number(val), style);
    } else {
      // plain text/number (like counts or percentages)
      // We use string cell with right alignment so it doesn't get the $ format
      valCell = sc(r, 2, String(val), alt ? S.NUM_RIGHT : S.NUM_RIGHT, sst);
    }

    return row(r, 18, sc(r, 1, label, bg, sst) + valCell);
  };

  let r = 4;
  rows += row(r++, 20, sc(r - 1, 1, 'Trading metrics', S.HDR_NAVY, sst));
  rows += kvRow(r++, 'Total Fills (Trades Count)', dydx.fills.length);
  rows += kvRow(r++, 'Closed Trades Count', st.closedCount);
  rows += kvRow(r++, 'Realized Trade PnL', st.totalPnl, true, true, st.totalPnl);

  const successStr = st.closedCount > 0
    ? `${winRate.toFixed(1)}% (${st.profitCount} of ${st.closedCount} profitable)`
    : 'N/A';
  rows += row(r, 18, sc(r, 1, 'Trade Success Rate (%)', r % 2 === 0 ? S.CELL : S.CELL_ALT, sst) + sc(r, 2, successStr, S.NUM_RIGHT, sst));
  r++;

  rows += row(r++, 12, '');
  rows += row(r++, 20, sc(r - 1, 1, 'Financial Performance', S.HDR_NAVY, sst));
  rows += kvRow(r++, 'Starting Account Value (Equity)', st.startEquity, true);
  rows += kvRow(r++, 'Ending Account Value (Equity)', st.endEquity, true);
  rows += kvRow(r++, 'Total Deposited', st.deposits, true);
  rows += kvRow(r++, 'Total Withdrawn', st.withdrawals, true);
  rows += kvRow(r++, 'Net Capital Funded', st.netCapital, true, true, st.netCapital);
  rows += kvRow(r++, 'Net Period Gain/Loss (PnL)', st.totalPnl, true, true, st.totalPnl);

  rows += row(r++, 12, '');
  rows += row(r++, 20, sc(r - 1, 1, '📌  See "Trade Log" sheet for all fills · "Transaction History" for deposits & withdrawals', S.SECTION, sst));

  const cols = [
    `<col min="1" max="1" width="34" customWidth="1"/>`,
    `<col min="2" max="2" width="40" customWidth="1"/>`,
  ].join('');

  const merges = `<mergeCells count="5">
    <mergeCell ref="A1:B1"/>
    <mergeCell ref="A2:B2"/>
    <mergeCell ref="A4:B4"/>
    <mergeCell ref="A9:B9"/>
    <mergeCell ref="A${r - 1}:B${r - 1}"/>
  </mergeCells>`;

  return sheet(rows, cols, merges, 0);
}

function buildDydxTradeLogSheet(dydx: DydxExportData, sst: SST): string {
  let rows = '';

  rows += row(1, 36, sc(1, 1, 'dYdX Trade Log — Fills & Closed PnLs', S.TITLE, sst));

  const hdrs = ['Date', 'Market', 'Side', 'Type', 'Size', 'Price ($)', 'Total Value ($)', 'Fee ($)', 'Liquidity', 'Closed PnL ($)'];
  rows += row(2, 22, hdrs.map((h, i) => sc(2, i + 1, h, S.HDR_NAVY, sst)).join(''));

  const fills = dydx.fills;

  fills.forEach((f, i) => {
    const r = i + 3;
    const alt = i % 2 === 0;
    const bg = alt ? S.CELL : S.CELL_ALT;
    const nbg = alt ? S.NUM : S.NUM_ALT;
    const isBuy = f.side === 'BUY';
    const sideS = isBuy ? S.PNL_GREEN : S.PNL_RED;
    const size = parseFloat(f.size);
    const price = parseFloat(f.price);
    const total = size * price;
    const fee = Math.abs(parseFloat(f.fee || '0'));

    let closedPnl: number | null = null;
    if (f.positionSideBefore && f.positionSizeBefore && f.entryPriceBefore) {
      const sizeBefore = parseFloat(f.positionSizeBefore);
      const entry = parseFloat(f.entryPriceBefore), fp = parseFloat(f.price), fs = parseFloat(f.size);
      if (f.positionSideBefore === 'LONG' && f.side === 'SELL') closedPnl = (fp - entry) * Math.min(sizeBefore, fs);
      if (f.positionSideBefore === 'SHORT' && f.side === 'BUY') closedPnl = (entry - fp) * Math.min(sizeBefore, fs);
    }
    const pnlS = closedPnl == null ? nbg : closedPnl >= 0 ? S.PNL_GREEN : S.PNL_RED;

    rows += row(r, 16,
      sc(r, 1, fmtDate(f.createdAt), bg, sst) +
      sc(r, 2, f.market || (f as any).ticker || '', bg, sst) +
      sc(r, 3, f.side, sideS, sst) +
      sc(r, 4, f.type || '', bg, sst) +
      nc(r, 5, size, nbg) +
      nc(r, 6, price, nbg) +
      nc(r, 7, total, nbg) +
      nc(r, 8, fee, nbg) +
      sc(r, 9, f.liquidity || '', bg, sst) +
      nc(r, 10, closedPnl, pnlS)
    );
  });

  if (!fills.length) {
    rows += row(3, 18, sc(3, 1, 'No fills recorded in this period.', S.CELL, sst));
  }

  const dataStart = 3;
  const dataEnd = dataStart + Math.max(fills.length, 1) - 1;
  const totalRow = dataEnd + 1;
  rows += row(totalRow, 22,
    sc(totalRow, 1, `TOTAL (${fills.length} fills)`, S.TOTAL_LBL, sst) +
    sc(totalRow, 2, '', S.TOTAL_LBL, sst) + sc(totalRow, 3, '', S.TOTAL_LBL, sst) +
    sc(totalRow, 4, '', S.TOTAL_LBL, sst) + sc(totalRow, 5, '', S.TOTAL_LBL, sst) +
    sc(totalRow, 6, '', S.TOTAL_LBL, sst) +
    fc(totalRow, 7, `SUM(G${dataStart}:G${dataEnd})`, S.KPI_BLUE, fills.reduce((s, f) => s + parseFloat(f.size) * parseFloat(f.price), 0)) +
    fc(totalRow, 8, `SUM(H${dataStart}:H${dataEnd})`, S.KPI_BLUE, fills.reduce((s, f) => s + Math.abs(parseFloat(f.fee || '0')), 0)) +
    sc(totalRow, 9, '', S.TOTAL_LBL, sst) +
    fc(totalRow, 10, `SUM(J${dataStart}:J${dataEnd})`, S.KPI_BLUE, 0)
  );

  const cols = [
    `<col min="1"  max="1"  width="20" customWidth="1"/>`,
    `<col min="2"  max="2"  width="12" customWidth="1"/>`,
    `<col min="3"  max="3"  width="8"  customWidth="1"/>`,
    `<col min="4"  max="4"  width="10" customWidth="1"/>`,
    `<col min="5"  max="5"  width="12" customWidth="1"/>`,
    `<col min="6"  max="6"  width="14" customWidth="1"/>`,
    `<col min="7"  max="7"  width="16" customWidth="1"/>`,
    `<col min="8"  max="8"  width="12" customWidth="1"/>`,
    `<col min="9"  max="9"  width="10" customWidth="1"/>`,
    `<col min="10" max="10" width="14" customWidth="1"/>`,
  ].join('');

  const merges = `<mergeCells count="1"><mergeCell ref="A1:J1"/></mergeCells>`;
  return sheet(rows, cols, merges, 2);
}

function buildDydxTransferSheet(dydx: DydxExportData, sst: SST): string {
  let rows = '';

  rows += row(1, 36, sc(1, 1, 'dYdX Transaction History — Deposits & Withdrawals', S.TITLE, sst));

  const hdrs = ['Date', 'Type', 'Amount (USDC)', 'From Address', 'To Address', 'Transaction Hash'];
  rows += row(2, 22, hdrs.map((h, i) => sc(2, i + 1, h, S.HDR_NAVY, sst)).join(''));

  const transfers = dydx.transfers;

  transfers.forEach((t, i) => {
    const r = i + 3;
    const alt = i % 2 === 0;
    const bg = alt ? S.CELL : S.CELL_ALT;
    const nbg = alt ? S.NUM : S.NUM_ALT;
    const isDeposit = t.type === 'DEPOSIT';
    const typeS = isDeposit ? S.PNL_GREEN : S.PNL_RED;
    const amount = parseFloat(t.size || '0');

    rows += row(r, 16,
      sc(r, 1, fmtDate(t.createdAt), bg, sst) +
      sc(r, 2, t.type, typeS, sst) +
      nc(r, 3, amount, nbg) +
      sc(r, 4, t.sender?.address || '', bg, sst) +
      sc(r, 5, t.recipient?.address || '', bg, sst) +
      sc(r, 6, t.transactionHash || '', bg, sst)
    );
  });

  if (!transfers.length) {
    rows += row(3, 18, sc(3, 1, 'No deposits or withdrawals in this period.', S.CELL, sst));
  }

  const dataStart = 3;
  const dataEnd = dataStart + Math.max(transfers.length, 1) - 1;
  const totalRow = dataEnd + 1;
  const totalDeposits = transfers.filter(t => t.type === 'DEPOSIT').reduce((s, t) => s + parseFloat(t.size || '0'), 0);
  const totalWithdrawals = transfers.filter(t => t.type === 'WITHDRAWAL').reduce((s, t) => s + parseFloat(t.size || '0'), 0);
  rows += row(totalRow, 22,
    sc(totalRow, 1, `TOTAL (${transfers.length} transactions)`, S.TOTAL_LBL, sst) +
    sc(totalRow, 2, `↑ ${usdFmt(totalDeposits)}  ↓ ${usdFmt(totalWithdrawals)}`, S.TOTAL_LBL, sst) +
    fc(totalRow, 3, `SUM(C${dataStart}:C${dataEnd})`, S.KPI_BLUE, totalDeposits - totalWithdrawals) +
    sc(totalRow, 4, '', S.TOTAL_LBL, sst) +
    sc(totalRow, 5, '', S.TOTAL_LBL, sst) +
    sc(totalRow, 6, '', S.TOTAL_LBL, sst)
  );

  const cols = [
    `<col min="1" max="1" width="20" customWidth="1"/>`,
    `<col min="2" max="2" width="14" customWidth="1"/>`,
    `<col min="3" max="3" width="16" customWidth="1"/>`,
    `<col min="4" max="4" width="42" customWidth="1"/>`,
    `<col min="5" max="5" width="42" customWidth="1"/>`,
    `<col min="6" max="6" width="60" customWidth="1"/>`,
  ].join('');

  const merges = `<mergeCells count="1"><mergeCell ref="A1:F1"/></mergeCells>`;
  return sheet(rows, cols, merges, 2);
}

function buildDydxXlsx(dydx: DydxExportData): Uint8Array {
  const sst = makeSST();
  const s1 = buildDydxSummarySheet(dydx, sst);
  const s2 = buildDydxTradeLogSheet(dydx, sst);
  const s3 = buildDydxTransferSheet(dydx, sst);
  const sstXml = sst.xml();

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml"          ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml"     ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml"            ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rel('rId1', 'officeDocument', 'xl/workbook.xml')}
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Summary"             sheetId="1" r:id="rId1"/>
    <sheet name="Trade Log"           sheetId="2" r:id="rId2"/>
    <sheet name="Transaction History" sheetId="3" r:id="rId3"/>
  </sheets>
</workbook>`;

  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rel('rId1', 'worksheet', 'worksheets/sheet1.xml')}
  ${rel('rId2', 'worksheet', 'worksheets/sheet2.xml')}
  ${rel('rId3', 'worksheet', 'worksheets/sheet3.xml')}
  ${rel('rId4', 'styles', 'styles.xml')}
  ${rel('rId5', 'sharedStrings', 'sharedStrings.xml')}
</Relationships>`;

  return buildZipFromParts({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rootRels),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(wbRels),
    'xl/styles.xml': strToU8(stylesXml()),
    'xl/sharedStrings.xml': strToU8(sstXml),
    'xl/worksheets/sheet1.xml': strToU8(s1),
    'xl/worksheets/sheet2.xml': strToU8(s2),
    'xl/worksheets/sheet3.xml': strToU8(s3),
  });
}

export function exportDydxReport(dydx: DydxExportData): void {
  const zip = buildDydxXlsx(dydx);
  const suffix = dydx.period.replace(/[^a-zA-Z0-9_-]/g, '_');
  downloadBlob(
    zip,
    `swiftex_dydx_report_${suffix}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}
