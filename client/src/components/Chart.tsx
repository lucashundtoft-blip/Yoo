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
import { computeTrendChannel } from '../projection';

const BOLD_SMA_PERIODS = new Set([20, 200, 400]);

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
  const channelUpperSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const channelLowerSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const smaSeriesRef = useRef<Map<number, ISeriesApi<'Line'>>>(new Map());
  const candlesRef = useRef<Candle[]>(candles);
  const onHoverBarRef = useRef(onHoverBar);
  const prevCandlesInfoRef = useRef<{ length: number; lastTime: number | null; heikinAshi: boolean }>({
    length: 0,
    lastTime: null,
    heikinAshi: false,
  });
  const haStateRef = useRef<{ open: number; close: number } | null>(null);

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
      upColor: '#15803d',
      downColor: '#2f8fff',
      borderVisible: false,
      wickUpColor: '#15803d',
      wickDownColor: '#2f8fff',
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
      lineWidth: 3,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const forecastSeries = chart.addLineSeries({
      color: '#e0a52c',
      lineWidth: 3,
      lineStyle: 2, // dashed
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const channelUpperSeries = chart.addLineSeries({
      color: '#8b939d',
      lineWidth: 2,
      lineStyle: 2, // dashed
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const channelLowerSeries = chart.addLineSeries({
      color: '#8b939d',
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
    channelUpperSeriesRef.current = channelUpperSeries;
    channelLowerSeriesRef.current = channelLowerSeries;
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
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries) return;

    const prev = prevCandlesInfoRef.current;
    const isSimpleAppend =
      Boolean(heikinAshi) === prev.heikinAshi &&
      prev.length > 0 &&
      candles.length === prev.length + 1 &&
      candles[prev.length - 1]?.time === prev.lastTime;

    const volumeColor = (c: Candle) => (c.close >= c.open ? 'rgba(21, 128, 61, 0.6)' : 'rgba(47, 143, 255, 0.6)');

    if (isSimpleAppend) {
      // Tick-by-tick playback: append just the new bar instead of re-rendering
      // the whole series, so the timescale doesn't jump/re-fit every tick.
      const raw = candles[candles.length - 1];
      let bar: { open: number; high: number; low: number; close: number };
      if (heikinAshi && haStateRef.current) {
        const haClose = (raw.open + raw.high + raw.low + raw.close) / 4;
        const haOpen = (haStateRef.current.open + haStateRef.current.close) / 2;
        bar = { open: haOpen, high: Math.max(raw.high, haOpen, haClose), low: Math.min(raw.low, haOpen, haClose), close: haClose };
        haStateRef.current = { open: bar.open, close: bar.close };
      } else {
        bar = { open: raw.open, high: raw.high, low: raw.low, close: raw.close };
      }
      candleSeries.update({ time: raw.time as UTCTimestamp, ...bar });
      volumeSeries?.update({ time: raw.time as UTCTimestamp, value: raw.volume, color: volumeColor(raw) });
    } else {
      const displayCandles = heikinAshi ? toHeikinAshi(candles) : candles;
      candleSeries.setData(
        displayCandles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
      volumeSeries?.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.volume, color: volumeColor(c) })));
      chartRef.current?.timeScale().fitContent();
      const lastHA = displayCandles[displayCandles.length - 1];
      haStateRef.current = heikinAshi && lastHA ? { open: lastHA.open, close: lastHA.close } : null;
    }

    prevCandlesInfoRef.current = {
      length: candles.length,
      lastTime: candles[candles.length - 1]?.time ?? null,
      heikinAshi: Boolean(heikinAshi),
    };
  }, [candles, heikinAshi]);

  useEffect(() => {
    if (!trendSeriesRef.current || !forecastSeriesRef.current || !channelUpperSeriesRef.current || !channelLowerSeriesRef.current) return;
    if (!showProjection || !projection) {
      trendSeriesRef.current.setData([]);
      forecastSeriesRef.current.setData([]);
      channelUpperSeriesRef.current.setData([]);
      channelLowerSeriesRef.current.setData([]);
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
    const channel = computeTrendChannel(candlesRef.current, projection);
    channelUpperSeriesRef.current.setData(channel.upper.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    channelLowerSeriesRef.current.setData(channel.lower.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
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
          lineWidth: BOLD_SMA_PERIODS.has(period) ? 3 : 2,
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
