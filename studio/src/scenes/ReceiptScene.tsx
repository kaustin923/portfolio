import {useCurrentFrame} from 'remotion';
import {Ledger} from '../components/Ledger';
import {PredictionCard} from '../components/PredictionCard';
import {ScreenShake} from '../components/ScreenShake';
import {Stamp} from '../components/Stamp';
import {TOKENS} from '../tokens';
import {receiptStampFrame, receiptTickFrame} from './beats';
import {Kicker, SceneField} from './shared';

export const ReceiptScene = ({duration}: {duration: number}) => {
  const frame = useCurrentFrame();
  const stampFrame = receiptStampFrame(duration);
  const tickFrame = receiptTickFrame(duration);
  return (
    <ScreenShake impactFrame={stampFrame + 4}>
      <SceneField>
        <Kicker>THE RECEIPT / CALL 049</Kicker>
        <div style={{position: 'absolute', top: 214, left: 96, right: 96, fontFamily: TOKENS.font.display, fontSize: 86, lineHeight: .95, letterSpacing: '-.04em', transform: 'scaleX(1.07)', transformOrigin: 'left'}}>
          WE GRADE<br/>OURSELVES FIRST.
        </div>
        <div style={{position: 'absolute', top: 500, left: 96}}>
          <PredictionCard title="SAMI ZAYN RETAINS ALL SUMMER" date="JUN 30 2026" callId="CALL 049" confidence={64} delay={5} />
        </div>
        <div style={{position: 'absolute', top: 835, left: 330}}><Stamp status="MISS" landFrame={stampFrame} /></div>
        <div style={{position: 'absolute', top: 1210, left: 96, right: 96, padding: '34px 38px', border: `3px solid ${TOKENS.color.boneHairline}`, background: 'rgba(13,15,20,.82)'}}>
          <div style={{fontFamily: TOKENS.font.mono, fontSize: 22, color: TOKENS.color.boneMuted, letterSpacing: '.14em', marginBottom: 24}}>PUBLIC LEDGER / AUTO-TICK</div>
          <Ledger fromRecord="31-9" toRecord="31-10" tickFrame={tickFrame} compact />
          <div style={{height: 3, marginTop: 26, background: `linear-gradient(90deg, ${TOKENS.color.miss} 0 ${frame >= tickFrame ? 100 : 5}%, ${TOKENS.color.boneHairline} 5%)`}} />
        </div>
      </SceneField>
    </ScreenShake>
  );
};
