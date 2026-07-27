import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {TOKENS} from '../tokens';

const years = ['2013', '2015', '2019', '2022', '2026'];

export const TimelineScrub = ({delay = 0}: {delay?: number}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = interpolate(frame, [delay, delay + 32], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <svg viewBox="0 0 888 370" style={{width: 888, height: 370, overflow: 'visible'}}>
      <line x1="54" y1="182" x2="834" y2="182" stroke={TOKENS.color.bone} strokeWidth="6" strokeDasharray="780" strokeDashoffset={780 * (1 - progress)} />
      {years.map((year, index) => {
        const x = 54 + (780 * index) / (years.length - 1);
        const pop = spring({frame: frame - delay - 8 - index * 6, fps, config: {damping: 13, stiffness: 180, mass: 0.7}});
        const isLast = index === years.length - 1;
        const pulse = isLast && frame > delay + 40 ? 1 + 0.08 * Math.sin((frame - delay) * 0.55) : 1;
        return (
          <g key={year} transform={`translate(${x} 182) scale(${pop * pulse})`}>
            <circle r={isLast ? 30 : 22} fill={isLast ? TOKENS.color.pending : TOKENS.color.ink} stroke={TOKENS.color.bone} strokeWidth="6" />
            <text x="0" y={index % 2 === 0 ? -62 : 84} fill={TOKENS.color.bone} textAnchor="middle" style={{fontFamily: TOKENS.font.mono, fontWeight: 600, fontSize: 30}}>{year}</text>
            <text x="0" y={index % 2 === 0 ? -106 : 128} fill={TOKENS.color.boneMuted} textAnchor="middle" style={{fontFamily: TOKENS.font.caption, fontWeight: 700, fontSize: 17, letterSpacing: '.12em'}}>MATCH {index + 1}</text>
          </g>
        );
      })}
    </svg>
  );
};
