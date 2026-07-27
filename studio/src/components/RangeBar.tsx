import type {Viz} from '../schema';
import {TOKENS} from '../tokens';

type RangeBarViz = Extract<Viz, {kind: 'rangeBar'}>;

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const format = (value: number) => value.toLocaleString('en-US', {maximumFractionDigits: 2});

export const RangeBar = ({
  label,
  unit,
  low,
  high,
  compare,
  badge,
  progress,
}: Omit<RangeBarViz, 'kind'> & {progress: number}) => {
  const reveal = clamp(progress);
  const domainMax = Math.max(1, high, compare?.value ?? 0) * 1.12;
  const current = high * reveal;
  const lowWidth = (Math.min(current, low) / domainMax) * 100;
  const bandWidth = (Math.max(0, current - low) / domainMax) * 100;
  const comparePosition = compare ? (compare.value / domainMax) * 100 : 0;
  const overtaken = Boolean(compare && current >= compare.value);
  const labelSize = label.length > 64 ? 36 : label.length > 42 ? 41 : 47;

  return (
    <div style={{position: 'relative', height: 455, boxSizing: 'border-box', border: `3px solid ${TOKENS.color.boneHairline}`, borderRadius: TOKENS.radius.card, background: 'rgba(13,15,20,.72)', boxShadow: `0 0 40px ${TOKENS.color.pendingSoft}`}}>
      {badge ? (
        <div style={{position: 'absolute', top: 24, right: 42, maxWidth: 330, boxSizing: 'border-box', overflow: 'hidden', padding: '9px 14px', border: `5px double ${TOKENS.color.pending}`, borderRadius: 8, color: TOKENS.color.pending, fontFamily: TOKENS.font.display, fontSize: 25, letterSpacing: '.04em', whiteSpace: 'nowrap', textOverflow: 'ellipsis', transform: `rotate(-4deg) scale(${.72 + reveal * .28})`, opacity: clamp((reveal - .58) / .2)}}>{badge}</div>
      ) : null}
      <div style={{position: 'absolute', top: 96, left: 48, right: 48, display: '-webkit-box', overflow: 'hidden', fontFamily: TOKENS.font.display, fontSize: labelSize, lineHeight: .96, letterSpacing: '-.035em', textTransform: 'uppercase', overflowWrap: 'anywhere', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2}}>{label}</div>

      <div style={{position: 'absolute', left: 48, right: 48, top: 212, height: 58, border: `2px solid ${TOKENS.color.boneHairline}`, background: 'rgba(242,237,228,.05)'}}>
        <div style={{position: 'absolute', inset: '0 auto 0 0', width: `${lowWidth}%`, background: TOKENS.color.bone, opacity: .82}} />
        <div style={{position: 'absolute', top: -2, bottom: -2, left: `${(low / domainMax) * 100}%`, width: `${bandWidth}%`, background: TOKENS.color.pending, boxShadow: `0 0 26px ${TOKENS.color.pendingSoft}`}} />
        {compare ? (
          <>
            <div style={{position: 'absolute', left: `${comparePosition}%`, top: -16, width: 3, height: 92, background: overtaken ? TOKENS.color.pending : TOKENS.color.boneMuted}} />
            <div style={{position: 'absolute', top: 76, left: `clamp(150px, ${comparePosition}%, calc(100% - 150px))`, width: 300, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, color: overtaken ? TOKENS.color.pending : TOKENS.color.bone, fontFamily: TOKENS.font.mono, fontSize: 16, fontWeight: 700, lineHeight: 1.1, textTransform: 'uppercase', transform: `translateX(-50%) translateY(${overtaken ? 4 : 0}px)`, opacity: overtaken ? .72 : 1, textAlign: 'center'}}>
              <span style={{display: '-webkit-box', overflow: 'hidden', overflowWrap: 'anywhere', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2}}>{compare.label}</span>
              <span style={{flexShrink: 0, whiteSpace: 'nowrap'}}>{format(compare.value)}{unit}</span>
            </div>
          </>
        ) : null}
      </div>

      <div style={{position: 'absolute', left: 48, right: 48, top: 348, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between'}}>
        <div style={{color: TOKENS.color.bone, fontFamily: TOKENS.font.mono, fontSize: 28, fontWeight: 700, whiteSpace: 'nowrap'}}>{format(low)}{unit}</div>
        <div style={{color: TOKENS.color.pending, fontFamily: TOKENS.font.display, fontSize: 44, lineHeight: .9, letterSpacing: '-.04em', whiteSpace: 'nowrap'}}>{format(high)}{unit}</div>
      </div>
      <div style={{position: 'absolute', left: 48, right: 48, bottom: 28, height: 2, background: TOKENS.color.boneHairline}} />
    </div>
  );
};
