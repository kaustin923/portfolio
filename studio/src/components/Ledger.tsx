import {interpolate, useCurrentFrame} from 'remotion';
import {TOKENS} from '../tokens';

const RollingDigit = ({from, to, progress}: {from: string; to: string; progress: number}) => (
  <span style={{position: 'relative', width: '.7em', height: '1.1em', overflow: 'hidden', display: 'inline-block', verticalAlign: 'bottom'}}>
    <span style={{position: 'absolute', top: 0, left: 0, transform: `translateY(${-progress * 110}%)`}}>{from}</span>
    <span style={{position: 'absolute', top: '110%', left: 0, transform: `translateY(${-progress * 110}%)`}}>{to}</span>
  </span>
);

export const Ledger = ({fromRecord = '31-9', toRecord = '31-9', tickFrame = null, compact = false}: {fromRecord?: string; toRecord?: string; tickFrame?: number | null; compact?: boolean}) => {
  const frame = useCurrentFrame();
  const progress = tickFrame === null ? 0 : interpolate(frame, [tickFrame, tickFrame + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const maxLength = Math.max(fromRecord.length, toRecord.length);
  const from = fromRecord.padStart(maxLength, ' ');
  const to = toRecord.padStart(maxLength, ' ');
  const redCellX = interpolate(progress, [0, 1], [46, 0]);
  const cells = ['W','W','L','W','W','W','L','W','W','W','W','L','W','W','W','W','W','L','W','W'];
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: compact ? 22 : 34, color: TOKENS.color.bone}}>
      <div style={{fontFamily: TOKENS.font.display, fontSize: compact ? 46 : 60, lineHeight: 1, letterSpacing: '-.04em', transform: 'scaleX(1.09)', transformOrigin: 'left'}}>
        CALLED IT.
      </div>
      <div style={{fontFamily: TOKENS.font.mono, fontWeight: 600, fontSize: compact ? 42 : 56, lineHeight: 1, fontVariantNumeric: 'tabular-nums', display: 'flex', marginLeft: 8}}>
        {[...to].map((char, index) => from[index] === char ? <span key={index}>{char}</span> : <RollingDigit key={index} from={from[index]} to={char} progress={progress} />)}
      </div>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(10, 13px)', gap: 4, marginLeft: 4}}>
        {cells.map((cell, index) => <div key={index} style={{width: 13, height: 13, background: cell === 'W' ? TOKENS.color.hit : TOKENS.color.miss}} />)}
        {toRecord !== fromRecord ? <div style={{width: 13, height: 13, background: TOKENS.color.miss, transform: `translateX(${redCellX}px)`}} /> : null}
      </div>
    </div>
  );
};
