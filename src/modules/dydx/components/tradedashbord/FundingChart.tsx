import { createChart, ColorType, LineSeries } from 'lightweight-charts';
import React, { useEffect, useRef, useState } from 'react';

import { dydxDataService } from '../../service/dydxOrderService';
import { LoadingState } from '../shared/LoadingState';

interface FundingChartProps {
    market: string;
}

type TimeFrame = '1h' | '8h' | '1y';

const FundingChart: React.FC<FundingChartProps> = ({ market }) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const toolTipRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<any[]>([]);
    const [timeFrame, setTimeFrame] = useState<TimeFrame>('1h');
    const [currentRate, setCurrentRate] = useState<number | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const historicalData = await dydxDataService.getHistoricalFunding(market, 500);

                const sorted = historicalData.sort((a, b) => new Date(a.effectiveAt).getTime() - new Date(b.effectiveAt).getTime());
                setData(sorted);
            } catch (error) {
                console.error('Failed to fetch funding data', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [market]);

    useEffect(() => {
        if (!chartContainerRef.current || data.length === 0) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#808a9d',
                fontFamily: "'JetBrains Mono', monospace",
            },
            grid: {
                vertLines: { visible: false },
                horzLines: { color: '#2B2B43', style: 2 },
            },
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: '#2B2B43',
            },
            rightPriceScale: {
                borderColor: '#2B2B43',
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.1,
                },
            },
            crosshair: {
                vertLine: {
                    labelVisible: false,
                    color: '#495057',
                    width: 1,
                    style: 3,
                    visible: true,
                },
                horzLine: {
                    labelVisible: false,
                    color: '#495057',
                    width: 1,
                    style: 3,
                    visible: true,
                },
            }
        });

        const series = chart.addSeries(LineSeries, {
            color: '#2962FF',
            lineWidth: 2,
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: 4,
            crosshairMarkerBorderColor: '#2962FF',
            crosshairMarkerBackgroundColor: '#000000',
            priceFormat: {
                type: 'custom',
                formatter: (price: number) => price.toFixed(4) + '%',
            },
        });

        const dataMap = new Map<number, any>();

        const chartData = data.map(item => {
            let value = parseFloat(item.rate) * 100;
            if (timeFrame === '8h') value *= 8;
            if (timeFrame === '1y') value *= (24 * 365);

            const time = new Date(item.effectiveAt).getTime() / 1000 as any;
            dataMap.set(time, { ...item, displayValue: value });

            return {
                time: time,
                value: value,
            };
        });

        series.setData(chartData);

        if (chartData.length > 0) {
            setCurrentRate(chartData[chartData.length - 1].value);
        }

        if (toolTipRef.current) {
            const toolTip = toolTipRef.current;

            chart.subscribeCrosshairMove(param => {
                if (
                    param.point === undefined ||
                    !param.time ||
                    param.point.x < 0 ||
                    param.point.x > chartContainerRef.current!.clientWidth ||
                    param.point.y < 0 ||
                    param.point.y > chartContainerRef.current!.clientHeight
                ) {
                    toolTip.style.display = 'none';
                    return;
                }

                const item = dataMap.get(param.time as number);
                if (!item) {
                    toolTip.style.display = 'none';
                    return;
                }

                toolTip.style.display = 'block';

                const price = parseFloat(item.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const rate = item.displayValue.toFixed(6);
                const date = new Date(item.effectiveAt).toLocaleString();

                const isPositive = item.displayValue >= 0;
                const rateColor = isPositive ? '#22c55e' : '#ef4444';

                toolTip.innerHTML = `
                    <div style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #FFFFFF;">
                        <div style="margin-bottom: 4px; color: #9CA3AF;">${date}</div>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                            <span style="color: #9CA3AF;">Rate</span>
                            <span style="color: ${rateColor};">${rate}%</span>
                        </div>
                         <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                            <span style="color: #9CA3AF;">Price</span>
                            <span>$${price}</span>
                        </div>
                    </div>
                `;

                let shiftedCoordinate = param.point.x - 50;
                if (param.point.x - 50 < 0) {
                    shiftedCoordinate = 0;
                } else if (param.point.x + toolTip.clientWidth + 50 > chartContainerRef.current!.clientWidth) {
                    shiftedCoordinate = chartContainerRef.current!.clientWidth - toolTip.clientWidth;
                }

                const y = param.point.y;
                let top = y - toolTip.clientHeight - 10;
                if (top < 0) {
                    top = y + 10;
                }

                toolTip.style.left = shiftedCoordinate + 'px';
                toolTip.style.top = top + 'px';
            });
        }

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, [data, timeFrame]);

    if (loading && data.length === 0) {
        return <LoadingState message="Loading funding chart..." />;
    }

    const formatRate = (rate: number) => {
        return `${rate.toFixed(6)}%`;
    };

    return (
        <div className="flex flex-col h-full w-full bg-secondary text-primary relative group">
            <div className="flex items-center justify-between px-4 py-3 border-b border-color z-10 bg-secondary">
                <div className="flex flex-col">
                    <span className="text-muted text-xs uppercase tracking-wide">Current {timeFrame === '1y' ? 'Annualized' : timeFrame === '8h' ? '8h' : '1h'} Rate</span>
                    <span className={`text-xl font-mono font-medium ${currentRate && currentRate >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {currentRate !== null ? formatRate(currentRate) : '-'}
                    </span>
                </div>
                <div className="flex bg-tertiary rounded-lg p-1 gap-1">
                    {(['1h', '8h', '1y'] as TimeFrame[]).map((tf) => (
                        <button
                            key={tf}
                            onClick={() => setTimeFrame(tf)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${timeFrame === tf
                                ? 'bg-secondary text-primary shadow-sm ring-1 ring-black/5'
                                : 'text-muted hover:text-primary hover:bg-secondary/50'
                                }`}
                        >
                            {tf === '1y' ? 'Annualized' : `${tf}`}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex-1 w-full relative overflow-hidden" ref={chartContainerRef}>
                <div
                    ref={toolTipRef}
                    className="absolute z-20 pointer-events-none rounded-lg bg-secondary/95 backdrop-blur-sm border border-color shadow-xl p-3"
                    style={{
                        display: 'none',
                        minWidth: '160px'
                    }}
                />
            </div>
        </div>
    );
};
export default FundingChart;
