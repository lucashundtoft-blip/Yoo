import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '../api';
import { computeRSI } from '../rsi';

interface RsiChartProps {
  candles: Candle[];
  period?: number;
  mainChart: IChartApi | null;
}

export function RsiChart({ candles, period = 14, mainChart }: RsiChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#14181d' },
        textColor: '#8b939d',
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

    const series = chart.addLineSeries({
      color: '#e0a52c',
      lineWidth: 2,
      lastValueVisible: true,
      priceLineVisible: false,
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    });

    series.createPriceLine({
      price: 70,
      color: '#f5304a',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'Overbought',
    });
    series.createPriceLine({
      price: 30,
      color: '#17c964',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'Oversold',
    });

    chartRef.current = chart;
    seriesRef.current = series;

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
    if (!seriesRef.current) return;
    seriesRef.current.setData(
      computeRSI(candles, period).map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
    );
    chartRef.current?.timeScale().fitContent();
  }, [candles, period]);

  // Keep this pane's time scale in lockstep with the main price chart.
  useEffect(() => {
    const rsiChart = chartRef.current;
    if (!mainChart || !rsiChart) return;
    let syncing = false;
    const toMain = (range: LogicalRange | null) => {
      if (syncing || !range) return;
      syncing = true;
      mainChart.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    };
    const toRsi = (range: LogicalRange | null) => {
      if (syncing || !range) return;
      syncing = true;
      rsiChart.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    };
    rsiChart.timeScale().subscribeVisibleLogicalRangeChange(toMain);
    mainChart.timeScale().subscribeVisibleLogicalRangeChange(toRsi);
    return () => {
      rsiChart.timeScale().unsubscribeVisibleLogicalRangeChange(toMain);
      mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(toRsi);
    };
  }, [mainChart]);

  return <div ref={containerRef} />;
}
