import {useCurrentFrame} from 'remotion';
import {FlipClock} from '../components/FlipClock';
import {Ledger} from '../components/Ledger';
import {PredictionCard} from '../components/PredictionCard';
import {TOKENS} from '../tokens';
import {SceneField} from './shared';

export const HookScene = ({frameOverride}: {frameOverride?: number}) => {
  const currentFrame = useCurrentFrame();
  const frame = frameOverride ?? currentFrame;
  return (
    <SceneField>
      <div style={{position: 'absolute', top: 104, left: 96}}><Ledger compact /></div>
      <div style={{position: 'absolute', left: 130, top: 570, transform: 'rotate(-5deg)'}}>
        <PredictionCard
          title="THREE CALLS. ONE LEGEND ENDS."
          date="AUG 02 2026"
          callId="CALL 052"
          confidence={72}
          compact
          width={820}
          rotate={-2}
          animationOffset={6}
          frameOverride={frame}
        />
      </div>
      <div style={{position: 'absolute', top: 742, left: 0, right: 0}}><FlipClock frameOverride={frame} /></div>
      <div style={{position: 'absolute', top: 988, left: 96, right: 96, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div style={{fontFamily: TOKENS.font.mono, fontSize: 24, fontWeight: 600, color: TOKENS.color.pending, letterSpacing: '.18em'}}>SUMMERSLAM / 2026</div>
        <div style={{height: 3, width: 390, background: TOKENS.color.boneHairline}} />
        <div style={{fontFamily: TOKENS.font.mono, fontSize: 24, fontWeight: 600, color: TOKENS.color.bone}}>EP. 052</div>
      </div>
      <div style={{position: 'absolute', top: 1140, left: 96, right: 96, fontFamily: TOKENS.font.display, fontSize: 82, lineHeight: .92, letterSpacing: '-.05em', transform: `translateX(${frame < 3 ? (3-frame)*10 : 0}px) scaleX(1.07)`, transformOrigin: 'left'}}>
        THREE CALLS.<br/><span style={{color: TOKENS.color.pending}}>DATED. GRADED.</span>
      </div>
    </SceneField>
  );
};
