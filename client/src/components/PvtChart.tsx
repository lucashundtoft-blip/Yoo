import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '../api';
import { computePVT, computePVTSignal } from '../pvt';
import { formatCompact } from '../format';

interface PvtChartProps {
  candles: Candle[];
  signalPeriod?: number;
  mainChart: IChartApi | null;
}

export function PvtChart({ candles, signalPeriod = 120, mainChart }: PvtChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const pvtSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const signalSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const prevInfoRef = useRef<{ length: number; lastTime: number | null }>({ length: 0, lastTime: null });
  const [latest, setLatest] = useState<{ pvt: number; signal: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#14181d' },
        textColor: '#8b939d',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#1c2128' },
        horzLines: { color: '#1c2128' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#262b33' },
      timeScale: { borderColor: '#262b33', timeVisible: true },
      width: containerRef.current.clientWidth,
      height: 130,
    });

    const pvtSeries = chart.addAreaSeries({
      lineColor: '#2f81f7',
      topColor: 'rgba(47, 129, 247, 0.35)',
      bottomColor: 'rgba(47, 129, 247, 0.02)',
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const signalSeries = chart.addLineSeries({
      color: '#e0a52c',
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    chartRef.current = chart;
    pvtSeriesRef.current = pvtSeries;
    signalSeriesRef.current = signalSeries;

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!pvtSeriesRef.current || !signalSeriesRef.current) return;
    const pvt = computePVT(candles);
    const signal = computePVTSignal(pvt, signalPeriod);
    pvtSeriesRef.current.setData(pvt.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    signalSeriesRef.current.setData(signal.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    setLatest(
      pvt.length > 0 ? { pvt: pvt[pvt.length - 1].value, signal: signal[signal.length - 1].value } : null
    );

    const prev = prevInfoRef.current;
    const isSimpleAppend =
      prev.length > 0 && candles.length === prev.length + 1 && candles[prev.length - 1]?.time === prev.lastTime;
    if (!isSimpleAppend) {
      chartRef.current?.timeScale().fitContent();
    }
    prevInfoRef.current = { length: candles.length, lastTime: candles[candles.length - 1]?.time ?? null };
  }, [candles, signalPeriod]);

  // Keep this pane's time scale in lockstep with the main price chart.
  useEffect(() => {
    const pvtChart = chartRef.current;
    if (!mainChart || !pvtChart) return;
    let syncing = false;
    const toMain = (range: LogicalRange | null) => {
      if (syncing || !range) return;
      syncing = true;
      mainChart.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    };
    const toPvt = (range: LogicalRange | null) => {
      if (syncing || !range) return;
      syncing = true;
      pvtChart.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    };
    pvtChart.timeScale().subscribeVisibleLogicalRangeChange(toMain);
    mainChart.timeScale().subscribeVisibleLogicalRangeChange(toPvt);
    return () => {
      pvtChart.timeScale().unsubscribeVisibleLogicalRangeChange(toMain);
      mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(toPvt);
    };
  }, [mainChart]);

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
        Price Volume Trend (EMA,{signalPeriod}){' '}
        {latest && (
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: '#2f81f7' }}>PVT:{formatCompact(latest.pvt)}</span>{' '}
            <span style={{ color: '#e0a52c' }}>Signal:{formatCompact(latest.signal)}</span>
          </span>
        )}
      </div>
      <div ref={containerRef} />
    </div>
  );
}
