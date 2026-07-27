import {interpolate, useCurrentFrame} from 'remotion';
import {TOKENS} from '../tokens';

const lines = [
  [170, 90, 670, 90], [170, 90, 90, 190], [670, 90, 790, 190], [90, 190, 790, 190],
  [90, 190, 90, 590], [790, 190, 790, 590], [90, 590, 790, 590], [170, 90, 170, 500],
  [670, 90, 670, 500], [170, 500, 670, 500], [170, 500, 90, 590], [670, 500, 790, 590],
];

export const WireframeDraw = ({delay = 0}: {delay?: number}) => {
  const frame = useCurrentFrame();
  return (
    <svg viewBox="0 0 880 670" style={{width: 880, height: 670}}>
      {lines.map(([x1,y1,x2,y2], index) => {
        const progress = interpolate(frame, [delay + index * 1.5, delay + 30 + index * 1.5], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        const length = Math.hypot(x2 - x1, y2 - y1);
        return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke={index < 4 ? TOKENS.color.pending : TOKENS.color.bone} strokeWidth={index < 4 ? 6 : 4} strokeDasharray={length} strokeDashoffset={length * (1 - progress)} />;
      })}
      {Array.from({length: 8}).map((_, index) => {
        const x = 130 + index * 85;
        const progress = interpolate(frame, [delay + 10 + index, delay + 38 + index], [0,1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
        return <line key={`mesh-${index}`} x1={x} y1="165" x2={x} y2="590" stroke={TOKENS.color.boneHairline} strokeWidth="2" strokeDasharray="425" strokeDashoffset={425 * (1-progress)} />;
      })}
    </svg>
  );
};
