import {Easing, interpolate, interpolateColors, spring, useVideoConfig} from 'remotion';
import type {DepthFlowViz} from '../../schema';
import {relativeProgress, typed} from '../../scenes/EducationalShared';
import {TOKENS} from '../../tokens';
import {FieldCard} from '../FieldCard';
import {PlayerDot} from '../PlayerDot';
import {RouteArrow} from '../RouteArrow';

const streamPoints = [{x: 320, y: 350}, {x: 610, y: 430}, {x: 630, y: 610}, {x: 330, y: 680}];

export const DepthFlow = ({viz, frame, duration}: {viz: DepthFlowViz; frame: number; duration: number}) => {
  const {fps} = useVideoConfig();
  const ph = (from: number, to: number) => relativeProgress(frame, duration, from, to);
  const popAt = (startFrame: number) => spring({
    frame: Math.max(0, frame - startFrame),
    fps,
    config: {damping: 13, stiffness: 170, mass: .8},
  });
  const outPop = popAt(Math.round(duration * .04));
  const riserPop = popAt(Math.round(duration * .04) + 5);
  const departure = Easing.out(Easing.cubic)(ph(.18, .32));
  const promotion = Easing.inOut(Easing.cubic)(ph(.72, .86));
  const flowReveal = ph(.32, .40);
  const streamOpacity = flowReveal * (1 - ph(.72, .86));
  const countProgress = Easing.out(Easing.quad)(ph(.32, .72));
  const count = Math.round(viz.flow.to * countProgress).toLocaleString('en-US');
  const gonePop = popAt(Math.round(duration * .28));
  const outColor = interpolateColors(departure, [0, 1], [TOKENS.color.bone, TOKENS.color.miss]);
  const noteProgress = ph(.86, .98);
  const pulseFrame = frame - Math.round(duration * .86);
  const pulse = interpolate(pulseFrame, [0, 6, 12], [0, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const outOpacity = Math.min(interpolate(departure, [0, 1], [1, .4]), interpolate(promotion, [0, 1], [1, .15]));

  return (
    <FieldCard label={viz.label} labelReveal={ph(0, .10)}>
      <svg width={888} height={1000} viewBox="0 0 888 1000" style={{position: 'absolute', inset: 0}}>
        <RouteArrow
          pts={streamPoints}
          progress={streamOpacity}
          color={TOKENS.color.pending}
          width={8}
          glow
          dashed
          frame={frame}
        />
      </svg>

      <div style={{position: 'absolute', inset: 0, opacity: outPop * outOpacity, transform: `translateY(${promotion * 60}px)`}}>
        <PlayerDot cx={200} cy={330} label={viz.out.jersey} team="offense" tone={departure > .35 ? 'red' : 'bone'} pop={outPop} />
        <div style={{position: 'absolute', left: 280, top: 282, color: outColor, fontFamily: TOKENS.font.display, fontSize: 46, letterSpacing: '-.035em', lineHeight: 1, textTransform: 'uppercase'}}>
          {viz.out.name}
        </div>
        <div style={{position: 'absolute', left: 280, top: 344, minWidth: 370, padding: '14px 20px 12px', border: `2px solid ${TOKENS.color.boneHairline}`, borderRadius: 12, background: 'rgba(13,15,20,.88)'}}>
          <div style={{color: outColor, fontFamily: TOKENS.font.display, fontSize: 56, letterSpacing: '-.04em', lineHeight: .9}}>{viz.out.stat}</div>
          <div style={{marginTop: 7, color: TOKENS.color.boneMuted, fontFamily: TOKENS.font.mono, fontSize: 16, fontWeight: 700, letterSpacing: '.1em'}}>{viz.out.statLabel.toUpperCase()}</div>
          <div style={{position: 'absolute', left: 12, right: 12, top: '50%', height: 5, borderRadius: 4, background: TOKENS.color.miss, transform: `scaleX(${departure})`, transformOrigin: 'left center'}} />
        </div>
        <div style={{position: 'absolute', left: 658, top: 377, padding: '7px 12px', border: `2px solid ${TOKENS.color.miss}`, borderRadius: 8, background: 'rgba(13,15,20,.9)', color: TOKENS.color.miss, fontFamily: TOKENS.font.mono, fontSize: 17, fontWeight: 800, letterSpacing: '.1em', opacity: gonePop, transform: `scale(${.6 + gonePop * .4})`}}>
          GONE
        </div>
      </div>

      <div style={{position: 'absolute', inset: 0, opacity: riserPop, transform: `translateY(${-370 * promotion}px)`}}>
        <div style={{position: 'absolute', inset: 0, transform: `scale(${1 + countProgress * .15})`, transformOrigin: '200px 700px'}}>
          <PlayerDot cx={200} cy={700} label={viz.riser.jersey} team="offense" tone="accent" hero pop={riserPop} pulse={pulse} />
        </div>
        <div style={{position: 'absolute', left: 280, top: 674, color: TOKENS.color.pending, fontFamily: TOKENS.font.display, fontSize: 46, letterSpacing: '-.035em', lineHeight: 1, textTransform: 'uppercase'}}>
          {viz.riser.name}
        </div>
        <div style={{position: 'absolute', left: 300, top: 548, color: TOKENS.color.pending, fontFamily: TOKENS.font.display, fontSize: 92, letterSpacing: '-.055em', lineHeight: .9, textShadow: `0 0 26px ${TOKENS.color.pendingSoft}`}}>
          {count}
          <div style={{marginTop: 10, color: TOKENS.color.boneMuted, fontFamily: TOKENS.font.mono, fontSize: 18, fontWeight: 700, letterSpacing: '.1em', lineHeight: 1}}>{viz.flow.unit.toUpperCase()}</div>
        </div>
        {viz.riser.note ? (
          <div style={{position: 'absolute', left: 274, top: 724, zIndex: 5, minWidth: 230, padding: '6px', borderRadius: 6, background: 'rgba(13,15,20,.9)', color: TOKENS.color.pending, fontFamily: TOKENS.font.mono, fontSize: 20, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase'}}>
            {typed(viz.riser.note, noteProgress)}
          </div>
        ) : null}
      </div>
    </FieldCard>
  );
};
