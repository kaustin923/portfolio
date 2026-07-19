import {interpolate, useCurrentFrame} from 'remotion';
import {TOKENS} from '../tokens';

export const HandDrawnCircle = ({delay = 0, width = 280, height = 130}: {delay?: number; width?: number; height?: number}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [delay, delay + 16], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const length = 720;
  return (
    <svg viewBox="0 0 300 150" style={{width, height, overflow: 'visible'}}>
      <path d="M20 77 C25 18 266 8 284 69 C301 124 61 151 23 96 C-1 61 29 24 86 16" fill="none" stroke={TOKENS.color.miss} strokeWidth="9" strokeLinecap="round" strokeDasharray={length} strokeDashoffset={length * (1-progress)} />
      <path d="M26 82 C38 27 259 15 279 72 C286 121 75 143 31 101" fill="none" stroke={TOKENS.color.miss} strokeWidth="3" opacity=".72" strokeDasharray={length} strokeDashoffset={length * (1-progress)} />
    </svg>
  );
};
