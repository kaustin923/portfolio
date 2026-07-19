import {interpolate} from 'remotion';
import type {Viz} from '../schema';
import {TOKENS} from '../tokens';

type MeterViz = Extract<Viz, {kind: 'meter'}>;

export const Meter = ({from, to, label, progress}: Omit<MeterViz, 'kind'> & {progress: number}) => {
  const sweep = interpolate(progress, [0, 1], [-72, 72], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const radians = (sweep * Math.PI) / 180;
  const needleX = 260 + Math.sin(radians) * 176;
  const needleY = 260 - Math.cos(radians) * 176;
  const maxed = to.trim().toUpperCase() === 'MAX';
  const edge = maxed ? progress : 0;

  return (
    <div style={{position: 'relative', height: 500, boxSizing: 'border-box', border: `4px solid ${edge > .72 ? TOKENS.color.pending : TOKENS.color.boneHairline}`, borderRadius: TOKENS.radius.card, background: `radial-gradient(circle at 50% 58%, ${TOKENS.color.pendingSoft}, transparent 44%)`, boxShadow: edge > 0 ? `inset 0 0 ${Math.round(edge * 42)}px ${TOKENS.color.pendingSoft}, 0 0 ${Math.round(edge * 36)}px ${TOKENS.color.pendingSoft}` : undefined, overflow: 'hidden'}}>
      <svg viewBox="0 0 520 340" width="100%" height="340" style={{position: 'absolute', top: 25, left: 0}}>
        <path d="M60 260 A200 200 0 0 1 460 260" fill="none" stroke={TOKENS.color.boneHairline} strokeWidth="26" strokeLinecap="round" />
        <path d="M60 260 A200 200 0 0 1 460 260" fill="none" stroke={TOKENS.color.pending} strokeWidth="12" strokeLinecap="round" pathLength="100" strokeDasharray={`${Math.max(1, progress * 100)} 100`} style={{filter: `drop-shadow(0 0 12px ${TOKENS.color.pendingSoft})`}} />
        {Array.from({length: 9}, (_, index) => {
          const angle = (-72 + index * 18) * Math.PI / 180;
          const x1 = 260 + Math.sin(angle) * 188;
          const y1 = 260 - Math.cos(angle) * 188;
          const x2 = 260 + Math.sin(angle) * 165;
          const y2 = 260 - Math.cos(angle) * 165;
          return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke={TOKENS.color.bone} strokeWidth="5" strokeLinecap="round" />;
        })}
        <line x1="260" y1="260" x2={needleX} y2={needleY} stroke={TOKENS.color.pending} strokeWidth="12" strokeLinecap="round" />
        <circle cx="260" cy="260" r="30" fill={TOKENS.color.pending} />
        <circle cx="260" cy="260" r="11" fill={TOKENS.color.ink} />
      </svg>
      <div style={{position: 'absolute', left: 52, right: 52, top: 320, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: TOKENS.font.display, fontSize: 42, letterSpacing: '-.025em'}}>
        <span style={{color: TOKENS.color.boneMuted}}>{from}</span>
        <span style={{padding: '7px 14px', background: progress > .82 ? TOKENS.color.pending : 'transparent', color: progress > .82 ? TOKENS.color.ink : TOKENS.color.pending, border: `2px solid ${TOKENS.color.pending}`}}>{to}</span>
      </div>
      <div style={{position: 'absolute', left: 52, right: 52, bottom: 31, paddingTop: 22, borderTop: `3px solid ${TOKENS.color.boneHairline}`, color: TOKENS.color.bone, fontFamily: TOKENS.font.mono, fontSize: 22, fontWeight: 700, letterSpacing: '.13em', textAlign: 'center', textTransform: 'uppercase'}}>{label}</div>
    </div>
  );
};
