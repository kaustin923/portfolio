import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {TOKENS} from '../tokens';
import {EduMasthead, EduScene, PhoneFrame, Waveform, relativeProgress, typed} from './EducationalShared';

const SignalIcons = ({cut}: {cut: number}) => (
  <svg viewBox="0 0 360 100" width="360" height="100">
    <g fill="none" stroke={TOKENS.color.bone} strokeWidth="8" strokeLinecap="round">
      <path d="M30 48c35-32 80-32 115 0M52 69c23-20 48-20 71 0M82 87h1" />
      <path d="M230 82V68M251 82V54M272 82V39M293 82V23" />
    </g>
    <g stroke={TOKENS.color.pending} strokeWidth="11" strokeLinecap="round" opacity={cut}>
      <path d="M15 15 150 92" />
      <path d="M214 15 317 92" />
    </g>
  </svg>
);

export const EduHookScene = ({duration, frameOverride}: {duration: number; frameOverride?: number}) => {
  const currentFrame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const frame = frameOverride ?? currentFrame;
  const toggle = spring({frame: frame - duration * .1, fps, config: {damping: 13, stiffness: 190, mass: .7}});
  const glow = relativeProgress(frame, duration, .08, .2);
  const wave = relativeProgress(frame, duration, .2, .54);
  const text = relativeProgress(frame, duration, .35, .92);
  return (
    <EduScene>
      <EduMasthead section="01 / AIRPLANE MODE" />
      <div style={{position: 'absolute', left: 266, top: 355}}>
        <PhoneFrame width={548} height={940} glow={glow > .35}>
          <div style={{position: 'absolute', left: 50, right: 50, top: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
            <div style={{fontFamily: TOKENS.font.mono, color: TOKENS.color.bone, fontSize: 22, fontWeight: 700, letterSpacing: '.08em'}}>AIRPLANE MODE</div>
            <div style={{width: 104, height: 56, padding: 6, boxSizing: 'border-box', borderRadius: 30, background: toggle > .5 ? TOKENS.color.pending : 'rgba(242,237,228,.2)', boxShadow: `0 0 ${28 * glow}px ${TOKENS.color.pendingSoft}`}}>
              <div style={{width: 44, height: 44, borderRadius: 22, background: TOKENS.color.bone, transform: `translateX(${interpolate(toggle, [0,1], [0,48])}px)`, display: 'grid', placeItems: 'center'}}>
                <svg viewBox="0 0 36 36" width="27" height="27"><path d="m4 19 12 2-4 10 4 1 6-10 9 2 2-3-10-6 1-10-4-1-4 9-9-3Z" fill={TOKENS.color.ink}/></svg>
              </div>
            </div>
          </div>
          <div style={{position: 'absolute', left: 92, top: 164, opacity: interpolate(toggle,[0,1],[.5,1])}}><SignalIcons cut={glow} /></div>
          <div style={{position: 'absolute', left: 46, right: 46, top: 302, height: 250, overflow: 'hidden', borderTop: `2px solid ${TOKENS.color.boneHairline}`, borderBottom: `2px solid ${TOKENS.color.boneHairline}`}}>
            <div style={{width: 480, height: 180, marginTop: 35, transform: `translateX(${-((frame * 4) % 52)}px)`}}><Waveform progress={wave} /></div>
            <div style={{position: 'absolute', right: 10, top: 14, width: 12, height: 12, borderRadius: 6, background: TOKENS.color.hit, boxShadow: `0 0 12px ${TOKENS.color.hit}`}} />
            <div style={{position: 'absolute', right: 32, top: 8, fontFamily: TOKENS.font.mono, fontSize: 18, color: TOKENS.color.boneMuted}}>LIVE</div>
          </div>
          <div style={{position: 'absolute', left: 48, right: 48, top: 610}}>
            <div style={{fontFamily: TOKENS.font.mono, fontSize: 19, color: TOKENS.color.pending, letterSpacing: '.14em', marginBottom: 22}}>ON-DEVICE TRANSCRIPT</div>
            <div style={{minHeight: 150, fontFamily: TOKENS.font.display, color: TOKENS.color.bone, fontSize: 50, lineHeight: .98, letterSpacing: '-.035em'}}>
              {typed('EVERY WORD\nYOU SAY', text).split('\n').map((line, index) => <div key={index}>{line || '\u00a0'}</div>)}
              <span style={{display: 'inline-block', width: 5, height: 48, marginLeft: 7, background: TOKENS.color.pending, opacity: frame % 20 < 12 ? 1 : 0}} />
            </div>
          </div>
          <div style={{position: 'absolute', left: 48, right: 48, bottom: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: TOKENS.font.mono, color: TOKENS.color.boneMuted, fontSize: 18, letterSpacing: '.09em'}}>
            <span>NETWORK / OFF</span><span style={{color: TOKENS.color.hit}}>TRANSCRIPTION / ON</span>
          </div>
        </PhoneFrame>
      </div>
    </EduScene>
  );
};
