import { formatCurrency } from '../format';

export type StopMode = 'off' | 'trailing' | 'fixed';
export type TakeProfitMode = 'off' | 'percent' | 'fixed';

export interface ProtectionValue {
  stopMode: StopMode;
  trailPercent: number; // used when stopMode === 'trailing'
  fixedStopPrice: string; // used when stopMode === 'fixed'
  tpMode: TakeProfitMode;
  tpPercent: number; // used when tpMode === 'percent'
  fixedTpPrice: string; // used when tpMode === 'fixed'
}

/** Trailing stop pre-selected by default -- this is the one-click "protect
 * this trade" default the whole order flow is built around: no prices to
 * calculate, just place the order. */
export const DEFAULT_PROTECTION: ProtectionValue = {
  stopMode: 'trailing',
  trailPercent: 2,
  fixedStopPrice: '',
  tpMode: 'off',
  tpPercent: 5,
  fixedTpPrice: '',
};

const STOP_PRESETS = [1, 2, 5, 10];
const TP_PRESETS = [2, 5, 10];

/** Turns the quick-select UI state into the absolute prices / trailing
 * percent the order API expects, given the entry price and which way the
 * position profits ('long' for a stock buy or futures long, 'short' for a
 * futures short). */
export function resolveProtection(
  value: ProtectionValue,
  price: number,
  direction: 'long' | 'short'
): { takeProfitPrice: number | null; stopLossPrice: number | null; trailingStopPercent: number | null } {
  const sign = direction === 'long' ? 1 : -1;

  let takeProfitPrice: number | null = null;
  if (value.tpMode === 'percent' && price > 0) {
    takeProfitPrice = price * (1 + sign * (value.tpPercent / 100));
  } else if (value.tpMode === 'fixed' && value.fixedTpPrice) {
    takeProfitPrice = Number(value.fixedTpPrice);
  }

  let stopLossPrice: number | null = null;
  let trailingStopPercent: number | null = null;
  if (value.stopMode === 'trailing') {
    trailingStopPercent = value.trailPercent;
  } else if (value.stopMode === 'fixed' && value.fixedStopPrice) {
    stopLossPrice = Number(value.fixedStopPrice);
  }

  return { takeProfitPrice, stopLossPrice, trailingStopPercent };
}

/** Returns a validation error message, or null if the current selection is
 * ready to submit. Only the "Custom" (fixed-price) paths need validating --
 * the percent-based presets always resolve to something sane. */
export function protectionError(value: ProtectionValue, price: number, direction: 'long' | 'short'): string | null {
  if (value.stopMode === 'fixed') {
    const sl = Number(value.fixedStopPrice);
    if (!value.fixedStopPrice || !(sl > 0)) return 'Enter a stop-loss price';
    if (price > 0 && direction === 'long' && sl >= price) return 'Stop loss must be below the current price';
    if (price > 0 && direction === 'short' && sl <= price) return 'Stop loss must be above the current price';
  }
  if (value.tpMode === 'fixed') {
    const tp = Number(value.fixedTpPrice);
    if (!value.fixedTpPrice || !(tp > 0)) return 'Enter a take-profit price';
    if (price > 0 && direction === 'long' && tp <= price) return 'Take profit must be above the current price';
    if (price > 0 && direction === 'short' && tp >= price) return 'Take profit must be below the current price';
  }
  return null;
}

interface ProtectionControlsProps {
  value: ProtectionValue;
  onChange: (next: ProtectionValue) => void;
  price: number;
  direction: 'long' | 'short';
}

export function ProtectionControls({ value, onChange, price, direction }: ProtectionControlsProps) {
  const sign = direction === 'long' ? 1 : -1;
  const trailPreviewPrice = price > 0 ? price * (1 - sign * (value.trailPercent / 100)) : null;

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="form-row" style={{ marginBottom: 10 }}>
        <label>Stop loss</label>
        <div className="chip-row">
          <button
            type="button"
            className={`chip ${value.stopMode === 'off' ? 'active' : ''}`}
            onClick={() => onChange({ ...value, stopMode: 'off' })}
          >
            Off
          </button>
          {STOP_PRESETS.map((pct) => (
            <button
              key={pct}
              type="button"
              className={`chip ${value.stopMode === 'trailing' && value.trailPercent === pct ? 'active' : ''}`}
              onClick={() => onChange({ ...value, stopMode: 'trailing', trailPercent: pct })}
            >
              {pct}%
            </button>
          ))}
          <button
            type="button"
            className={`chip ${value.stopMode === 'fixed' ? 'active' : ''}`}
            onClick={() => onChange({ ...value, stopMode: 'fixed' })}
          >
            Custom
          </button>
        </div>
        {value.stopMode === 'trailing' && (
          <div className="hint">
            Trailing stop &mdash; auto-sells if price pulls back {value.trailPercent}% from its best point since entry
            {trailPreviewPrice != null && <> (starts around {formatCurrency(trailPreviewPrice)})</>}.
          </div>
        )}
        {value.stopMode === 'fixed' && (
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Stop price"
            value={value.fixedStopPrice}
            onChange={(e) => onChange({ ...value, fixedStopPrice: e.target.value })}
            style={{ marginTop: 8 }}
          />
        )}
      </div>

      <div className="form-row">
        <label>Take profit</label>
        <div className="chip-row">
          <button
            type="button"
            className={`chip ${value.tpMode === 'off' ? 'active' : ''}`}
            onClick={() => onChange({ ...value, tpMode: 'off' })}
          >
            Off
          </button>
          {TP_PRESETS.map((pct) => (
            <button
              key={pct}
              type="button"
              className={`chip ${value.tpMode === 'percent' && value.tpPercent === pct ? 'active' : ''}`}
              onClick={() => onChange({ ...value, tpMode: 'percent', tpPercent: pct })}
            >
              +{pct}%
            </button>
          ))}
          <button
            type="button"
            className={`chip ${value.tpMode === 'fixed' ? 'active' : ''}`}
            onClick={() => onChange({ ...value, tpMode: 'fixed' })}
          >
            Custom
          </button>
        </div>
        {value.tpMode === 'fixed' && (
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Target price"
            value={value.fixedTpPrice}
            onChange={(e) => onChange({ ...value, fixedTpPrice: e.target.value })}
            style={{ marginTop: 8 }}
          />
        )}
      </div>
    </div>
  );
}
