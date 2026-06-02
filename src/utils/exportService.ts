import { type HistoricalPnl, type Fill, type Order } from '../modules/dydx/service/dydxOrderService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DydxExportData {
  pnlHistory: HistoricalPnl[];
  fills: Fill[];
  orders: Order[];
  transfers: any[];
  period: string;
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  profit:     '#15803d', // Green-700
  profitBg:   '#f0fdf4', // Green-50
  loss:       '#b91c1c', // Red-700
  lossBg:     '#fef2f2', // Red-50
  deposit:    '#16a34a', // Green-600
  withdrawal: '#d97706', // Amber-600
  rowOdd:     { bg: '#ffffff' },
  rowEven:    { bg: '#f8fafc' }, // Slate-50
};

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function esc(v: string | number | null | undefined): string {
  const s = String(v ?? '');
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cell(
  content: string | number | null,
  opts: { bold?: boolean; color?: string; bg?: string; align?: string; wrap?: boolean; colspan?: number } = {}
): string {
  const style = [
    'border:1px solid #cbd5e1',
    'padding:8px 12px',
    'font-size:11px',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
    opts.bg   ? `background:${opts.bg}` : '',
    opts.color ? `color:${opts.color}` : 'color:#0f172a',
    opts.bold  ? 'font-weight:bold' : 'font-weight:normal',
    opts.align ? `text-align:${opts.align}` : 'text-align:left',
    opts.wrap  ? 'white-space:normal;word-break:break-all' : 'white-space:nowrap',
  ].filter(Boolean).join(';');
  const colspanAttr = opts.colspan ? ` colspan="${opts.colspan}"` : '';
  return `<td style="${style}"${colspanAttr}>${esc(content)}</td>`;
}

function kvRow10(label: string, value: string | number, valueColor?: string, bg?: string): string {
  const cellStyle = (bold: boolean, color: string, align: string) => [
    'border:1px solid #cbd5e1',
    'padding:6px 12px',
    'font-size:11px',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
    `background:${bg || '#ffffff'}`,
    `color:${color}`,
    bold ? 'font-weight:bold' : 'font-weight:normal',
    `text-align:${align}`,
    'white-space:nowrap',
  ].filter(Boolean).join(';');

  return `<tr>
    <td colspan="4" style="${cellStyle(false, '#475569', 'left')}">${esc(label)}</td>
    <td colspan="2" style="${cellStyle(true, valueColor || '#0f172a', 'right')}">${esc(value)}</td>
    <td colspan="4" style="border:none;background:#ffffff;"></td>
  </tr>`;
}

function usd(n: number): string {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${formatted}` : `$${formatted}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString(); } catch { return String(iso); }
}

// ─── Section builders ─────────────────────────────────────────────────────────

function buildDydxSummaryRows(dydx: DydxExportData): string {
  const totalDeposits = dydx.transfers
    .filter(t => t.type === 'DEPOSIT')
    .reduce((s, t) => s + parseFloat(t.size || '0'), 0);
  const totalWithdrawals = dydx.transfers
    .filter(t => t.type === 'WITHDRAWAL')
    .reduce((s, t) => s + parseFloat(t.size || '0'), 0);
  const netCapital = totalDeposits - totalWithdrawals;

  const startEquity = dydx.pnlHistory.length > 0 ? parseFloat(dydx.pnlHistory[0].equity || '0') : 0;
  const endEquity = dydx.pnlHistory.length > 0 ? parseFloat(dydx.pnlHistory[dydx.pnlHistory.length - 1].equity || '0') : 0;
  
  let closedTradesCount = 0;
  let profitableTradesCount = 0;
  let totalClosedPnl = 0;

  dydx.fills.forEach(f => {
    if (f.positionSideBefore && f.positionSizeBefore && f.entryPriceBefore) {
      const sizeBefore = parseFloat(f.positionSizeBefore);
      const entry = parseFloat(f.entryPriceBefore);
      const fp = parseFloat(f.price);
      const fs = parseFloat(f.size);
      let cpnl: number | null = null;
      if (f.positionSideBefore === 'LONG' && f.side === 'SELL') cpnl = (fp - entry) * Math.min(sizeBefore, fs);
      if (f.positionSideBefore === 'SHORT' && f.side === 'BUY') cpnl = (entry - fp) * Math.min(sizeBefore, fs);
      if (cpnl !== null) {
        closedTradesCount++;
        totalClosedPnl += cpnl;
        if (cpnl > 0) profitableTradesCount++;
      }
    }
  });

  const netTradingGain = totalClosedPnl;
  const winRate = closedTradesCount > 0 ? (profitableTradesCount / closedTradesCount) * 100 : 0;

  // KPI Dashboard styling configurations
  const isPnlPositive = netTradingGain >= 0;
  const pnlCardBg = isPnlPositive ? '#ecfdf5' : '#fef2f2';
  const pnlCardBorder = isPnlPositive ? '#bbf7d0' : '#fecaca';
  const pnlCardTextColor = isPnlPositive ? '#166534' : '#991b1b';
  const pnlSign = isPnlPositive ? '+' : '';
  const pnlValue = `${pnlSign}${usd(netTradingGain)}`;

  const successCardBg = '#f8fafc';
  const successCardBorder = '#cbd5e1';
  const successCardTextColor = '#0f172a';
  const successValue = closedTradesCount > 0 ? `${winRate.toFixed(1)}%` : '0.0%';
  const successSub = closedTradesCount > 0
    ? `${profitableTradesCount} of ${closedTradesCount} trades in profit`
    : 'No closed trades recorded';

  const isCapitalPositive = netCapital >= 0;
  const capCardBg = isCapitalPositive ? '#ecfdf5' : '#fffbeb';
  const capCardBorder = isCapitalPositive ? '#bbf7d0' : '#fde68a';
  const capCardTextColor = isCapitalPositive ? '#166534' : '#92400e';
  const capSign = isCapitalPositive ? '+' : '';
  const capValue = `${capSign}${usd(netCapital)}`;
  const capSub = `${usd(totalDeposits)} In / ${usd(totalWithdrawals)} Out`;

  return `
    <!-- MAIN TITLE BAR -->
    <tr>
      <th colspan="10" style="background:#0f172a;color:#ffffff;font-size:14px;font-weight:bold;padding:14px 16px;text-align:left;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:0.5px;">dYdX TRADING PERFORMANCE REPORT</th>
    </tr>
    <tr>
      <th colspan="10" style="background:#1e293b;color:#e2e8f0;font-size:11px;font-weight:normal;padding:8px 16px;text-align:left;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;border-bottom:2px solid #cbd5e1;">Reporting Period: ${esc(dydx.period)}</th>
    </tr>
    
    <!-- Visual Spacer -->
    <tr style="height:12px;border:none;">
      <td colspan="10" style="border:none;background:transparent;height:12px;"></td>
    </tr>

    <!-- VISUAL KPI DASHBOARD CARDS ROW -->
    <tr style="height:90px;">
      <!-- Net Period PnL Card -->
      <td colspan="3" style="background:${pnlCardBg};border:2px solid ${pnlCardBorder};padding:22px 14px;text-align:center;vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
        <span style="font-size:10px;color:${pnlCardTextColor};font-weight:bold;text-transform:uppercase;letter-spacing:0.8px;">${isPnlPositive ? '📈 Net Profit' : '📉 Net Loss'}</span>
        <br /><br />
        <span style="font-size:22px;color:${pnlCardTextColor};font-weight:bold;font-family:Arial,sans-serif;">${esc(pnlValue)}</span>
        <br /><br />
        <span style="font-size:9.5px;color:${pnlCardTextColor};opacity:0.8;font-style:italic;">Trading net performance</span>
      </td>
      <!-- Trade Success Rate Card -->
      <td colspan="4" style="background:${successCardBg};border:2px solid ${successCardBorder};padding:22px 14px;text-align:center;vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
        <span style="font-size:10px;color:${successCardTextColor};font-weight:bold;text-transform:uppercase;letter-spacing:0.8px;">🎯 Success Rate</span>
        <br /><br />
        <span style="font-size:22px;color:${successCardTextColor};font-weight:bold;font-family:Arial,sans-serif;">${esc(successValue)}</span>
        <br /><br />
        <span style="font-size:9.5px;color:#475569;font-style:italic;">${esc(successSub)}</span>
      </td>
      <!-- Net Capital Flow Card -->
      <td colspan="3" style="background:${capCardBg};border:2px solid ${capCardBorder};padding:22px 14px;text-align:center;vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
        <span style="font-size:10px;color:${capCardTextColor};font-weight:bold;text-transform:uppercase;letter-spacing:0.8px;">💰 Net Capital Flow</span>
        <br /><br />
        <span style="font-size:22px;color:${capCardTextColor};font-weight:bold;font-family:Arial,sans-serif;">${esc(capValue)}</span>
        <br /><br />
        <span style="font-size:9.5px;color:${capCardTextColor};opacity:0.8;font-style:italic;">${esc(capSub)}</span>
      </td>
    </tr>

    <!-- Visual Spacer -->
    <tr style="height:16px;border:none;">
      <td colspan="10" style="border:none;background:transparent;height:16px;"></td>
    </tr>

    <!-- SUMMARY DETAILS SECTION -->
    <tr>
      <td colspan="10" style="background:#f1f5f9;color:#0f172a;font-weight:bold;font-size:11px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:8px 12px;text-align:left;text-transform:uppercase;letter-spacing:0.5px;border:1px solid #cbd5e1;">Trading metrics</td>
    </tr>
    ${kvRow10('Total Fills (Trades Count)', dydx.fills.length, '#0f172a', '#ffffff')}
    ${kvRow10('Closed Trades Count', closedTradesCount, '#0f172a', '#f8fafc')}
    ${kvRow10('Realized Trade PnL', usd(totalClosedPnl), totalClosedPnl >= 0 ? C.profit : C.loss, '#ffffff')}
    ${kvRow10('Trade Success Rate (%)', closedTradesCount > 0 ? `${winRate.toFixed(1)}% (${profitableTradesCount} of ${closedTradesCount} profitable trades)` : 'N/A', closedTradesCount > 0 && winRate >= 50 ? C.profit : C.loss, '#f8fafc')}
    
    <tr>
      <td colspan="10" style="background:#f1f5f9;color:#0f172a;font-weight:bold;font-size:11px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:8px 12px;text-align:left;text-transform:uppercase;letter-spacing:0.5px;border:1px solid #cbd5e1;">Financial Performance</td>
    </tr>
    ${kvRow10('Starting Account Value (Equity)', usd(startEquity), '#0f172a', '#ffffff')}
    ${kvRow10('Ending Account Value (Equity)', usd(endEquity), '#0f172a', '#f8fafc')}
    ${kvRow10('Total Deposited', usd(totalDeposits), C.deposit, '#ffffff')}
    ${kvRow10('Total Withdrawn', usd(totalWithdrawals), C.withdrawal, '#f8fafc')}
    ${kvRow10('Net Capital Funded', usd(netCapital), netCapital >= 0 ? C.deposit : C.withdrawal, '#ffffff')}
    ${kvRow10('Net Period Gain/Loss (PnL)', usd(netTradingGain), netTradingGain >= 0 ? C.profit : C.loss, '#f8fafc')}
  `;
}

function buildFillsRows(fills: Fill[]): string {
  const headerHtml = `
    <tr>
      <th colspan="10" style="background:#0f172a;color:#ffffff;font-size:12px;font-weight:bold;padding:10px 12px;text-align:left;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:0.5px;">dYdX TRADING HISTORY (FILLS & CLOSED PNLS)</th>
    </tr>
    <tr style="background:#334155;color:#ffffff;font-size:10px;font-weight:bold;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-transform:uppercase;">
      <th style="padding:8px 12px;border:1px solid #cbd5e1;text-align:left;">Date</th>
      <th style="padding:8px 12px;border:1px solid #cbd5e1;text-align:left;">Market</th>
      <th style="padding:8px 12px;border:1px solid #cbd5e1;text-align:center;">Side</th>
      <th style="padding:8px 12px;border:1px solid #cbd5e1;text-align:center;">Type</th>
      <th style="padding:8px 12px;border:1px solid #cbd5e1;text-align:right;">Size</th>
      <th style="padding:8px 12px;border:1px solid #cbd5e1;text-align:right;">Price</th>
      <th style="padding:8px 12px;border:1px solid #cbd5e1;text-align:right;">Total Value</th>
      <th style="padding:8px 12px;border:1px solid #cbd5e1;text-align:right;">Fee Paid</th>
      <th style="padding:8px 12px;border:1px solid #cbd5e1;text-align:center;">Liquidity</th>
      <th style="padding:8px 12px;border:1px solid #cbd5e1;text-align:right;background:#1e293b;">Closed PnL</th>
    </tr>
  `;

  if (!fills.length) {
    return `
      ${headerHtml}
      <tr>
        <td colspan="10" style="border:1px solid #cbd5e1;padding:16px;text-align:center;color:#64748b;font-size:11px;font-family:-apple-system,sans-serif;background:#ffffff;">No trade fills recorded in this period.</td>
      </tr>
    `;
  }

  const rows = fills.map((f, i) => {
    const bg = i % 2 === 0 ? C.rowOdd.bg : C.rowEven.bg;
    const size = parseFloat(f.size);
    const price = parseFloat(f.price);
    const total = size * price;
    const fee = Math.abs(parseFloat(f.fee || '0'));
    const isBuy = f.side === 'BUY';

    let closedPnl = '';
    let pnlColor = '#0f172a';
    let pnlBg = bg;
    if (f.positionSideBefore && f.positionSizeBefore && f.entryPriceBefore) {
      const sizeBefore = parseFloat(f.positionSizeBefore);
      const entry = parseFloat(f.entryPriceBefore);
      const fp = parseFloat(f.price);
      const fs = parseFloat(f.size);
      let cpnl: number | null = null;
      if (f.positionSideBefore === 'LONG' && f.side === 'SELL') cpnl = (fp - entry) * Math.min(sizeBefore, fs);
      if (f.positionSideBefore === 'SHORT' && f.side === 'BUY') cpnl = (entry - fp) * Math.min(sizeBefore, fs);
      if (cpnl !== null) {
        closedPnl = cpnl >= 0 ? `+${usd(cpnl)}` : usd(cpnl);
        pnlColor = cpnl >= 0 ? C.profit : C.loss;
        pnlBg = cpnl >= 0 ? C.profitBg : C.lossBg;
      }
    }

    return `<tr>
      ${cell(fmtDate(f.createdAt), { bg })}
      ${cell(f.market || (f as any).ticker || '', { bg })}
      ${cell(f.side, { bg, bold: true, color: isBuy ? C.profit : C.loss, align: 'center' })}
      ${cell(f.type, { bg, align: 'center' })}
      ${cell(size.toFixed(4), { bg, align: 'right' })}
      ${cell(usd(price), { bg, align: 'right' })}
      ${cell(usd(total), { bg, align: 'right', bold: true })}
      ${cell(usd(fee), { bg, align: 'right', color: C.loss })}
      ${cell(f.liquidity || '', { bg, align: 'center' })}
      ${cell(closedPnl, { bg: pnlBg, align: 'right', color: pnlColor, bold: !!closedPnl })}
    </tr>`;
  }).join('');

  return headerHtml + rows;
}

function buildTransfersRows(transfers: any[]): string {
  const headerHtml = `
    <tr>
      <th colspan="10" style="background:#0f172a;color:#ffffff;font-size:12px;font-weight:bold;padding:10px 12px;text-align:left;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:0.5px;">dYdX DEPOSITS & WITHDRAWALS LOG</th>
    </tr>
    <tr style="background:#334155;color:#ffffff;font-size:10px;font-weight:bold;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-transform:uppercase;">
      <th colspan="2" style="padding:8px 12px;border:1px solid #cbd5e1;text-align:left;">Date</th>
      <th style="padding:8px 12px;border:1px solid #cbd5e1;text-align:center;">Type</th>
      <th colspan="2" style="padding:8px 12px;border:1px solid #cbd5e1;text-align:right;">Amount (USDC)</th>
      <th style="padding:8px 12px;border:1px solid #cbd5e1;text-align:left;">From Address</th>
      <th style="padding:8px 12px;border:1px solid #cbd5e1;text-align:left;">To Address</th>
      <th colspan="3" style="padding:8px 12px;border:1px solid #cbd5e1;text-align:left;">Transaction Hash</th>
    </tr>
  `;

  if (!transfers.length) {
    return `
      ${headerHtml}
      <tr>
        <td colspan="10" style="border:1px solid #cbd5e1;padding:16px;text-align:center;color:#64748b;font-size:11px;font-family:-apple-system,sans-serif;background:#ffffff;">No deposits or withdrawals recorded in this period.</td>
      </tr>
    `;
  }

  const rows = transfers.map((t, i) => {
    const bg = i % 2 === 0 ? C.rowOdd.bg : C.rowEven.bg;
    const isDeposit = t.type === 'DEPOSIT';
    const amount = parseFloat(t.size || '0');
    return `<tr>
      ${cell(fmtDate(t.createdAt), { bg, colspan: 2 })}
      ${cell(t.type, { bg, bold: true, color: isDeposit ? C.deposit : C.withdrawal, align: 'center' })}
      ${cell(usd(amount), { bg, align: 'right', bold: true, color: isDeposit ? C.deposit : C.withdrawal, colspan: 2 })}
      ${cell(t.sender?.address || '', { bg, wrap: true })}
      ${cell(t.recipient?.address || '', { bg, wrap: true })}
      ${cell(t.transactionHash || '', { bg, wrap: true, colspan: 3 })}
    </tr>`;
  }).join('');

  return headerHtml + rows;
}

// ─── HTML wrapper ─────────────────────────────────────────────────────────────

function wrapHtml(title: string, tableRowsHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 24px; background: #ffffff; color: #0f172a; }
    h1 { font-size: 20px; font-weight: bold; margin-bottom: 2px; color: #0f172a; }
    p.sub { color: #64748b; font-size: 11px; margin-bottom: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  </style>
</head>
<body>
  <h1>${esc(title)}</h1>
  <p class="sub">Generated: ${new Date().toLocaleString()} &nbsp;·&nbsp; SwiftEx Wallet & Exchange</p>
  
  <table style="border-collapse:collapse;width:100%;">
    <!-- Global column width alignment to avoid page distortion -->
    <colgroup>
      <col style="width: 140pt;" /> <!-- Date -->
      <col style="width: 70pt;" />  <!-- Market -->
      <col style="width: 55pt;" />  <!-- Side -->
      <col style="width: 60pt;" />  <!-- Type -->
      <col style="width: 75pt;" />  <!-- Size -->
      <col style="width: 85pt;" />  <!-- Price -->
      <col style="width: 95pt;" />  <!-- Total Value -->
      <col style="width: 65pt;" />  <!-- Fee Paid -->
      <col style="width: 65pt;" />  <!-- Liquidity -->
      <col style="width: 95pt;" />  <!-- Closed PnL -->
    </colgroup>
    <tbody>
      ${tableRowsHtml}
    </tbody>
  </table>
</body>
</html>`;
}

function downloadHtml(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Export ONLY dYdX trading summary, fills/trades, and transfers history */
export function exportDydxReport(dydx: DydxExportData): void {
  const spacerRow = `
    <tr style="height:24px;border:none;">
      <td colspan="10" style="border:none;background:transparent;height:24px;"></td>
    </tr>
  `;

  const rows = [
    buildDydxSummaryRows(dydx),
    spacerRow,
    buildFillsRows(dydx.fills),
    spacerRow,
    buildTransfersRows(dydx.transfers),
  ].join('');

  const suffix = dydx.period.replace(/[^a-zA-Z0-9_-]/g, '_');
  downloadHtml(
    wrapHtml(`SwiftEx dYdX Trading Report — ${dydx.period}`, rows),
    `dydx_report_${suffix}.xls`
  );
}

// ─── Stellar Report Export ───────────────────────────────────────────────────

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
  winRate?: number;
  bestTrade?: {
    date: string;
    asset: string;
    pnl: number;
  };
  worstTrade?: {
    date: string;
    asset: string;
    pnl: number;
  };
  firstTradeDate?: string;
  lastTradeDate?: string;
  activeDays?: number;
  mostTradedAsset?: string;
  totalPortfolioValue?: number;
  totalCostBasis?: number;
  openPnLPct?: number;
  largestPosition?: {
    asset: string;
    issuer: string;
    remaining: number;
    currentValue: number;
  };
  history?: Array<{
    date: string;
    realized: number;
    unrealized: number;
    pnl: number;
    balance: number;
  }>;
}

function buildStellarSummaryRows(stellar: StellarExportData): string {
  const isPnlPositive = stellar.totalPnL >= 0;
  const pnlCardBg = isPnlPositive ? '#ecfdf5' : '#fef2f2';
  const pnlCardBorder = isPnlPositive ? '#bbf7d0' : '#fecaca';
  const pnlCardTextColor = isPnlPositive ? '#166534' : '#991b1b';
  const pnlSign = isPnlPositive ? '+' : '';
  const pnlValue = `${pnlSign}${usd(stellar.totalPnL)}`;

  const successCardBg = '#f8fafc';
  const successCardBorder = '#cbd5e1';
  const successCardTextColor = '#0f172a';
  const successValue = stellar.winRate !== undefined ? `${stellar.winRate}%` : 'N/A';
  const successSub = `Win Rate over active days`;

  const capCardBg = stellar.netUSDCFlow >= 0 ? '#ecfdf5' : '#fffbeb';
  const capCardBorder = stellar.netUSDCFlow >= 0 ? '#bbf7d0' : '#fde68a';
  const capCardTextColor = stellar.netUSDCFlow >= 0 ? '#166534' : '#92400e';
  const capSign = stellar.netUSDCFlow >= 0 ? '+' : '';
  const capValue = `${capSign}${usd(stellar.netUSDCFlow)}`;
  const capSub = `${usd(stellar.usdcReceived)} In / ${usd(stellar.usdcSpent)} Out`;

  return `
    <!-- MAIN TITLE BAR -->
    <tr>
      <th colspan="10" style="background:#4c1d95;color:#ffffff;font-size:14px;font-weight:bold;padding:14px 16px;text-align:left;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:0.5px;">STELLAR WALLET PERFORMANCE REPORT</th>
    </tr>
    <tr>
      <th colspan="10" style="background:#581c87;color:#f3e8ff;font-size:11px;font-weight:normal;padding:8px 16px;text-align:left;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;border-bottom:2px solid #cbd5e1;">Wallet Address: ${esc(stellar.address)} &nbsp;·&nbsp; Reporting Period: ${esc(stellar.period)}</th>
    </tr>
    
    <!-- Visual Spacer -->
    <tr style="height:12px;border:none;">
      <td colspan="10" style="border:none;background:transparent;height:12px;"></td>
    </tr>

    <!-- VISUAL KPI DASHBOARD CARDS ROW -->
    <tr style="height:90px;">
      <!-- Net Period PnL Card -->
      <td colspan="3" style="background:${pnlCardBg};border:2px solid ${pnlCardBorder};padding:22px 14px;text-align:center;vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
        <span style="font-size:10px;color:${pnlCardTextColor};font-weight:bold;text-transform:uppercase;letter-spacing:0.8px;">${isPnlPositive ? '📈 Net Profit' : '📉 Net Loss'}</span>
        <br /><br />
        <span style="font-size:22px;color:${pnlCardTextColor};font-weight:bold;font-family:Arial,sans-serif;">${esc(pnlValue)}</span>
        <br /><br />
        <span style="font-size:9.5px;color:${pnlCardTextColor};opacity:0.8;font-style:italic;">Stellar wallet net performance</span>
      </td>
      <!-- Trade Success Rate Card -->
      <td colspan="4" style="background:${successCardBg};border:2px solid ${successCardBorder};padding:22px 14px;text-align:center;vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
        <span style="font-size:10px;color:${successCardTextColor};font-weight:bold;text-transform:uppercase;letter-spacing:0.8px;">🎯 Win Rate</span>
        <br /><br />
        <span style="font-size:22px;color:${successCardTextColor};font-weight:bold;font-family:Arial,sans-serif;">${esc(successValue)}</span>
        <br /><br />
        <span style="font-size:9.5px;color:#475569;font-style:italic;">${esc(successSub)}</span>
      </td>
      <!-- Net Capital Flow Card -->
      <td colspan="3" style="background:${capCardBg};border:2px solid ${capCardBorder};padding:22px 14px;text-align:center;vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
        <span style="font-size:10px;color:${capCardTextColor};font-weight:bold;text-transform:uppercase;letter-spacing:0.8px;">💰 Net Capital Flow (USDC)</span>
        <br /><br />
        <span style="font-size:22px;color:${capCardTextColor};font-weight:bold;font-family:Arial,sans-serif;">${esc(capValue)}</span>
        <br /><br />
        <span style="font-size:9.5px;color:${capCardTextColor};opacity:0.8;font-style:italic;">${esc(capSub)}</span>
      </td>
    </tr>

    <!-- Visual Spacer -->
    <tr style="height:16px;border:none;">
      <td colspan="10" style="border:none;background:transparent;height:16px;"></td>
    </tr>

    <!-- SUMMARY DETAILS SECTION -->
    <tr>
      <td colspan="10" style="background:#f1f5f9;color:#0f172a;font-weight:bold;font-size:11px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:8px 12px;text-align:left;text-transform:uppercase;letter-spacing:0.5px;border:1px solid #cbd5e1;">Wallet metrics</td>
    </tr>
    ${kvRow10('Total Trades Count', stellar.tradeCount, '#0f172a', '#ffffff')}
    ${kvRow10('Open Positions Count', stellar.positionCount, '#0f172a', '#f8fafc')}
    ${kvRow10('Disposals Count', stellar.disposalCount, '#0f172a', '#ffffff')}
    
    <tr>
      <td colspan="10" style="background:#f1f5f9;color:#0f172a;font-weight:bold;font-size:11px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:8px 12px;text-align:left;text-transform:uppercase;letter-spacing:0.5px;border:1px solid #cbd5e1;">Trading History & Highlights</td>
    </tr>
    ${kvRow10('First Trade Date', stellar.firstTradeDate || 'N/A', '#0f172a', '#ffffff')}
    ${kvRow10('Last Trade Date', stellar.lastTradeDate || 'N/A', '#0f172a', '#f8fafc')}
    ${kvRow10('Active Days Count', stellar.activeDays !== undefined ? stellar.activeDays : 'N/A', '#0f172a', '#ffffff')}
    ${kvRow10('Most Traded Asset', stellar.mostTradedAsset || 'N/A', '#0f172a', '#f8fafc')}
    ${kvRow10('Best Trade', stellar.bestTrade ? `${stellar.bestTrade.asset} (${stellar.bestTrade.date}): +${usd(stellar.bestTrade.pnl)}` : 'N/A', stellar.bestTrade && stellar.bestTrade.pnl >= 0 ? C.profit : C.loss, '#ffffff')}
    ${kvRow10('Worst Trade', stellar.worstTrade ? `${stellar.worstTrade.asset} (${stellar.worstTrade.date}): ${usd(stellar.worstTrade.pnl)}` : 'N/A', stellar.worstTrade && stellar.worstTrade.pnl >= 0 ? C.profit : C.loss, '#f8fafc')}

    <tr>
      <td colspan="10" style="background:#f1f5f9;color:#0f172a;font-weight:bold;font-size:11px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:8px 12px;text-align:left;text-transform:uppercase;letter-spacing:0.5px;border:1px solid #cbd5e1;">Valuation & Positions</td>
    </tr>
    ${kvRow10('Total Cost Basis', stellar.totalCostBasis !== undefined ? usd(stellar.totalCostBasis) : 'N/A', '#0f172a', '#ffffff')}
    ${kvRow10('Total Portfolio Value', stellar.totalPortfolioValue !== undefined ? usd(stellar.totalPortfolioValue) : 'N/A', '#0f172a', '#f8fafc')}
    ${kvRow10('Open PnL %', stellar.openPnLPct !== undefined ? `${stellar.openPnLPct}%` : 'N/A', stellar.openPnLPct !== undefined && stellar.openPnLPct >= 0 ? C.profit : C.loss, '#ffffff')}
    ${kvRow10('Largest Position', stellar.largestPosition ? `${stellar.largestPosition.asset}: ${stellar.largestPosition.remaining.toFixed(4)} assets (Valued at ${usd(stellar.largestPosition.currentValue)})` : 'N/A', '#0f172a', '#f8fafc')}

    <tr>
      <td colspan="10" style="background:#f1f5f9;color:#0f172a;font-weight:bold;font-size:11px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:8px 12px;text-align:left;text-transform:uppercase;letter-spacing:0.5px;border:1px solid #cbd5e1;">Financial Performance</td>
    </tr>
    ${kvRow10('Realized PnL', usd(stellar.totalRealized), stellar.totalRealized >= 0 ? C.profit : C.loss, '#ffffff')}
    ${kvRow10('Unrealized PnL', usd(stellar.totalUnrealized), stellar.totalUnrealized >= 0 ? C.profit : C.loss, '#f8fafc')}
    ${kvRow10('USDC Spent', usd(stellar.usdcSpent), C.withdrawal, '#ffffff')}
    ${kvRow10('USDC Received', usd(stellar.usdcReceived), C.deposit, '#f8fafc')}
    ${kvRow10('Net USDC Flow', usd(stellar.netUSDCFlow), stellar.netUSDCFlow >= 0 ? C.deposit : C.withdrawal, '#ffffff')}
    ${kvRow10('Net Period Gain/Loss (PnL)', usd(stellar.totalPnL), stellar.totalPnL >= 0 ? C.profit : C.loss, '#f8fafc')}
  `;
}

export function exportStellarReport(stellar: StellarExportData): void {
  const rows = [
    buildStellarSummaryRows(stellar),
  ].join('');

  const suffix = stellar.period.replace(/[^a-zA-Z0-9_-]/g, '_');
  downloadHtml(
    wrapHtml(`SwiftEx Stellar Trading Report — ${stellar.period}`, rows),
    `stellar_report_${suffix}.xls`
  );
}

