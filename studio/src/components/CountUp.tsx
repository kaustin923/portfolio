import {interpolate} from 'remotion';
import type {Viz} from '../schema';
import {TOKENS} from '../tokens';

type CounterViz = Extract<Viz, {kind: 'counter'}>;

const decimalPlaces = (value: number) => {
  const fraction = String(Math.abs(value)).split('.')[1];
  return Math.min(2, fraction?.length ?? 0);
};

const formatCounter = (value: number, prefix = '', unit = '', fractionDigits = 0) => {
  const rounded = Number(value.toFixed(fractionDigits));
  const prefixIsNegative = prefix.startsWith('-');
  const sign = rounded < 0 || prefixIsNegative ? '-' : '';
  const unsignedPrefix = prefix.replace(/^-+/, '');
  return `${sign}${unsignedPrefix}${Math.abs(rounded).toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}${unit}`;
};

export const CountUp = ({label, to, unit, prefix, from = 0, negative, sub, progress}: Omit<CounterViz, 'kind'> & {progress: number}) => {
  const target = negative ? -Math.abs(to) : to;
  const fractionDigits = decimalPlaces(target);
  const countProgress = interpolate(progress, [0, .62], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const current = interpolate(countProgress, [0, 1], [from, target], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const formatted = formatCounter(current, prefix, unit, fractionDigits);
  const size = formatted.length > 12 ? 88 : formatted.length > 9 ? 106 : 132;

  return (
    <div style={{height: 455, boxSizing: 'border-box', padding: '45px 48px 42px', borderTop: `5px solid ${TOKENS.color.pending}`, borderBottom: `3px solid ${TOKENS.color.boneHairline}`, background: `linear-gradient(110deg, ${TOKENS.color.pendingSoft}, transparent 58%)`}}>
      <div style={{fontFamily: TOKENS.font.mono, color: TOKENS.color.boneMuted, fontSize: 21, fontWeight: 700, letterSpacing: '.17em', textTransform: 'uppercase'}}>{label}</div>
      <div style={{marginTop: 62, color: TOKENS.color.pending, fontFamily: TOKENS.font.display, fontSize: size, lineHeight: .82, letterSpacing: '-.065em', whiteSpace: 'nowrap', textShadow: `0 0 36px ${TOKENS.color.pendingSoft}`, transform: `scaleX(${.94 + progress * .06})`, transformOrigin: 'left'}}>{formatted}</div>
      <div style={{marginTop: 55, display: 'flex', alignItems: 'center', gap: 18}}>
        <span style={{width: `${Math.max(8, progress * 180)}px`, height: 7, background: TOKENS.color.pending}} />
        <span style={{fontFamily: TOKENS.font.mono, color: TOKENS.color.boneMuted, fontSize: 19, lineHeight: 1.25, letterSpacing: '.08em', textTransform: 'uppercase'}}>{sub ?? `${formatCounter(from, prefix, unit, fractionDigits)} → ${formatCounter(target, prefix, unit, fractionDigits)}`}</span>
      </div>
    </div>
  );
};
