// The State Controller ("tape" player): a small playback loop shared by the
// stock and futures replay pages. It owns a currentIndex pointer (`cursor`)
// into a candle array and only ever reveals `candles.slice(0, cursor)` --
// nothing past the pointer is exposed, so charts/indicators computed from
// `visible` can't peek at future bars. play/pause ticks the pointer forward
// on a `baseIntervalMs / speed` timer; scrubbing or stepping moves it directly.
import { useEffect, useMemo, useState } from 'react';
import type { Candle } from './api';

export interface TapePlayerOptions {
  /** Bars visible before playback starts (also the reset/scrub floor). */
  warmup: number;
  /** Tick interval at 1x speed, in ms. Divided by `speed` for faster playback. */
  baseIntervalMs: number;
  initialSpeed?: number;
}

export interface TapePlayer {
  cursor: number;
  setCursor: (value: number) => void;
  playing: boolean;
  setPlaying: (value: boolean) => void;
  togglePlay: () => void;
  speed: number;
  setSpeed: (value: number) => void;
  visible: Candle[];
  current: Candle | null;
  prevBar: Candle | null;
  finished: boolean;
  step: () => void;
  reset: () => void;
}

export function useTapePlayer(candles: Candle[], { warmup, baseIntervalMs, initialSpeed = 1 }: TapePlayerOptions): TapePlayer {
  const [cursor, setCursor] = useState(warmup);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(initialSpeed);

  // Only data up to the pointer is ever revealed -- this is the entire
  // "replay" illusion, everything else just renders `visible`.
  const visible = useMemo(() => candles.slice(0, cursor), [candles, cursor]);
  const current = visible[visible.length - 1] ?? null;
  const prevBar = visible[visible.length - 2] ?? null;
  const finished = candles.length > 0 && cursor >= candles.length;

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      setCursor((c) => {
        if (c >= candles.length) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, baseIntervalMs / speed);
    return () => clearInterval(interval);
  }, [playing, speed, candles.length, baseIntervalMs]);

  function step() {
    setCursor((c) => Math.min(c + 1, candles.length));
  }

  function reset() {
    setCursor(warmup);
    setPlaying(false);
  }

  function togglePlay() {
    setPlaying((p) => !p);
  }

  return { cursor, setCursor, playing, setPlaying, togglePlay, speed, setSpeed, visible, current, prevBar, finished, step, reset };
}
