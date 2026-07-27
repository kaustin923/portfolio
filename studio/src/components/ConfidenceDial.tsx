import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {TOKENS} from '../tokens';

export const ConfidenceDial = ({target, delay = 0, size = 252, frameOverride}: {target: number; delay?: number; size?: number; frameOverride?: number}) => {
  const currentFrame = useCurrentFrame();
  const frame = frameOverride ?? currentFrame;
  const {fps} = useVideoConfig();
  const progress = spring({frame: frame - delay, fps, config: {damping: 15, mass: 0.85, stiffness: 120}});
  const shown = Math.round(interpolate(progress, [0, 1], [0, target], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  const radius = 88;
  const circumference = Math.PI * radius;
  const filled = circumference * (target / 100) * progress;
  const gradientId = `confidence-${target}-${size}`;
  return (
    <div style={{width: size, height: size, position: 'relative', display: 'grid', placeItems: 'center'}}>
      <svg viewBox="0 0 240 240" style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={TOKENS.color.miss} />
            <stop offset="0.52" stopColor={TOKENS.color.pending} />
            <stop offset="1" stopColor={TOKENS.color.hit} />
          </linearGradient>
        </defs>
        <path d="M 32 128 A 88 88 0 0 1 208 128" fill="none" stroke="rgba(13,15,20,.15)" strokeWidth="16" strokeLinecap="round" />
        <path
          d="M 32 128 A 88 88 0 0 1 208 128"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0, filled)} ${circumference}`}
        />
        {Array.from({length: 9}).map((_, index) => {
          const angle = Math.PI + (Math.PI * index) / 8;
          const x1 = 120 + Math.cos(angle) * 104;
          const y1 = 128 + Math.sin(angle) * 104;
          const x2 = 120 + Math.cos(angle) * 112;
          const y2 = 128 + Math.sin(angle) * 112;
          return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke={TOKENS.color.ink} strokeWidth="3" opacity=".35" />;
        })}
      </svg>
      <div style={{fontFamily: TOKENS.font.mono, fontSize: size * 0.25, fontWeight: 600, color: TOKENS.color.ink, fontVariantNumeric: 'tabular-nums', marginTop: size * 0.1}}>
        {shown}%
      </div>
      <div style={{position: 'absolute', bottom: size * 0.18, fontFamily: TOKENS.font.caption, fontWeight: 700, fontSize: size * 0.055, color: TOKENS.color.ink, letterSpacing: '.18em'}}>
        CONFIDENCE
      </div>
    </div>
  );
};
