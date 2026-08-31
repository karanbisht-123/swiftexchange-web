import {
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Image as ImageIcon,
  MessageCircle,
  Share2,
  X,
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import {
  RedditIcon,
  RedditShareButton,
  TelegramIcon,
  TelegramShareButton,
  TwitterIcon,
  TwitterShareButton,
  WhatsappIcon,
  WhatsappShareButton,
} from 'react-share';

import QRCode from 'qrcode';

interface StellarSharePnlModalProps {
  isOpen: boolean;
  onClose: () => void;
  address: string;
  totalPnL: number;
  winRate: number;
  bestTrade?: { asset: string; pnl: number };
  timeframe: string;
}

export const StellarSharePnlModal: React.FC<StellarSharePnlModalProps> = ({
  isOpen,
  onClose,
  address,
  totalPnL,
  winRate,
  bestTrade,
  timeframe,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedDiscord, setCopiedDiscord] = useState(false);
  const [hideAmount, setHideAmount] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const isProfit = totalPnL >= 0;
  const rawPnLStr =
    (isProfit ? '+' : '') +
    totalPnL.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });

  const displayPnL = hideAmount ? (isProfit ? '+$••••••' : '-$••••••') : rawPnLStr;
  const maskedAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Trader';

  const officialBaseUrl = 'https://app.swiftexchange.io';
  const logoUrl = 'https://app.swiftexchange.io/logo.png';
  const shareUrl = address
    ? `${officialBaseUrl}/stellar/portfolio?address=${address}`
    : officialBaseUrl;

  const shareTitle = `My Stellar Trading PnL on @SwiftExExchange (${timeframe.toUpperCase()})\n${
    hideAmount ? '💰 PnL: Verified Profit' : `💰 PnL: ${rawPnLStr}`
  }\n🎯 Win Rate: ${winRate}%\n⚡ Network: Stellar Pubnet`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const generateCanvas = async (): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 675;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    // Dark Luxury Gradient Background
    const bgGrad = ctx.createLinearGradient(0, 0, 1200, 675);
    bgGrad.addColorStop(0, '#060a14');
    bgGrad.addColorStop(0.5, '#0b1224');
    bgGrad.addColorStop(1, '#05070d');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1200, 675);

    // Glowing Ambient Neon Light
    const glow = ctx.createRadialGradient(600, 300, 30, 600, 300, 480);
    glow.addColorStop(0, isProfit ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1200, 675);

    // Outer Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 3;
    ctx.strokeRect(35, 35, 1130, 605);

    // Load and draw SwiftEx Logo
    try {
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      logoImg.src = logoUrl;
      await new Promise(resolve => {
        logoImg.onload = resolve;
        logoImg.onerror = resolve;
      });
      if (logoImg.complete && logoImg.naturalWidth > 0) {
        ctx.drawImage(logoImg, 75, 68, 48, 48);
      }
    } catch {
      // ignore
    }

    // Brand Header Text
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 32px sans-serif';
    ctx.fillText('SwiftEx', 135, 102);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '22px monospace';
    ctx.fillText(`${maskedAddress}  |  ${timeframe.toUpperCase()}`, 75, 160);

    // Realized PnL Value
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('TOTAL REALIZED PNL', 75, 250);

    ctx.fillStyle = isProfit ? '#10b981' : '#f43f5e';
    ctx.font = 'bold 80px sans-serif';
    ctx.fillText(displayPnL, 75, 340);

    // 3 Stat Metric Cards
    const cardY = 410;
    const cardH = 120;

    // Card 1: Win Rate
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(75, cardY, 300, cardH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeRect(75, cardY, 300, cardH);

    ctx.fillStyle = '#c084fc';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('WIN RATE', 100, cardY + 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(`${winRate}%`, 100, cardY + 95);

    // Card 2: Top Asset
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(405, cardY, 300, cardH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeRect(405, cardY, 300, cardH);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('TOP ASSET', 430, cardY + 40);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(bestTrade?.asset || 'XLM', 430, cardY + 95);

    // Card 3: Network
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(735, cardY, 390, cardH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeRect(735, cardY, 390, cardH);

    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('NETWORK', 760, cardY + 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('STELLAR PUBNET', 760, cardY + 95);

    // Mini QR Code for Verified On-Chain Link
    try {
      const qrDataUrl = await QRCode.toDataURL(shareUrl, {
        width: 70,
        margin: 1,
        color: { dark: '#38bdf8', light: '#00000000' },
      });
      const qrImg = new Image();
      qrImg.src = qrDataUrl;
      await new Promise(resolve => {
        qrImg.onload = resolve;
        qrImg.onerror = resolve;
      });
      if (qrImg.complete) {
        ctx.drawImage(qrImg, 1050, 555, 70, 70);
      }
    } catch {
      // ignore
    }

    // Footer Watermark
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('https://app.swiftexchange.io', 75, 595);

    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('✓ VERIFIED ON-CHAIN', 820, 595);

    return canvas;
  };

  const handleDownloadImage = async () => {
    const canvas = await generateCanvas();
    const link = document.createElement('a');
    link.download = `swiftex-pnl-${address.slice(0, 6)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleCopyImageToClipboard = async () => {
    try {
      const canvas = await generateCanvas();
      canvas.toBlob(async blob => {
        if (!blob) return;
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': blob,
          }),
        ]);
        setCopiedImage(true);
        setTimeout(() => setCopiedImage(false), 2500);
      });
    } catch {
      handleDownloadImage();
    }
  };

  const handleDiscordShare = async () => {
    await handleCopyImageToClipboard();
    setCopiedDiscord(true);
    setTimeout(() => setCopiedDiscord(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-3xl p-5 sm:p-7 shadow-2xl overflow-hidden flex flex-col gap-5 max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">
                Share PnL Card
              </h3>
              <p className="text-[11px] text-[var(--color-text-secondary)] font-medium">
                Export or share your trading performance
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] p-2 rounded-xl hover:bg-[var(--color-bg-tertiary)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pro Crypto PnL Card Preview */}
        <div
          ref={cardRef}
          className="relative rounded-2xl border border-white/10 p-5 sm:p-6 bg-gradient-to-b from-[#080d1a] via-[#0b1326] to-[#060913] text-white overflow-hidden shadow-lg flex flex-col justify-between"
        >
          {/* Subtle Ambient Glow */}
          <div
            className={`absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-30 ${
              isProfit ? 'bg-emerald-500' : 'bg-rose-500'
            }`}
          />

          {/* Top Bar: SwiftEx Logo & Brand & Masked Address & Privacy Toggle */}
          <div className="flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <img
                src={logoUrl}
                alt="SwiftEx"
                className="w-6 h-6 object-contain rounded-full bg-white/5"
                onError={e => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <span className="text-sm font-black tracking-tight text-white">SwiftEx</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300 ml-1">
                {maskedAddress}
              </span>
            </div>

            {/* Hide / Show Amount Toggle */}
            <button
              onClick={() => setHideAmount(!hideAmount)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-bold transition-colors cursor-pointer border border-white/10"
              title={hideAmount ? 'Show exact numbers' : 'Hide balance for privacy'}
            >
              {hideAmount ? (
                <EyeOff className="w-3 h-3 text-amber-400" />
              ) : (
                <Eye className="w-3 h-3 text-emerald-400" />
              )}
              {hideAmount ? 'Hidden' : 'Visible'}
            </button>
          </div>

          {/* Main Hero PnL */}
          <div className="flex flex-col z-10 my-5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Total Realized PnL
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {timeframe.toUpperCase()}
              </span>
            </div>
            <span
              className={`text-3xl sm:text-4xl font-black tracking-tight mt-1 ${
                isProfit ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {displayPnL}
            </span>
          </div>

          {/* Key Metrics Row */}
          <div className="grid grid-cols-3 gap-2 z-10 pt-4 border-t border-white/10">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                Win Rate
              </span>
              <span className="text-base font-black text-purple-300 mt-0.5">{winRate}%</span>
            </div>

            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                Top Asset
              </span>
              <span className="text-base font-black text-emerald-400 mt-0.5 truncate">
                {bestTrade?.asset || 'XLM'}
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                Network
              </span>
              <span className="text-base font-black text-blue-300 mt-0.5">Pubnet</span>
            </div>
          </div>

          {/* Footer Branding */}
          <div className="flex items-center justify-between pt-3 mt-4 border-t border-white/5 z-10 text-[10px] text-slate-400 font-medium">
            <span className="text-sky-400 font-mono">app.swiftexchange.io</span>
            <span className="text-emerald-400 font-bold">✓ Verified On-Chain</span>
          </div>
        </div>

        {/* Social Share Buttons with react-share & Discord */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
              Share to Platform
            </span>
          </div>

          <div className="grid grid-cols-5 gap-2">
            <TwitterShareButton url={shareUrl} title={shareTitle} className="w-full">
              <div className="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border)] border border-[var(--color-border)] transition-colors cursor-pointer w-full">
                <TwitterIcon size={26} round />
                <span className="text-[9px] font-bold text-[var(--color-text-primary)]">X</span>
              </div>
            </TwitterShareButton>

            <TelegramShareButton url={shareUrl} title={shareTitle} className="w-full">
              <div className="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border)] border border-[var(--color-border)] transition-colors cursor-pointer w-full">
                <TelegramIcon size={26} round />
                <span className="text-[9px] font-bold text-[var(--color-text-primary)]">
                  Telegram
                </span>
              </div>
            </TelegramShareButton>

            <WhatsappShareButton
              url={shareUrl}
              title={shareTitle}
              separator=":: "
              className="w-full"
            >
              <div className="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border)] border border-[var(--color-border)] transition-colors cursor-pointer w-full">
                <WhatsappIcon size={26} round />
                <span className="text-[9px] font-bold text-[var(--color-text-primary)]">
                  WhatsApp
                </span>
              </div>
            </WhatsappShareButton>

            {/* Discord Copy Image Button */}
            <button
              onClick={handleDiscordShare}
              className="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border)] border border-[var(--color-border)] transition-colors cursor-pointer w-full"
              title="Copy Card Image to paste in Discord"
            >
              <div className="w-[26px] h-[26px] rounded-full bg-[#5865F2] flex items-center justify-center text-white text-[12px] font-bold">
                {copiedDiscord ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <MessageCircle className="w-3.5 h-3.5" />
                )}
              </div>
              <span className="text-[9px] font-bold text-[var(--color-text-primary)]">
                {copiedDiscord ? 'Copied!' : 'Discord'}
              </span>
            </button>

            <RedditShareButton url={shareUrl} title={shareTitle} className="w-full">
              <div className="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border)] border border-[var(--color-border)] transition-colors cursor-pointer w-full">
                <RedditIcon size={26} round />
                <span className="text-[9px] font-bold text-[var(--color-text-primary)]">
                  Reddit
                </span>
              </div>
            </RedditShareButton>
          </div>

          {/* Utility Actions: Copy Image, Save PNG, Copy Link */}
          <div className="grid grid-cols-3 gap-2 mt-1">
            <button
              onClick={handleCopyImageToClipboard}
              className="flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border)] text-[var(--color-text-primary)] border border-[var(--color-border)] text-xs font-bold transition-colors cursor-pointer"
              title="Copy image to paste directly into Instagram or Discord"
            >
              {copiedImage ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <ImageIcon className="w-4 h-4 text-purple-400" />
              )}
              {copiedImage ? 'Copied!' : 'Copy Image'}
            </button>

            <button
              onClick={handleDownloadImage}
              className="flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border)] text-[var(--color-text-primary)] border border-[var(--color-border)] text-xs font-bold transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-sky-400" />
              Save PNG
            </button>

            <button
              onClick={handleCopyLink}
              className="flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-[var(--color-brand-primary)] text-white hover:opacity-90 text-xs font-bold transition-opacity cursor-pointer shadow-md"
            >
              {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedLink ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
