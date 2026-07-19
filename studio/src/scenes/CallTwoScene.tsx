import {interpolate, useCurrentFrame} from 'remotion';
import {PredictionCard} from '../components/PredictionCard';
import {Stamp} from '../components/Stamp';
import {TimelineScrub} from '../components/TimelineScrub';
import {TOKENS} from '../tokens';
import {callCardFrame} from './beats';
import {Kicker, RuleLabel, SceneField} from './shared';

export const CallTwoScene = ({duration}: {duration: number}) => {
  const frame = useCurrentFrame();
  const cardFrame = callCardFrame(duration);
  const timelineX = interpolate(frame, [cardFrame - 10, cardFrame + 8], [0, -1180], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <SceneField>
      <Kicker>CALL TWO / STADIUM SERIES</Kicker>
      <div style={{position: 'absolute', top: 235, left: 96}}>
        <RuleLabel>REIGNS / ROLLINS</RuleLabel>
        <div style={{marginTop: 34, fontFamily: TOKENS.font.display, fontSize: 88, lineHeight: .91, letterSpacing: '-.045em', transform: 'scaleX(1.07)', transformOrigin: 'left'}}>MATCH FIVE.<br/><span style={{color: TOKENS.color.pending}}>RUBBER BOOKING.</span></div>
      </div>
      <div style={{position: 'absolute', top: 540, left: 96, transform: `translateX(${timelineX}px)`}}><TimelineScrub delay={5} /></div>
      <div style={{position: 'absolute', top: 718, left: 96}}>
        <PredictionCard title="ROLLINS WINS MATCH FIVE" date="AUG 02 2026" callId="CALL 052 / 2" confidence={61} delay={cardFrame} />
      </div>
      <div style={{position: 'absolute', top: 1148, left: 132}}><Stamp status="PENDING" landFrame={cardFrame + 20} small /></div>
    </SceneField>
  );
};
