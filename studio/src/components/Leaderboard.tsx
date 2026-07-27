import {interpolate} from 'remotion';
import type {Viz} from '../schema';
import {TOKENS} from '../tokens';

type LeaderboardViz = Extract<Viz, {kind: 'leaderboard'}>;

export const Leaderboard = ({rows, stamp, progress}: Omit<LeaderboardViz, 'kind'> & {progress: number}) => {
  const ordered = rows.map((row, index) => ({row, index})).sort((a, b) => Number(Boolean(b.row.highlight)) - Number(Boolean(a.row.highlight)) || a.index - b.index);
  const finalPositions = new Map(ordered.map(({index}, finalIndex) => [index, finalIndex]));
  const move = interpolate(progress, [.14, .74], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const rowHeight = Math.min(82, 388 / rows.length);

  return (
    <div style={{position: 'relative', height: 500, boxSizing: 'border-box', padding: '34px', borderRadius: TOKENS.radius.card, border: `2px solid ${TOKENS.color.boneHairline}`, background: 'rgba(242,237,228,.03)', overflow: 'hidden'}}>
      <div style={{position: 'relative', height: rowHeight * rows.length}}>
        {rows.map((row, index) => {
          const finalIndex = finalPositions.get(index) ?? index;
          const top = interpolate(move, [0, 1], [index * rowHeight, finalIndex * rowHeight]);
          const shownRank = move > .58 ? finalIndex + 1 : index + 1;
          return (
            <div key={`${row.label}-${index}`} style={{position: 'absolute', left: 0, right: 0, top, height: rowHeight - 7, display: 'flex', alignItems: 'center', gap: 20, boxSizing: 'border-box', padding: '0 24px', border: `2px solid ${row.highlight ? TOKENS.color.pending : TOKENS.color.boneHairline}`, background: row.highlight ? TOKENS.color.pending : 'rgba(13,15,20,.86)', color: row.highlight ? TOKENS.color.ink : TOKENS.color.bone, boxShadow: row.highlight ? `0 0 25px ${TOKENS.color.pendingSoft}` : undefined, zIndex: row.highlight ? 3 : 1}}>
              <span style={{width: 48, fontFamily: TOKENS.font.display, fontSize: Math.max(24, rowHeight * .42), lineHeight: 1}}>{String(shownRank).padStart(2, '0')}</span>
              <span style={{width: 3, alignSelf: 'stretch', background: row.highlight ? TOKENS.color.ink : TOKENS.color.boneHairline}} />
              <span style={{fontFamily: TOKENS.font.mono, fontSize: Math.max(15, rowHeight * .27), fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase'}}>{row.label}</span>
            </div>
          );
        })}
      </div>
      {stamp ? (
        <div style={{position: 'absolute', right: 30, bottom: 20, padding: '10px 16px', border: `5px double ${TOKENS.color.pending}`, borderRadius: 7, background: TOKENS.color.ink, color: TOKENS.color.pending, fontFamily: TOKENS.font.display, fontSize: 28, letterSpacing: '.04em', transform: `rotate(-6deg) scale(${interpolate(progress, [.72, .84, 1], [1.6, .92, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})})`, opacity: interpolate(progress, [.7, .76], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), zIndex: 6}}>{stamp}</div>
      ) : null}
    </div>
  );
};
