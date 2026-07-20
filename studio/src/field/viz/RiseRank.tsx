import {interpolate, spring, useVideoConfig} from 'remotion';
import type {RiseRankViz} from '../../schema';
import {relativeProgress} from '../../scenes/EducationalShared';
import {TOKENS} from '../../tokens';
import {FieldCard} from '../FieldCard';

const ROW_HEIGHT = 150;
const ROW_GAP = 16;
const ROW_START = 110;
const rowTop = (index: number) => ROW_START + index * (ROW_HEIGHT + ROW_GAP);
const rowCenter = (index: number) => rowTop(index) + ROW_HEIGHT / 2;

export const RiseRank = ({viz, frame, duration}: {viz: RiseRankViz; frame: number; duration: number}) => {
  const {fps} = useVideoConfig();
  const ph = (from: number, to: number) => relativeProgress(frame, duration, from, to);
  const steps = viz.fromIndex - viz.toIndex;
  const climbStart = Math.round(duration * .30);
  const climbEnd = Math.round(duration * .75);
  const climbFrames = Math.max(steps, climbEnd - climbStart);
  const stepFrames = Math.max(1, climbFrames / steps);
  const rawStep = Math.min(steps, Math.max(0, (frame - climbStart) / stepFrames));
  const activeStep = Math.min(steps - 1, Math.floor(rawStep));
  const segmentStart = climbStart + activeStep * stepFrames;
  const segmentSpring = spring({
    frame: Math.max(0, frame - segmentStart),
    fps,
    durationInFrames: Math.max(1, Math.round(stepFrames)),
    config: {damping: 13, stiffness: 170, mass: .8},
  });
  const fromRow = viz.fromIndex - activeStep;
  const toRow = fromRow - 1;
  const climberY = frame < climbStart
    ? rowCenter(viz.fromIndex)
    : frame >= climbEnd
      ? rowCenter(viz.toIndex)
      : rowCenter(fromRow) + (rowCenter(toRow) - rowCenter(fromRow)) * segmentSpring;
  const climberPop = spring({frame: Math.max(0, frame - Math.round(duration * .22)), fps, config: {damping: 13, stiffness: 170, mass: .8}});
  const arrival = ph(.78, .90);
  const pulseFrame = frame - Math.round(duration * .78);
  const pulse = interpolate(pulseFrame, [0, 6, 12], [0, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const target = viz.rungs[viz.toIndex];

  const passedProgress = (index: number) => {
    if (index <= viz.toIndex || index > viz.fromIndex) return 0;
    const step = viz.fromIndex - index;
    const start = climbStart + step * stepFrames;
    return interpolate(frame, [start, start + 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  };

  return (
    <FieldCard label={viz.label} labelReveal={ph(0, .10)}>
      {viz.rungs.map((rung, index) => {
        const start = Math.round(duration * .04) + index * 3;
        const pop = spring({frame: Math.max(0, frame - start), fps, config: {damping: 13, stiffness: 170, mass: .8}});
        const passed = passedProgress(index);
        const isTarget = index === viz.toIndex;
        return (
          <div
            key={`${rung.rank}-${index}`}
            style={{
              position: 'absolute',
              left: 48,
              right: 48,
              top: rowTop(index),
              height: ROW_HEIGHT,
              boxSizing: 'border-box',
              borderBottom: `2px solid ${TOKENS.color.boneHairline}`,
              opacity: pop * (1 - passed * .65),
              transform: `translateY(${(1 - pop) * 40}px)`,
            }}
          >
            {isTarget && arrival > 0 ? <div style={{position: 'absolute', inset: 0, borderRadius: 12, background: TOKENS.color.pendingSoft, opacity: interpolate(arrival, [0, 1], [.25, .08])}} /> : null}
            <div style={{position: 'absolute', left: 0, top: 35, color: isTarget && arrival > .05 ? TOKENS.color.pending : TOKENS.color.boneMuted, fontFamily: TOKENS.font.display, fontSize: 64, letterSpacing: '-.04em', lineHeight: 1}}>
              {rung.rank}
            </div>
            {rung.ghost ? (
              <div style={{position: 'absolute', right: 0, top: 53, color: TOKENS.color.boneMuted, fontFamily: TOKENS.font.mono, fontSize: 24, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase'}}>
                {rung.ghost}
                <span style={{position: 'absolute', left: -4, right: -4, top: '50%', height: 4, borderRadius: 3, background: TOKENS.color.miss, transform: `scaleX(${passed})`, transformOrigin: 'left center'}} />
              </div>
            ) : null}
            {isTarget && target.note ? (
              <div style={{position: 'absolute', left: 100, top: 96, color: TOKENS.color.pending, fontFamily: TOKENS.font.mono, fontSize: 22, fontWeight: 700, letterSpacing: '.07em', lineHeight: 1, textTransform: 'uppercase', opacity: arrival, transform: `translateX(${(1 - arrival) * 30}px)`}}>
                {target.note}
              </div>
            ) : null}
          </div>
        );
      })}

      <div
        style={{
          position: 'absolute',
          left: 410,
          top: climberY,
          zIndex: 12,
          width: 430,
          height: 110,
          boxSizing: 'border-box',
          padding: '18px 22px',
          border: `3px solid ${TOKENS.color.pending}`,
          borderRadius: 16,
          background: 'rgba(13,15,20,.94)',
          boxShadow: `0 0 ${24 + pulse * 24}px ${TOKENS.color.pendingSoft}`,
          opacity: climberPop,
          transform: `translateY(-50%) scale(${(.6 + climberPop * .4) * (1 + pulse * .08)})`,
          transformOrigin: 'center',
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
          <span style={{color: TOKENS.color.pending, fontFamily: TOKENS.font.display, fontSize: viz.climber.name.length > 9 ? 34 : 40, letterSpacing: '-.035em', lineHeight: 1, whiteSpace: 'nowrap'}}>{viz.climber.name}</span>
          <span style={{display: 'grid', placeItems: 'center', minWidth: 44, height: 36, padding: '0 8px', borderRadius: 8, background: TOKENS.color.pending, color: TOKENS.color.ink, fontFamily: TOKENS.font.mono, fontSize: 20, fontWeight: 800}}>{viz.climber.label}</span>
        </div>
        {viz.climber.stat ? <div style={{marginTop: 12, color: TOKENS.color.pending, fontFamily: TOKENS.font.mono, fontSize: 20, fontWeight: 700, letterSpacing: '.08em'}}>{viz.climber.stat.toUpperCase()}</div> : null}
      </div>
    </FieldCard>
  );
};
