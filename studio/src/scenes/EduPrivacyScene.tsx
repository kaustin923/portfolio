import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {TOKENS} from '../tokens';
import {CloudIcon, EduMasthead, EduScene, PhoneFrame, Waveform, relativeProgress, typed} from './EducationalShared';

const Lock = ({closed}: {closed: number}) => (
  <svg viewBox="0 0 170 200" width="170" height="200">
    <path d={`M48 ${82-interpolate(closed,[0,1],[28,0])}V61c0-48 74-48 74 0v30`} fill="none" stroke={TOKENS.color.pending} strokeWidth="15" strokeLinecap="round" />
    <rect x="22" y="82" width="126" height="98" rx="18" fill={TOKENS.color.pending} />
    <circle cx="85" cy="125" r="13" fill={TOKENS.color.ink} />
    <path d="M85 132v25" stroke={TOKENS.color.ink} strokeWidth="10" strokeLinecap="round" />
  </svg>
);

export const EduPrivacyScene = ({duration}: {duration: number}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const flow = relativeProgress(frame, duration, .04, .45);
  const convert = relativeProgress(frame, duration, .24, .58);
  const sever = relativeProgress(frame, duration, .5, .66);
  const lock = spring({frame: frame - duration * .57, fps, config: {damping: 12, stiffness: 210, mass: .65}});
  const cloudMute = interpolate(sever, [0,1], [1,.2]);
  return (
    <EduScene>
      <EduMasthead section="04 / PRIVACY SHIFT" />
      <div style={{position: 'absolute', top: 330, left: 96, right: 96, fontFamily: TOKENS.font.display, fontSize: 61, lineHeight: .92, letterSpacing: '-.045em'}}>VOICE BECOMES TEXT.<br/><span style={{color: TOKENS.color.pending}}>WITHOUT LEAVING.</span></div>
      <div style={{position: 'absolute', top: 565, left: 324}}>
        <PhoneFrame width={432} height={720} glow={lock > .3}>
          <div style={{position: 'absolute', left: 42, right: 42, top: 118, height: 170, overflow: 'hidden'}}><Waveform progress={flow} /></div>
          <div style={{position: 'absolute', left: 46, right: 46, top: 342, paddingTop: 28, borderTop: `3px solid ${TOKENS.color.pending}`}}>
            <div style={{fontFamily: TOKENS.font.mono, color: TOKENS.color.pending, fontSize: 19, fontWeight: 700, letterSpacing: '.14em'}}>LOCAL TRANSCRIPT</div>
            <div style={{marginTop: 26, minHeight: 142, fontFamily: TOKENS.font.display, color: TOKENS.color.bone, fontSize: 44, lineHeight: .98}}>{typed('THE RECORDING\nSTAYS HERE', convert).split('\n').map((line,index) => <div key={index}>{line || '\u00a0'}</div>)}</div>
          </div>
          <div style={{position: 'absolute', left: 46, right: 46, bottom: 55, display: 'flex', justifyContent: 'space-between', fontFamily: TOKENS.font.mono, fontSize: 16, color: TOKENS.color.boneMuted}}><span>AUDIO / PRIVATE</span><span style={{color: TOKENS.color.hit}}>UPLOAD / 0 KB</span></div>
        </PhoneFrame>
      </div>
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
        <path d="M80 780 C170 730 250 790 332 780" fill="none" stroke={TOKENS.color.pending} strokeWidth="7" strokeDasharray="10 15" pathLength="1" strokeDashoffset={1-flow} />
        <path d="m306 760 29 20-29 20" fill="none" stroke={TOKENS.color.pending} strokeWidth="7" opacity={flow} />
        <path d="M754 710 C846 658 882 590 932 520" fill="none" stroke={TOKENS.color.boneMuted} strokeWidth="6" strokeDasharray="12 16" pathLength="1" strokeDashoffset={1-flow} opacity={1-sever*.76} />
        <path d="m911 529 24-13-2 28" fill="none" stroke={TOKENS.color.boneMuted} strokeWidth="6" opacity={1-sever} />
        <g opacity={sever} stroke={TOKENS.color.pending} strokeWidth="13" strokeLinecap="round">
          <path d="m814 618 58 57" /><path d="m872 618-58 57" />
        </g>
      </svg>
      <div style={{position: 'absolute', right: 42, top: 400, opacity: cloudMute, transform: `scale(${.82-sever*.08})`}}><CloudIcon muted={sever > .4} /></div>
      <div style={{position: 'absolute', right: 216, top: 1015, transform: `translateY(${interpolate(lock,[0,1],[-70,0])}px) scale(${.72 + lock * .12})`, opacity: lock}}><Lock closed={lock} /></div>
      <div style={{position: 'absolute', left: 80, top: 1020, width: 220, fontFamily: TOKENS.font.mono, fontSize: 20, color: TOKENS.color.boneMuted, lineHeight: 1.45, letterSpacing: '.08em'}}>SOUND IN<br/><span style={{color: TOKENS.color.pending}}>TEXT OUT</span></div>
      <div style={{position: 'absolute', left: 96, right: 96, top: 1340, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: TOKENS.font.mono, fontSize: 20, color: TOKENS.color.boneMuted, letterSpacing: '.12em'}}><span>ON THE CHIP</span><span style={{height: 3, flex: 1, margin: '0 24px', background: TOKENS.color.boneHairline}}/><span style={{color: TOKENS.color.hit}}>IN YOUR HAND</span></div>
    </EduScene>
  );
};
