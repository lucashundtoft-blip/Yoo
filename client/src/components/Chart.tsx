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
import { toHeikinAshi } from '../heikinAshi';

export interface HoverBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartProps {
  candles: Candle[];
  projection?: Projection | null;
  showProjection: boolean;
  smaPeriods: number[];
  heikinAshi?: boolean;
  onChartApi?: (chart: IChartApi) => void;
  onHoverBar?: (bar: HoverBar | null) => void;
}

export function Chart({ candles, projection, showProjection, smaPeriods, heikinAshi, onChartApi, onHoverBar }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const trendSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const forecastSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const smaSeriesRef = useRef<Map<number, ISeriesApi<'Line'>>>(new Map());
  const candlesRef = useRef<Candle[]>(candles);
  const onHoverBarRef = useRef(onHoverBar);

  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  useEffect(() => {
    onHoverBarRef.current = onHoverBar;
  }, [onHoverBar]);

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
      height: 560,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#3987e5',
      downColor: '#d95926',
      borderVisible: false,
      wickUpColor: '#3987e5',
      wickDownColor: '#d95926',
    });
    candleSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.1, bottom: 0.28 },
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
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
    volumeSeriesRef.current = volumeSeries;
    trendSeriesRef.current = trendSeries;
    forecastSeriesRef.current = forecastSeries;
    onChartApi?.(chart);

    const handleCrosshairMove: Parameters<typeof chart.subscribeCrosshairMove>[0] = (param) => {
      if (!onHoverBarRef.current) return;
      const bar = param.time ? param.seriesData.get(candleSeries) : undefined;
      if (!param.time || !bar) {
        onHoverBarRef.current(null);
        return;
      }
      const ohlc = bar as unknown as { open: number; high: number; low: number; close: number };
      const volBar = candlesRef.current.find((c) => c.time === (param.time as number));
      onHoverBarRef.current({
        time: param.time as number,
        open: ohlc.open,
        high: ohlc.high,
        low: ohlc.low,
        close: ohlc.close,
        volume: volBar?.volume ?? 0,
      });
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
      smaSeriesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current) return;
    const displayCandles = heikinAshi ? toHeikinAshi(candles) : candles;
    candleSeriesRef.current.setData(
      displayCandles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
    volumeSeriesRef.current?.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(57, 135, 229, 0.5)' : 'rgba(217, 89, 38, 0.5)',
      }))
    );
    chartRef.current?.timeScale().fitContent();
  }, [candles, heikinAshi]);

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
