import { useEffect, useRef } from 'react';
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
import { computeMACD } from '../macd';

interface MacdChartProps {
  candles: Candle[];
  mainChart: IChartApi | null;
}

export function MacdChart({ candles, mainChart }: MacdChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const macdSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const signalSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const histSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const prevInfoRef = useRef<{ length: number; lastTime: number | null }>({ length: 0, lastTime: null });

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
      height: 150,
    });

    histSeriesRef.current = chart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
    macdSeriesRef.current = chart.addLineSeries({ color: '#2f81f7', lineWidth: 2, priceLineVisible: false });
    signalSeriesRef.current = chart.addLineSeries({ color: '#e0a52c', lineWidth: 2, priceLineVisible: false });
    chartRef.current = chart;

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
    if (!macdSeriesRef.current || !signalSeriesRef.current || !histSeriesRef.current) return;
    // Fed only the (already index-sliced) `candles` prop, recomputed from
    // scratch each time it changes -- no memory of a wider history that
    // could leak future bars in as the replay pointer moves.
    const points = computeMACD(candles);
    macdSeriesRef.current.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: p.macd })));
    signalSeriesRef.current.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: p.signal })));
    histSeriesRef.current.setData(
      points.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.histogram,
        color: p.histogram >= 0 ? '#17c96488' : '#f5304a88',
      }))
    );

    const prev = prevInfoRef.current;
    const isSimpleAppend =
      prev.length > 0 && candles.length === prev.length + 1 && candles[prev.length - 1]?.time === prev.lastTime;
    if (!isSimpleAppend) {
      chartRef.current?.timeScale().fitContent();
    }
    prevInfoRef.current = { length: candles.length, lastTime: candles[candles.length - 1]?.time ?? null };
  }, [candles]);

  // Keep this pane's time scale in lockstep with the main price chart.
  useEffect(() => {
    const macdChart = chartRef.current;
    if (!mainChart || !macdChart) return;
    let syncing = false;
    const toMain = (range: LogicalRange | null) => {
      if (syncing || !range) return;
      syncing = true;
      mainChart.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    };
    const toMacd = (range: LogicalRange | null) => {
      if (syncing || !range) return;
      syncing = true;
      macdChart.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    };
    macdChart.timeScale().subscribeVisibleLogicalRangeChange(toMain);
    mainChart.timeScale().subscribeVisibleLogicalRangeChange(toMacd);
    return () => {
      macdChart.timeScale().unsubscribeVisibleLogicalRangeChange(toMain);
      mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(toMacd);
    };
  }, [mainChart]);

  return <div ref={containerRef} />;
}
