import {interpolate, useCurrentFrame} from 'remotion';
import {BarChart} from '../components/BarChart';
import {PredictionCard} from '../components/PredictionCard';
import {Stamp} from '../components/Stamp';
import {TOKENS} from '../tokens';
import {callCardFrame} from './beats';
import {Kicker, RuleLabel, SceneField} from './shared';

const data = [
  {label:'18',value:84,miss:true},{label:'19',value:69,miss:true},{label:'20',value:91,miss:true},
  {label:'21',value:62,miss:false},{label:'22',value:79,miss:true},{label:'23',value:88,miss:true},
  {label:'24',value:66,miss:true},{label:'25',value:73,miss:false},{label:'26',value:86,miss:true},
];

export const CallOneScene = ({duration}: {duration: number}) => {
  const frame = useCurrentFrame();
  const cardFrame = callCardFrame(duration);
  const chartY = interpolate(frame, [cardFrame - 8, cardFrame + 8], [0, -920], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <SceneField>
      <Kicker>CALL ONE / THE PATTERN</Kicker>
      <div style={{position: 'absolute', top: 222, left: 96}}>
        <RuleLabel>TITLE WON &lt;30 DAYS BEFORE SHOW</RuleLabel>
        <div style={{marginTop: 30, fontFamily: TOKENS.font.display, fontSize: 90, lineHeight: .9, letterSpacing: '-.05em', transform: 'scaleX(1.07)', transformOrigin: 'left'}}><span style={{color: TOKENS.color.miss}}>7 OF 9</span><br/>LOSE IT THERE.</div>
      </div>
      <div style={{position: 'absolute', top: 514, left: 96, transform: `translateY(${chartY}px)`}}><BarChart data={data} recolorFrame={22} /></div>
      <div style={{position: 'absolute', top: 700, left: 96}}>
        <PredictionCard title="CODY RHODES — NEW CHAMPION" date="AUG 02 2026" callId="CALL 052 / 1" confidence={72} delay={cardFrame} />
      </div>
      <div style={{position: 'absolute', top: 1134, left: 132}}><Stamp status="PENDING" landFrame={cardFrame + 22} small /></div>
    </SceneField>
  );
};
