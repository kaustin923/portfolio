import {interpolate, useCurrentFrame} from 'remotion';
import {TOKENS} from '../tokens';
import {CloudIcon, EduMasthead, EduScene, PhoneFrame, relativeProgress} from './EducationalShared';

export const EduCloudScene = ({duration}: {duration: number}) => {
  const frame = useCurrentFrame();
  const arrive = relativeProgress(frame, duration, 0, .18);
  const tether = relativeProgress(frame, duration, .16, .72);
  const pulse = .55 + Math.sin(frame * .22) * .25;
  return (
    <EduScene>
      <EduMasthead section="02 / THE OLD WAY" />
      <div style={{position: 'absolute', top: 330, left: 96, right: 96, fontFamily: TOKENS.font.display, fontSize: 66, lineHeight: .92, letterSpacing: '-.045em'}}>
        SPEECH AI LIVED<br/><span style={{color: TOKENS.color.pending}}>SOMEWHERE ELSE.</span>
      </div>
      <div style={{position: 'absolute', top: 520, left: 192, width: 696, height: 520, opacity: arrive, transform: `translateY(${interpolate(arrive,[0,1],[-90,0])}px)`}}>
        <div style={{position: 'absolute', top: -92, left: 238}}><CloudIcon /></div>
        <div style={{position: 'absolute', inset: '32px 0 0', padding: 30, border: `4px solid ${TOKENS.color.bone}`, borderRadius: 18, background: 'rgba(242,237,228,.035)', boxShadow: '0 24px 0 rgba(0,0,0,.22)'}}>
          {Array.from({length: 5}, (_, index) => (
            <div key={index} style={{height: 72, marginBottom: 18, border: `3px solid ${TOKENS.color.boneHairline}`, background: index === Math.floor(frame / 7) % 5 ? `rgba(217,164,65,${pulse})` : 'rgba(242,237,228,.045)', display: 'flex', alignItems: 'center', padding: '0 22px', boxSizing: 'border-box'}}>
              <div style={{display: 'flex', gap: 9}}>{[0,1,2].map((dot) => <span key={dot} style={{width: 12, height: 12, borderRadius: 6, background: dot === 0 ? TOKENS.color.pending : TOKENS.color.boneMuted}} />)}</div>
              <div style={{marginLeft: 26, height: 8, flex: 1, background: `repeating-linear-gradient(90deg, ${TOKENS.color.boneMuted} 0 28px, transparent 28px 40px)`}} />
            </div>
          ))}
          <div style={{position: 'absolute', left: 0, right: 0, bottom: -62, textAlign: 'center', fontFamily: TOKENS.font.mono, color: TOKENS.color.pending, fontSize: 24, fontWeight: 700, letterSpacing: '.16em'}}>SPEECH MODEL / CLOUD</div>
        </div>
      </div>
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
        <path d="M540 1092 C540 1200 750 1190 750 1330" fill="none" stroke={TOKENS.color.pending} strokeWidth="7" strokeDasharray="12 18" pathLength="1" strokeDashoffset={1-tether} />
        <path d="m732 1308 18 26 18-26" fill="none" stroke={TOKENS.color.pending} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" opacity={tether} />
      </svg>
      <div style={{position: 'absolute', left: 650, top: 1270, transform: `scale(${.42 + arrive * .12})`}}>
        <PhoneFrame width={300} height={470}>
          <div style={{position: 'absolute', inset: 80, display: 'grid', placeItems: 'center'}}>
            <div style={{fontFamily: TOKENS.font.mono, color: TOKENS.color.boneMuted, textAlign: 'center', fontSize: 25, lineHeight: 1.35}}>SEND AUDIO<br/>WAIT<br/>GET TEXT</div>
          </div>
        </PhoneFrame>
      </div>
      <div style={{position: 'absolute', left: 98, top: 1292, width: 440, fontFamily: TOKENS.font.mono, color: TOKENS.color.boneMuted, fontSize: 22, lineHeight: 1.5, letterSpacing: '.07em'}}>THE PHONE WAS<br/>JUST A TERMINAL.<br/><span style={{color: TOKENS.color.pending}}>THE MODEL WAS THE GIANT.</span></div>
    </EduScene>
  );
};
