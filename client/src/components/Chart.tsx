import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle, Projection } from '../api';
import { computeSMA, SMA_COLORS } from '../sma';

interface ChartProps {
  candles: Candle[];
  projection?: Projection | null;
  showProjection: boolean;
  smaPeriods: number[];
  onChartApi?: (chart: IChartApi) => void;
}

export function Chart({ candles, projection, showProjection, smaPeriods, onChartApi }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const trendSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const forecastSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const smaSeriesRef = useRef<Map<number, ISeriesApi<'Line'>>>(new Map());

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
      height: 420,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#17c964',
      downColor: '#f5304a',
      borderVisible: false,
      wickUpColor: '#17c964',
      wickDownColor: '#f5304a',
    });

    const trendSeries = chart.addLineSeries({
      color: '#2f81f7',
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const forecastSeries = chart.addLineSeries({
      color: '#e0a52c',
      lineWidth: 2,
      lineStyle: 2, // dashed
      lastValueVisible: false,
      priceLineVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    trendSeriesRef.current = trendSeries;
    forecastSeriesRef.current = forecastSeries;
    onChartApi?.(chart);

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      smaSeriesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current) return;
    candleSeriesRef.current.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  useEffect(() => {
    if (!trendSeriesRef.current || !forecastSeriesRef.current) return;
    if (!showProjection || !projection) {
      trendSeriesRef.current.setData([]);
      forecastSeriesRef.current.setData([]);
      return;
    }
    trendSeriesRef.current.setData(
      projection.trendline.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
    );
    const bridge = projection.trendline.length
      ? [projection.trendline[projection.trendline.length - 1], ...projection.forecast]
      : projection.forecast;
    forecastSeriesRef.current.setData(
      bridge.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
    );
  }, [projection, showProjection]);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;
    const map = smaSeriesRef.current;

    for (const [period, series] of map) {
      if (!smaPeriods.includes(period)) {
        chart.removeSeries(series);
        map.delete(period);
      }
    }

    for (const period of smaPeriods) {
      if (!map.has(period)) {
        const series = chart.addLineSeries({
          color: SMA_COLORS[period] ?? '#8b939d',
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        map.set(period, series);
      }
      map.get(period)!.setData(
        computeSMA(candles, period).map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
      );
    }
  }, [candles, smaPeriods]);

  return <div ref={containerRef} />;
}
