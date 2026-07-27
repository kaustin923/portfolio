import {interpolate} from 'remotion';
import type {Viz} from '../schema';
import {TOKENS} from '../tokens';

type GridViz = Extract<Viz, {kind: 'grid'}>;

const animatedResult = (label: string, progress: number) => {
  const match = label.match(/^(.*?)(-?[\d,]+(?:\.\d+)?)\s*$/);
  if (!match) return label;
  const numeric = Number(match[2].replaceAll(',', ''));
  if (!Number.isFinite(numeric)) return label;
  const decimals = match[2].includes('.') ? match[2].split('.')[1].length : 0;
  const current = interpolate(progress, [0, 1], [0, numeric], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return `${match[1]}${current.toLocaleString('en-US', {minimumFractionDigits: decimals, maximumFractionDigits: decimals})}`;
};

export const ScreenGrid = ({total, filled, filledLabel, resultLabel, caption, progress}: Omit<GridViz, 'kind'> & {progress: number}) => {
  const columns = Math.min(10, Math.max(2, Math.ceil(Math.sqrt(total))));
  const rows = Math.ceil(total / columns);
  const gap = rows > 6 ? 6 : 10;
  const cellHeight = Math.min(58, (292 - gap * (rows - 1)) / rows);

  return (
    <div style={{height: 548, boxSizing: 'border-box', padding: '29px 34px 26px', border: `2px solid ${TOKENS.color.boneHairline}`, borderRadius: TOKENS.radius.card, background: 'rgba(242,237,228,.03)', overflow: 'hidden'}}>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, color: TOKENS.color.bone, fontFamily: TOKENS.font.mono, fontSize: 18, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase'}}>
          <span style={{width: 22, height: 22, flex: '0 0 auto', background: TOKENS.color.pending, boxShadow: `0 0 14px ${TOKENS.color.pendingSoft}`}} />
          <span>{filledLabel}</span>
        </div>
        <div style={{flex: '0 0 auto', color: TOKENS.color.boneMuted, fontFamily: TOKENS.font.mono, fontSize: 17}}>{filled} / {total}</div>
      </div>
      <div style={{height: 292, marginTop: 24, display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gridAutoRows: cellHeight, gap}}>
        {Array.from({length: total}, (_, index) => {
          const isFilled = index < filled;
          const fillProgress = isFilled
            ? interpolate(progress, [index / Math.max(1, filled) * .45, index / Math.max(1, filled) * .45 + .22], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
            : 0;
          return (
            <div key={index} style={{position: 'relative', border: `2px solid ${isFilled ? TOKENS.color.pending : TOKENS.color.boneHairline}`, background: isFilled ? TOKENS.color.pending : 'transparent', opacity: isFilled ? .22 + fillProgress * .78 : .75, transform: isFilled ? `scale(${.7 + fillProgress * .3})` : undefined, boxShadow: isFilled ? `0 0 ${Math.round(fillProgress * 16)}px ${TOKENS.color.pendingSoft}` : undefined}}>
              <span style={{position: 'absolute', right: 5, bottom: 3, color: isFilled ? TOKENS.color.ink : TOKENS.color.boneMuted, fontFamily: TOKENS.font.mono, fontSize: 10}}>{String(index + 1).padStart(2, '0')}</span>
            </div>
          );
        })}
      </div>
      <div style={{marginTop: 23, color: TOKENS.color.pending, fontFamily: TOKENS.font.display, fontSize: resultLabel.length > 30 ? 31 : 38, lineHeight: .95, letterSpacing: '-.035em', textTransform: 'uppercase'}}>{animatedResult(resultLabel, progress)}</div>
      {caption ? <div style={{marginTop: 12, color: TOKENS.color.boneMuted, fontFamily: TOKENS.font.mono, fontSize: 16, lineHeight: 1.2, letterSpacing: '.08em', textTransform: 'uppercase'}}>{caption}</div> : null}
    </div>
  );
};
