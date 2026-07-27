import {interpolate, useCurrentFrame} from 'remotion';
import {TOKENS} from '../tokens';

export type StampStatus = 'HIT' | 'MISS' | 'PENDING';

export const Stamp = ({status, landFrame = 0, small = false}: {status: StampStatus; landFrame?: number; small?: boolean}) => {
  const frame = useCurrentFrame();
  const local = frame - landFrame;
  if (local < 0) return null;
  const scale = interpolate(local, [0, 2, 4, 6], [1.6, 1.26, 0.94, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const y = interpolate(local, [0, 4], [-70, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const color = status === 'HIT' ? TOKENS.color.hit : status === 'MISS' ? TOKENS.color.miss : TOKENS.color.pending;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: small ? 230 : 420,
        height: small ? 94 : 154,
        padding: small ? '0 24px' : '0 42px',
        border: `${small ? 7 : 11}px double ${color}`,
        borderRadius: 12,
        color,
        fontFamily: TOKENS.font.display,
        fontSize: small ? 52 : 92,
        lineHeight: 1,
        letterSpacing: '.09em',
        textShadow: `2px 1px 0 ${color}, -2px -1px 0 ${color}`,
        boxShadow: `inset 0 0 0 3px ${color}`,
        transform: `translateY(${y}px) rotate(-8deg) scale(${scale}) scaleX(1.08)`,
        filter: 'url(#stamp-bleed)',
      }}
    >
      <svg width="0" height="0" style={{position: 'absolute'}}>
        <filter id="stamp-bleed"><feTurbulence baseFrequency=".035" numOctaves="1" seed="9" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5"/></filter>
      </svg>
      {status}
    </div>
  );
};
