import {interpolate, useCurrentFrame} from 'remotion';
import {HandDrawnCircle} from '../components/HandDrawnCircle';
import {PredictionCard} from '../components/PredictionCard';
import {ScreenShake} from '../components/ScreenShake';
import {WireframeDraw} from '../components/WireframeDraw';
import {TOKENS} from '../tokens';
import {callCardFrame, longShotImpactFrame} from './beats';
import {Kicker, SceneField} from './shared';

export const CallThreeScene = ({duration}: {duration: number}) => {
  const frame = useCurrentFrame();
  const cardFrame = callCardFrame(duration);
  const impact = longShotImpactFrame(duration);
  const cageX = interpolate(frame, [cardFrame - 10, cardFrame + 10], [0, -1180], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const bar = interpolate(frame, [26, 52], [0, 100], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <ScreenShake impactFrame={impact}>
      <SceneField>
        <Kicker>CALL THREE / LONG SHOT</Kicker>
        <div style={{position: 'absolute', top: 214, left: 96, right: 96, fontFamily: TOKENS.font.display, fontSize: 80, lineHeight: .91, letterSpacing: '-.045em', transform: 'scaleX(1.07)', transformOrigin: 'left'}}>INSIDE THE CELL.<br/><span style={{color: TOKENS.color.pending}}>WE TAKE THE SHOT.</span></div>
        <div style={{position: 'absolute', top: 420, left: 100, transform: `translateX(${cageX}px)`}}><WireframeDraw delay={3} /></div>
        <div style={{position: 'absolute', top: 1040, left: 96, width: 888}}>
          <div style={{display: 'flex', justifyContent: 'space-between', fontFamily: TOKENS.font.mono, fontSize: 22, fontWeight: 600, color: TOKENS.color.boneMuted, letterSpacing: '.12em'}}>
            <span>LESNAR PIN LOSSES IN CELL</span>
            <span>HELL IN A CELL / LOCKED</span>
          </div>
          <div style={{marginTop: 16, height: 66, border: `3px solid ${TOKENS.color.bone}`, position: 'relative'}}>
            <div style={{height: '100%', width: `${bar}%`, background: TOKENS.color.miss}} />
            <div style={{position: 'absolute', right: 16, top: 8, fontFamily: TOKENS.font.mono, fontSize: 38, fontWeight: 600}}>1 IN 9</div>
          </div>
        </div>
        <div style={{position: 'absolute', top: 674, left: 96}}>
          <PredictionCard title="OBA FEMI PINS BROCK LESNAR" date="AUG 02 2026" callId="CALL 052 / 3" confidence={28} variant="longshot" delay={cardFrame} />
        </div>
        <div style={{position: 'absolute', top: 888, left: 694}}><HandDrawnCircle delay={impact + 4} width={270} height={132} /></div>
      </SceneField>
    </ScreenShake>
  );
};
