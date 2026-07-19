import {interpolate} from 'remotion';
import type {Viz} from '../schema';
import {TOKENS} from '../tokens';

type CompareBarsViz = Extract<Viz, {kind: 'compareBars'}>;

const toneColor = (tone: 'accent' | 'bone' | 'blue' | undefined) => {
  if (tone === 'accent') return TOKENS.color.pending;
  if (tone === 'blue') return TOKENS.color.pendingBlue;
  return TOKENS.color.bone;
};

const format = (value: number) => value.toLocaleString('en-US', {maximumFractionDigits: 2});

export const CompareBars = ({unit, bars, reference, progress}: Omit<CompareBarsViz, 'kind'> & {progress: number}) => {
  const values = [...bars.map((bar) => bar.value), ...(reference ? [reference.value] : []), 0];
  const domainMin = Math.min(...values);
  const domainMax = Math.max(...values);
  const span = Math.max(1, domainMax - domainMin);
  const plotLeft = 56;
  const plotWidth = 776;
  const plotTop = 48;
  const plotHeight = 342;
  const zeroY = ((domainMax - 0) / span) * plotHeight;
  const columnWidth = plotWidth / bars.length;
  const barWidth = Math.min(116, columnWidth * .53);

  return (
    <div style={{position: 'relative', width: 888, height: 530, borderRadius: TOKENS.radius.card, border: `2px solid ${TOKENS.color.boneHairline}`, background: 'rgba(242,237,228,.025)', overflow: 'hidden'}}>
      <div style={{position: 'absolute', top: 18, left: 24, fontFamily: TOKENS.font.mono, color: TOKENS.color.boneMuted, fontSize: 18, fontWeight: 700, letterSpacing: '.16em'}}>REAL VALUES / {unit.toUpperCase()}</div>
      <div style={{position: 'absolute', left: plotLeft, width: plotWidth, top: plotTop + zeroY, height: 3, background: TOKENS.color.boneHairline}} />
      {reference ? (() => {
        const top = plotTop + ((domainMax - reference.value) / span) * plotHeight;
        return (
          <div style={{position: 'absolute', left: 28, right: 28, top, borderTop: `3px dashed ${TOKENS.color.pending}`, zIndex: 3}}>
            <div style={{position: 'absolute', right: 0, top: -34, padding: '5px 9px', background: TOKENS.color.ink, color: TOKENS.color.pending, fontFamily: TOKENS.font.mono, fontSize: 17, fontWeight: 700, textTransform: 'uppercase'}}>{reference.label} {format(reference.value)}{unit}</div>
          </div>
        );
      })() : null}
      {bars.map((bar, index) => {
        const animatedValue = interpolate(progress, [0, 1], [0, bar.value], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        const height = (Math.abs(bar.value) / span) * plotHeight * Math.max(0, Math.min(1, progress));
        const base = plotTop + zeroY;
        const top = bar.value >= 0 ? base - height : base;
        const left = plotLeft + index * columnWidth + (columnWidth - barWidth) / 2;
        const valueInside = bar.value >= 0 && top < plotTop + 38;
        const valueTop = bar.value >= 0 ? (valueInside ? top + 10 : top - 35) : Math.min(plotTop + plotHeight - 24, top + height + 8);
        return (
          <div key={`${bar.label}-${index}`}>
            <div style={{position: 'absolute', left, top, width: barWidth, height: Math.max(5, height), background: toneColor(bar.tone), boxShadow: bar.tone === 'accent' ? `0 0 28px ${TOKENS.color.pendingSoft}` : undefined}} />
            <div style={{position: 'absolute', left: plotLeft + index * columnWidth, top: valueTop, width: columnWidth, color: valueInside ? TOKENS.color.ink : toneColor(bar.tone), fontFamily: TOKENS.font.mono, fontSize: 21, fontWeight: 700, textAlign: 'center'}}>{format(animatedValue)}{unit}</div>
            <div style={{position: 'absolute', left: plotLeft + index * columnWidth + 5, top: 416, width: columnWidth - 10, color: TOKENS.color.bone, fontFamily: TOKENS.font.mono, fontSize: 18, fontWeight: 700, lineHeight: 1.12, textAlign: 'center', textTransform: 'uppercase', overflowWrap: 'anywhere'}}>{bar.label}</div>
          </div>
        );
      })}
    </div>
  );
};
