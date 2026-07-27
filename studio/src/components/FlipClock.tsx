import {interpolate, useCurrentFrame} from 'remotion';
import {TOKENS} from '../tokens';

const Flap = ({char, index, frame, compact}: {char: string; index: number; frame: number; compact: boolean}) => {
  const local = Math.max(0, frame - index * 2);
  const rotation = interpolate(local, [0, 1, 5, 9], [0, -72, 12, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const wide = char === ' ' ? (compact ? 20 : 30) : char === '.' ? (compact ? 30 : 42) : (compact ? 84 : 125);
  const height = compact ? 116 : 174;
  return (
    <div
      style={{
        width: wide,
        height,
        position: 'relative',
        borderRadius: 14,
        background: char === ' ' ? 'transparent' : TOKENS.color.bone,
        boxShadow: char === ' ' ? undefined : '0 12px 0 rgba(0,0,0,.32), inset 0 -4px 0 rgba(13,15,20,.12)',
        overflow: 'hidden',
        transform: char === ' ' ? undefined : `perspective(620px) rotateX(${rotation}deg)`,
        transformOrigin: '50% 50%',
      }}
    >
      {char !== ' ' ? (
        <>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: TOKENS.color.ink,
              fontFamily: TOKENS.font.display,
              fontSize: compact ? 72 : 112,
              lineHeight: 1,
              letterSpacing: '-.06em',
              transform: 'scaleX(1.08)',
            }}
          >
            {char}
          </div>
          <div style={{position: 'absolute', left: 0, right: 0, top: height / 2 - 2, height: 3, background: TOKENS.color.ink, opacity: 0.26}} />
          <div style={{position: 'absolute', left: 8, top: height / 2 - 9, width: compact ? 5 : 7, height: compact ? 13 : 18, borderRadius: 4, background: TOKENS.color.ink, opacity: 0.35}} />
          <div style={{position: 'absolute', right: 8, top: height / 2 - 9, width: compact ? 5 : 7, height: compact ? 13 : 18, borderRadius: 4, background: TOKENS.color.ink, opacity: 0.35}} />
        </>
      ) : null}
    </div>
  );
};

export const FlipClock = ({label = '13 DAYS.', frameOverride, compact = false}: {label?: string; frameOverride?: number; compact?: boolean}) => {
  const currentFrame = useCurrentFrame();
  const frame = frameOverride ?? currentFrame;
  return (
    <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 9}}>
      {[...label].map((char, index) => <Flap char={char} frame={frame} index={index} compact={compact} key={`${char}-${index}`} />)}
    </div>
  );
};
