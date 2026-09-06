import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type SeriesMarker,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle, Projection } from '../api';
import { computeSMA, computeEMA, SMA_COLORS, EMA_COLORS } from '../sma';
import { toHeikinAshi } from '../heikinAshi';
import { computeTrendChannel } from '../projection';

const BOLD_SMA_PERIODS = new Set([20, 50, 200, 400]);

export interface HoverBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradeMarker {
  time: number;
  side: 'BUY' | 'SELL';
}

export interface PositionLine {
  price: number;
  title: string;
  color?: string;
}

interface ChartProps {
  candles: Candle[];
  projection?: Projection | null;
  showProjection: boolean;
  smaPeriods: number[];
  /** EMA overlay periods, drawn separately from smaPeriods so pages that
   *  already use SMA toggles (stock detail, replay) are unaffected. Used
   *  by the futures chart's fixed EMA(5,20,200) header, matching Webull. */
  emaPeriods?: number[];
  heikinAshi?: boolean;
  onChartApi?: (chart: IChartApi) => void;
  onHoverBar?: (bar: HoverBar | null) => void;
  /** When set, a newly-appended bar animates in over this many ms (open
   *  settling toward its final OHLC) instead of snapping in instantly —
   *  the "buyers vs. sellers" live-forming candle feel. */
  tickAnimationMs?: number;
  /** Arrow markers on the bars where trades were placed. Must be sorted
   *  ascending by time. */
  tradeMarkers?: TradeMarker[];
  /** A labeled horizontal line at the average cost of an open position,
   *  like Webull's "POS: qty @ price" line. Omit/null to hide. */
  positionLine?: PositionLine | null;
  /** Additional labeled horizontal lines (e.g. a prediction target vs. the
   *  actual outcome in the trend-projection game). Replaces entirely on change. */
  extraPriceLines?: PositionLine[];
  /** CSS height for the chart's container — lets the page fit the chart to
   *  the viewport (e.g. clamp() so it never needs scrolling on mobile).
   *  Falls back to a large viewport-relative size when omitted, matching
   *  TradingView's full-height chart rather than a small fixed box. */
  height?: string;
}

interface OhlcBar {
  open: number;
  high: number;
  low: number;
  close: number;
}

export function Chart({
  candles,
  projection,
  showProjection,
  smaPeriods,
  emaPeriods,
  heikinAshi,
  onChartApi,
  onHoverBar,
  tickAnimationMs,
  tradeMarkers,
  positionLine,
  extraPriceLines,
  height,
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const trendSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const forecastSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const channelUpperSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const channelLowerSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const smaSeriesRef = useRef<Map<number, ISeriesApi<'Line'>>>(new Map());
  const emaSeriesRef = useRef<Map<number, ISeriesApi<'Line'>>>(new Map());
  const positionPriceLineRef = useRef<IPriceLine | null>(null);
  const extraPriceLinesRef = useRef<IPriceLine[]>([]);
  const candlesRef = useRef<Candle[]>(candles);
  const onHoverBarRef = useRef(onHoverBar);
  const prevCandlesInfoRef = useRef<{ length: number; lastTime: number | null; heikinAshi: boolean }>({
    length: 0,
    lastTime: null,
    heikinAshi: false,
  });
  const haStateRef = useRef<{ open: number; close: number } | null>(null);
  const animatingBarRef = useRef<{ time: UTCTimestamp; final: OhlcBar; volume: number; volumeColor: string } | null>(null);
  const animationHandleRef = useRef<number | null>(null);
  const tickAnimationMsRef = useRef(tickAnimationMs);

  useEffect(() => {
    tickAnimationMsRef.current = tickAnimationMs;
  }, [tickAnimationMs]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === wrapperRef.current);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // TradingView-style fullscreen: fills the whole screen and, on phones,
  // rotates into landscape (orientation lock only works while fullscreen).
  async function toggleFullscreen() {
    if (!wrapperRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await wrapperRef.current.requestFullscreen();
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    orientation.lock?.('landscape').catch(() => {
      // Orientation lock isn't supported everywhere (e.g. iOS Safari) --
      // fullscreen alone still gives a much bigger chart.
    });
  }

  // Snap any in-flight bar animation straight to its final values — called
  // when a new tick/reset arrives before the previous bar finished forming.
  function stopBarAnimation() {
    if (animationHandleRef.current !== null) {
      cancelAnimationFrame(animationHandleRef.current);
      animationHandleRef.current = null;
    }
    const pending = animatingBarRef.current;
    if (pending) {
      candleSeriesRef.current?.update({ time: pending.time, ...pending.final });
      volumeSeriesRef.current?.update({ time: pending.time, value: pending.volume, color: pending.volumeColor });
      animatingBarRef.current = null;
    }
  }

  // Animate a newly-appended bar growing from its open toward its final
  // OHLC — the wick probes beyond its settled range before pulling back,
  // like a live print forming as buyers and sellers trade the bar out.
  function animateBarIn(time: UTCTimestamp, final: OhlcBar, volume: number, volumeColor: string) {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const duration = tickAnimationMsRef.current;
    if (!candleSeries || !duration || duration <= 0) {
      candleSeries?.update({ time, ...final });
      volumeSeries?.update({ time, value: volume, color: volumeColor });
      return;
    }

    animatingBarRef.current = { time, final, volume, volumeColor };
    const start = performance.now();
    const rangeUp = Math.max(final.high - final.open, 0);
    const rangeDown = Math.max(final.open - final.low, 0);

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      if (t >= 1) {
        candleSeries.update({ time, ...final });
        volumeSeries?.update({ time, value: volume, color: volumeColor });
        animatingBarRef.current = null;
        animationHandleRef.current = null;
        return;
      }
      const eased = 1 - Math.pow(1 - t, 3);
      const overshoot = Math.sin(Math.PI * Math.min(1, t * 1.3)) * 0.35 * (1 - eased);
      const close = final.open + (final.close - final.open) * eased;
      const high = final.open + rangeUp * Math.min(1, eased + overshoot);
      const low = final.open - rangeDown * Math.min(1, eased + overshoot);
      candleSeries.update({
        time,
        open: final.open,
        high: Math.max(high, close, final.open),
        low: Math.min(low, close, final.open),
        close,
      });
      volumeSeries?.update({ time, value: volume * eased, color: volumeColor });
      animationHandleRef.current = requestAnimationFrame(step);
    };
    animationHandleRef.current = requestAnimationFrame(step);
  }

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
      // vertTouchDrag off: a vertical finger-drag on the chart body now falls
      // through to the page (normal scroll) instead of panning the chart --
      // horizontal drag still pans, and dragging the price axis itself
      // still scales it via handleScale.axisPressedMouseMove below.
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: true,
      },
      kineticScroll: { touch: true, mouse: false },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    // The library sets touch-action: none on its own canvases so it can
    // intercept touchmove for horizontal panning/pinch, which blocks native
    // page scroll on a vertical swipe regardless of vertTouchDrag above.
    // Overriding to pan-y hands vertical swipes back to the browser for
    // scrolling while horizontal swipes still reach the chart's own handlers.
    containerRef.current.querySelectorAll('canvas').forEach((canvas) => {
      canvas.style.touchAction = 'pan-y';
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
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
      }
    };
    window.addEventListener('resize', handleResize);
    // Entering/exiting fullscreen resizes the container without firing a
    // window resize event on some browsers -- resync explicitly.
    document.addEventListener('fullscreenchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('fullscreenchange', handleResize);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      if (animationHandleRef.current !== null) cancelAnimationFrame(animationHandleRef.current);
      chart.remove();
      smaSeriesRef.current.clear();
      emaSeriesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries) return;

    // A new bar is arriving (or a reset is happening) — settle whatever the
    // previous bar's animation was mid-way through first.
    stopBarAnimation();

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
      let bar: OhlcBar;
      if (heikinAshi && haStateRef.current) {
        const haClose = (raw.open + raw.high + raw.low + raw.close) / 4;
        const haOpen = (haStateRef.current.open + haStateRef.current.close) / 2;
        bar = { open: haOpen, high: Math.max(raw.high, haOpen, haClose), low: Math.min(raw.low, haOpen, haClose), close: haClose };
        haStateRef.current = { open: bar.open, close: bar.close };
      } else {
        bar = { open: raw.open, high: raw.high, low: raw.low, close: raw.close };
      }
      animateBarIn(raw.time as UTCTimestamp, bar, raw.volume, volumeColor(raw));
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

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;
    const map = emaSeriesRef.current;
    const periods = emaPeriods ?? [];

    for (const [period, series] of map) {
      if (!periods.includes(period)) {
        chart.removeSeries(series);
        map.delete(period);
      }
    }

    for (const period of periods) {
      if (!map.has(period)) {
        const series = chart.addLineSeries({
          color: EMA_COLORS[period] ?? '#8b939d',
          lineWidth: period >= 200 ? 2 : 3,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        map.set(period, series);
      }
      map.get(period)!.setData(
        computeEMA(candles, period).map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
      );
    }
  }, [candles, emaPeriods]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;
    const markers: SeriesMarker<UTCTimestamp>[] = (tradeMarkers ?? []).map((m) => ({
      time: m.time as UTCTimestamp,
      position: m.side === 'BUY' ? 'belowBar' : 'aboveBar',
      color: m.side === 'BUY' ? '#15803d' : '#2f8fff',
      shape: m.side === 'BUY' ? 'arrowUp' : 'arrowDown',
      text: m.side,
    }));
    candleSeries.setMarkers(markers);
  }, [tradeMarkers]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;
    if (positionPriceLineRef.current) {
      candleSeries.removePriceLine(positionPriceLineRef.current);
      positionPriceLineRef.current = null;
    }
    if (positionLine) {
      positionPriceLineRef.current = candleSeries.createPriceLine({
        price: positionLine.price,
        color: positionLine.color ?? '#2f81f7',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: positionLine.title,
      });
    }
  }, [positionLine]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;
    for (const line of extraPriceLinesRef.current) candleSeries.removePriceLine(line);
    extraPriceLinesRef.current = (extraPriceLines ?? []).map((l) =>
      candleSeries.createPriceLine({
        price: l.price,
        color: l.color ?? '#e0a52c',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: l.title,
      })
    );

    // Price lines don't factor into the series' default autoscale, so a
    // target far from the visible candles would render off-canvas. Widen
    // the scale to include them.
    const extraValues = (extraPriceLines ?? []).map((l) => l.price);
    candleSeries.applyOptions({
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const res = original();
        if (!res?.priceRange || extraValues.length === 0) return res;
        const minValue = Math.min(res.priceRange.minValue, ...extraValues);
        const maxValue = Math.max(res.priceRange.maxValue, ...extraValues);
        return { ...res, priceRange: { minValue, maxValue } };
      },
    });
  }, [extraPriceLines]);

  return (
    <div ref={wrapperRef} style={{ position: 'relative', background: '#14181d' }}>
      <button
        onClick={toggleFullscreen}
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 2,
          width: 30,
          height: 30,
          borderRadius: 6,
          border: '1px solid #262b33',
          background: 'rgba(20, 24, 29, 0.85)',
          color: '#8b939d',
          cursor: 'pointer',
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        {isFullscreen ? '⤡' : '⛶'}
      </button>
      <div
        ref={containerRef}
        style={{
          height: isFullscreen ? '100vh' : height ?? 'clamp(380px, 58dvh, 680px)',
          width: '100%',
        }}
      />
    </div>
  );
}
