import {interpolate, useCurrentFrame} from 'remotion';
import {FlipClock} from '../components/FlipClock';
import {TOKENS} from '../tokens';
import {EduMasthead, EduScene, PhoneFrame, relativeProgress} from './EducationalShared';

const ServerBlock = ({pulse}: {pulse: number}) => (
  <div style={{width: 430, height: 350, border: `4px solid ${TOKENS.color.bone}`, borderRadius: 18, background: TOKENS.color.ink, padding: 26, boxSizing: 'border-box', boxShadow: `0 0 ${30 + pulse * 20}px rgba(217,164,65,.18)`}}>
    {Array.from({length: 4}, (_, index) => <div key={index} style={{height: 54, marginBottom: 20, border: `3px solid ${TOKENS.color.boneHairline}`, background: index === Math.floor(pulse * 4) % 4 ? 'rgba(217,164,65,.52)' : 'rgba(242,237,228,.04)'}} />)}
  </div>
);

export const EduShrinkScene = ({duration}: {duration: number}) => {
  const frame = useCurrentFrame();
  const compress = relativeProgress(frame, duration, .1, .6);
  const settle = relativeProgress(frame, duration, .55, .72);
  const flipAt = Math.floor(duration * .54);
  const x = interpolate(compress, [0,.32,.65,1], [120,260,480,710]);
  const y = interpolate(compress, [0,.32,.65,1], [660,720,800,775]);
  const scale = interpolate(compress, [0,.32,.65,1], [1,.72,.43,.16]);
  return (
    <EduScene>
      <EduMasthead section="03 / MODEL COMPRESSION" />
      <div style={{position: 'absolute', top: 330, left: 96, right: 96, zIndex: 3, fontFamily: TOKENS.font.display, fontSize: 64, lineHeight: .92, letterSpacing: '-.045em'}}>SAME ABILITY.<br/><span style={{color: TOKENS.color.pending}}>A FRACTION OF THE SIZE.</span></div>
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style={{position: 'absolute', inset: 0}}>
        <path d="M330 665 C390 610 420 775 540 820 S610 905 690 905" fill="none" stroke={TOKENS.color.boneHairline} strokeWidth="4" strokeDasharray="14 18" />
        {[0,1,2].map((step) => <circle key={step} cx={420 + step * 118} cy={730 + step * 83} r={11} fill={compress > .25 + step * .24 ? TOKENS.color.pending : TOKENS.color.boneMuted} />)}
      </svg>
      <div style={{position: 'absolute', left: 580, top: 570}}>
        <PhoneFrame width={340} height={590} glow={settle > .1}>
          <div style={{position: 'absolute', left: 80, top: 170, width: 180, height: 180, border: `7px solid ${TOKENS.color.pending}`, boxSizing: 'border-box', display: 'grid', placeItems: 'center', boxShadow: `0 0 ${settle * 55}px rgba(217,164,65,.7), inset 0 0 ${settle * 38}px rgba(217,164,65,.3)`}}>
            <div style={{position: 'relative', zIndex: 4, fontFamily: TOKENS.font.mono, color: TOKENS.color.bone, fontSize: 22, fontWeight: 700, textAlign: 'center'}}>SPEECH<br/>AI</div>
          </div>
          {Array.from({length: 6}, (_, index) => <span key={index} style={{position: 'absolute', left: 64 + index * 42, top: 156, width: 4, height: 18, background: TOKENS.color.pending}} />)}
          <div style={{position: 'absolute', bottom: 72, left: 0, right: 0, fontFamily: TOKENS.font.mono, color: TOKENS.color.hit, fontSize: 18, textAlign: 'center', letterSpacing: '.1em'}}>RUNNING LOCALLY</div>
        </PhoneFrame>
      </div>
      <div style={{position: 'absolute', left: x, top: y, zIndex: 2, transform: `translate(-50%,-50%) scale(${scale})`, transformOrigin: 'center'}}><ServerBlock pulse={(frame % 30) / 30} /></div>
      <div style={{position: 'absolute', top: 1214, left: 96, right: 96}}>
        <div style={{fontFamily: TOKENS.font.mono, color: TOKENS.color.boneMuted, fontSize: 20, textAlign: 'center', letterSpacing: '.16em', marginBottom: 22}}>MODEL FOOTPRINT</div>
        {frame < flipAt ? <FlipClock label="GIGABYTES" compact /> : <FlipClock label="MEGABYTES" compact frameOverride={frame-flipAt} />}
        <div style={{marginTop: 20, height: 5, background: TOKENS.color.boneHairline}}><div style={{height: '100%', width: `${interpolate(compress,[0,1],[100,9])}%`, background: TOKENS.color.pending}} /></div>
      </div>
    </EduScene>
  );
};
