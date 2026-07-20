import {Easing, interpolate, spring, useVideoConfig} from 'remotion';
import type {SpeedRaceViz} from '../../schema';
import {relativeProgress} from '../../scenes/EducationalShared';
import {TOKENS} from '../../tokens';
import {FieldCard} from '../FieldCard';
import {FieldChip} from '../FieldChip';
import {PlayerDot} from '../PlayerDot';

const laneCenters = [296, 592] as const;

export const SpeedRace = ({viz, frame, duration}: {viz: SpeedRaceViz; frame: number; duration: number}) => {
  const {fps} = useVideoConfig();
  const ph = (from: number, to: number) => relativeProgress(frame, duration, from, to);
  const distance = viz.distanceYd ?? 40;
  const pyOf = (yards: number) => 880 - yards / distance * 760;
  const stripReveal = Easing.out(Easing.cubic)(ph(.04, .14));
  const raceProgress = ph(.16, .68);
  const winnerTime = Math.min(...viz.runners.map((runner) => runner.time));
  const simT = raceProgress * winnerTime;
  const gap = ph(.74, .88);
  const timeResolve = ph(.74, .82);
  const flashProgress = ph(.68, .74);
  const finishOpacity = flashProgress === 0 ? .6 * stripReveal : interpolate(flashProgress, [0, .5, 1], [.6, 1, .8]);
  const notePop = spring({frame: Math.max(0, frame - Math.round(duration * .74)), fps, config: {damping: 13, stiffness: 170, mass: .8}});
  const pulseFrame = frame - Math.round(duration * .68);
  const winnerPulse = interpolate(pulseFrame, [0, 6, 12], [0, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const winners = viz.runners.map((runner) => runner.time === winnerTime);
  const singleWinnerIndex = winners.filter(Boolean).length === 1 ? winners.findIndex(Boolean) : -1;
  const noteX = singleWinnerIndex === 0 ? 650 : singleWinnerIndex === 1 ? 238 : 444;
  const ticks = Array.from({length: Math.floor(distance / 5) + 1}, (_, index) => index * 5);

  return (
    <FieldCard label={viz.label} labelReveal={ph(0, .10)}>
      <svg width={888} height={1000} viewBox="0 0 888 1000" style={{position: 'absolute', inset: 0, opacity: stripReveal}}>
        {ticks.map((yard) => (
          <g key={yard}>
            <line x1={28} x2={860} y1={pyOf(yard)} y2={pyOf(yard)} stroke={TOKENS.color.bone} strokeWidth={yard === 0 ? 3 : 2} opacity={yard === 0 ? .5 : .14} />
            {(yard === 0 || yard % 10 === 0) ? (
              <text x={40} y={pyOf(yard) - 10} fill={TOKENS.color.bone} opacity={.3} fontFamily={TOKENS.font.mono} fontSize={22} fontWeight={700}>{yard}</text>
            ) : null}
          </g>
        ))}
        <line x1={444} x2={444} y1={120} y2={880} stroke={TOKENS.color.bone} strokeWidth={2} opacity={.16} />
        <line x1={28} x2={860} y1={120} y2={120} stroke={TOKENS.color.pending} strokeWidth={5} opacity={finishOpacity} />
        {viz.runners.map((runner, index) => {
          const traveled = Math.min(simT, runner.time) / runner.time * distance;
          const y = pyOf(traveled);
          const isWinner = winners[index];
          return (
            <line
              key={`trail-${runner.name}`}
              x1={laneCenters[index]}
              x2={laneCenters[index]}
              y1={880}
              y2={y}
              stroke={isWinner || runner.tone === 'accent' ? TOKENS.color.pending : TOKENS.color.bone}
              strokeWidth={2}
              opacity={.3}
            />
          );
        })}
      </svg>

      {viz.runners.map((runner, index) => {
        const traveled = Math.min(simT, runner.time) / runner.time * distance;
        const y = pyOf(traveled);
        const isWinner = winners[index];
        const crossed = simT >= runner.time;
        const loserOpacity = isWinner ? 1 : interpolate(gap, [0, 1], [1, .3]);
        const pop = spring({frame: Math.max(0, frame - Math.round(duration * .08) - index * 3), fps, config: {damping: 13, stiffness: 170, mass: .8}});
        const clockColor = isWinner && crossed ? TOKENS.color.pending : !isWinner && gap > .35 ? TOKENS.color.miss : TOKENS.color.bone;
        const clockX = laneCenters[index] + (index === 0 ? -112 : 112);
        const displayedTime = isWinner
          ? Math.min(simT, runner.time)
          : interpolate(timeResolve, [0, 1], [Math.min(simT, runner.time), runner.time]);
        return (
          <div key={runner.name} style={{position: 'absolute', inset: 0, opacity: loserOpacity}}>
            <PlayerDot
              cx={laneCenters[index]}
              cy={y}
              label={runner.label}
              team="offense"
              tone={isWinner || runner.tone === 'accent' ? 'accent' : 'bone'}
              hero={isWinner}
              pop={pop}
              pulse={isWinner ? winnerPulse : 0}
            />
            <div style={{position: 'absolute', left: clockX, top: y, zIndex: 14, minWidth: 104, padding: '9px 12px', border: `3px solid ${clockColor}`, borderRadius: 10, background: 'rgba(13,15,20,.9)', color: clockColor, fontFamily: TOKENS.font.mono, fontSize: 26, fontWeight: 800, lineHeight: 1, textAlign: 'center', transform: 'translate(-50%, -50%)', boxShadow: isWinner && crossed ? `0 0 22px ${TOKENS.color.pendingSoft}` : undefined}}>
              {displayedTime.toFixed(2)}
            </div>
            <div style={{position: 'absolute', left: laneCenters[index], top: 925, padding: '7px 12px', border: `2px solid ${isWinner || runner.tone === 'accent' ? TOKENS.color.pending : TOKENS.color.bone}`, borderRadius: 8, background: 'rgba(13,15,20,.88)', color: isWinner || runner.tone === 'accent' ? TOKENS.color.pending : TOKENS.color.bone, fontFamily: TOKENS.font.mono, fontSize: 17, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', whiteSpace: 'nowrap', opacity: pop, transform: 'translate(-50%, -50%)'}}>
              {runner.name}
            </div>
          </div>
        );
      })}

      {viz.note ? <FieldChip x={noteX} y={250} text={viz.note} tone="accent" pop={notePop} big /> : null}
    </FieldCard>
  );
};
