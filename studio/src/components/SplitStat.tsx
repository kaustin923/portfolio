import {interpolate} from 'remotion';
import type {Viz} from '../schema';
import {TOKENS} from '../tokens';

type SplitViz = Extract<Viz, {kind: 'split'}>;

export const SplitStat = ({left, right, stamp, progress}: Omit<SplitViz, 'kind'> & {progress: number}) => {
  const offset = interpolate(progress, [0, 1], [90, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const stampScale = interpolate(progress, [.7, .84, 1], [1.7, .9, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <div style={{position: 'relative', height: 480, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18}}>
      {[
        {side: left, direction: -1, accent: false},
        {side: right, direction: 1, accent: true},
      ].map(({side, direction, accent}, index) => (
        <div key={index} style={{position: 'relative', boxSizing: 'border-box', padding: '42px 34px', border: `3px solid ${accent ? TOKENS.color.pending : TOKENS.color.boneHairline}`, borderRadius: TOKENS.radius.card, background: accent ? `linear-gradient(145deg, ${TOKENS.color.pendingSoft}, rgba(13,15,20,.86) 65%)` : 'rgba(242,237,228,.04)', transform: `translateX(${offset * direction}px)`, overflow: 'hidden'}}>
          <div style={{fontFamily: TOKENS.font.mono, color: accent ? TOKENS.color.pending : TOKENS.color.boneMuted, fontSize: 20, fontWeight: 700, lineHeight: 1.2, letterSpacing: '.13em', textTransform: 'uppercase'}}>{side.label}</div>
          <div style={{position: 'absolute', left: 31, right: 31, top: 180, fontFamily: TOKENS.font.display, color: accent ? TOKENS.color.pending : TOKENS.color.bone, fontSize: side.value.length > 8 ? 68 : 91, lineHeight: .84, letterSpacing: '-.06em', overflowWrap: 'anywhere'}}>{side.value}</div>
          <div style={{position: 'absolute', left: 34, right: 34, bottom: 35, height: 7, background: accent ? TOKENS.color.pending : TOKENS.color.bone}} />
        </div>
      ))}
      {stamp ? (
        <div style={{position: 'absolute', left: '50%', bottom: 42, minWidth: 250, padding: '13px 20px', border: `6px double ${TOKENS.color.pending}`, borderRadius: 8, background: TOKENS.color.ink, color: TOKENS.color.pending, fontFamily: TOKENS.font.display, fontSize: 31, letterSpacing: '.035em', textAlign: 'center', transform: `translateX(-50%) rotate(-5deg) scale(${stampScale})`, opacity: interpolate(progress, [.68, .75], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), boxShadow: `0 0 25px ${TOKENS.color.pendingSoft}`}}>{stamp}</div>
      ) : null}
    </div>
  );
};
