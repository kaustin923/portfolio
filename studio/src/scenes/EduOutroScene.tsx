import {interpolate, useCurrentFrame} from 'remotion';
import {TOKENS} from '../tokens';
import {EduMasthead, EduScene, PhoneFrame, relativeProgress, typed} from './EducationalShared';

const apps = [
  {label: 'CC', angle: -80, radius: 300},
  {label: '文', angle: -20, radius: 310},
  {label: 'TXT', angle: 38, radius: 315},
  {label: '•••', angle: 100, radius: 300},
  {label: 'A', angle: 160, radius: 305},
  {label: '↔', angle: 220, radius: 310},
];

export const EduOutroScene = ({duration}: {duration: number}) => {
  const frame = useCurrentFrame();
  const phone = relativeProgress(frame, duration, 0, .18);
  const orbit = relativeProgress(frame, duration, .1, .52);
  const dim = relativeProgress(frame, duration, .48, .75);
  const ending = relativeProgress(frame, duration, .56, .95);
  const pulse = (frame % 45) / 45;
  return (
    <EduScene>
      <EduMasthead section="06 / THE NEW DEFAULT" />
      <div style={{position: 'absolute', top: 330, left: 96, right: 96, fontFamily: TOKENS.font.display, fontSize: 61, lineHeight: .92, letterSpacing: '-.045em'}}>A PRIVATE INTERPRETER.<br/><span style={{color: TOKENS.color.pending}}>IN YOUR POCKET.</span></div>
      <div style={{position: 'absolute', left: 540, top: 825, width: 0, height: 0}}>
        {apps.map((app,index) => {
          const angle = ((app.angle + frame * .22) * Math.PI) / 180;
          const radius = app.radius * orbit;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius * .64;
          return <div key={app.label+index} style={{position: 'absolute', left: x-45, top: y-45, width: 90, height: 90, borderRadius: 24, border: `3px solid ${TOKENS.color.bone}`, background: dim > .5 ? TOKENS.color.ink : (index % 2 ? TOKENS.color.pending : TOKENS.color.bone), color: dim > .5 ? TOKENS.color.boneMuted : TOKENS.color.ink, display: 'grid', placeItems: 'center', fontFamily: TOKENS.font.mono, fontSize: app.label.length > 2 ? 18 : 28, fontWeight: 800, opacity: orbit * interpolate(dim,[0,1],[1,.26]), transform: `rotate(${-app.angle * .12}deg) scale(${.6 + orbit * .4})`}}>{app.label}</div>;
        })}
      </div>
      <div style={{position: 'absolute', left: 360, top: 525, opacity: phone, transform: `translateY(${interpolate(phone,[0,1],[100,0])}px) scale(${.9+phone*.1})`}}>
        <PhoneFrame width={360} height={620} glow>
          <div style={{position: 'absolute', left: 0, right: 0, top: 150, display: 'grid', placeItems: 'center'}}>
            {[0,1,2].map((ring) => {
              const ringProgress = (pulse + ring / 3) % 1;
              return <div key={ring} style={{position: 'absolute', width: 150 + ringProgress * 160, height: 150 + ringProgress * 160, borderRadius: 200, border: `5px solid ${TOKENS.color.pending}`, opacity: 1-ringProgress, transform: `scale(${.75+ringProgress*.45})`}} />;
            })}
            <div style={{width: 156, height: 156, borderRadius: 82, background: TOKENS.color.pending, display: 'grid', placeItems: 'center', boxShadow: `0 0 38px ${TOKENS.color.pendingSoft}`}}>
              <svg viewBox="0 0 100 120" width="70" height="84"><rect x="28" y="5" width="44" height="72" rx="23" fill={TOKENS.color.ink}/><path d="M13 60v5c0 28 16 43 37 43s37-15 37-43v-5M50 108v12" fill="none" stroke={TOKENS.color.ink} strokeWidth="10" strokeLinecap="round"/></svg>
            </div>
          </div>
          <div style={{position: 'absolute', left: 36, right: 36, bottom: 70, textAlign: 'center', fontFamily: TOKENS.font.mono, fontSize: 18, color: TOKENS.color.boneMuted, letterSpacing: '.12em'}}>LISTEN / UNDERSTAND<br/><span style={{color: TOKENS.color.hit}}>NO NETWORK REQUIRED</span></div>
        </PhoneFrame>
      </div>
      <div style={{position: 'absolute', left: 96, right: 96, top: 1215, height: 190, borderTop: `3px solid ${TOKENS.color.boneHairline}`, borderBottom: `3px solid ${TOKENS.color.boneHairline}`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{fontFamily: TOKENS.font.display, color: TOKENS.color.bone, fontSize: 68, letterSpacing: '-.04em', textTransform: 'uppercase'}}>{typed("YOU'RE JUST EARLY", ending)}<span style={{display: 'inline-block', width: 7, height: 64, marginLeft: 10, verticalAlign: '-7px', background: TOKENS.color.pending, opacity: frame % 22 < 13 ? 1 : 0}} /></div>
      </div>
      <div style={{position: 'absolute', left: 96, right: 96, top: 1430, fontFamily: TOKENS.font.mono, fontSize: 19, color: TOKENS.color.boneMuted, textAlign: 'center', letterSpacing: '.16em', opacity: ending}}>THE NEXT WAVE WILL ASSUME THIS.</div>
    </EduScene>
  );
};
