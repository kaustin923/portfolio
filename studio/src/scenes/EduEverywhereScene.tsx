import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {TOKENS} from '../tokens';
import {EduMasthead, EduScene, FactCard, Waveform, relativeProgress, typed} from './EducationalShared';

const cardTransform = (progress: number, fromRight = false, rotate = 0) =>
  `translateX(${interpolate(progress,[0,1],[fromRight ? 1060 : -1060,0])}px) rotate(${interpolate(progress,[0,1],[fromRight ? 5 : -5,rotate])}deg)`;

export const EduEverywhereScene = ({duration}: {duration: number}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const one = spring({frame: frame - duration * .02, fps, config: {damping: 13, stiffness: 175, mass: .78}});
  const two = spring({frame: frame - duration * .28, fps, config: {damping: 13, stiffness: 175, mass: .78}});
  const three = spring({frame: frame - duration * .53, fps, config: {damping: 13, stiffness: 175, mass: .78}});
  const typeOne = relativeProgress(frame, duration, .14, .44);
  const flip = relativeProgress(frame, duration, .4, .64);
  const record = relativeProgress(frame, duration, .62, .95);
  return (
    <EduScene>
      <EduMasthead section="05 / WORKS ANYWHERE" />
      <div style={{position: 'absolute', top: 330, left: 96, right: 96, fontFamily: TOKENS.font.display, fontSize: 65, lineHeight: .92, letterSpacing: '-.045em'}}>OFFLINE MEANS<br/><span style={{color: TOKENS.color.pending}}>EVERYWHERE.</span></div>
      <div style={{position: 'absolute', left: 96, right: 96, top: 515}}>
        <FactCard number="1" label="SUBWAY / LIVE CAPTIONS" transform={cardTransform(one,false,-1)}>
          <svg viewBox="0 0 820 210" width="820" height="210" style={{position: 'absolute', left: 0, bottom: 0}}>
            <path d="M0 210V142Q100 28 205 142V210M615 210V142Q720 28 820 142V210" fill={TOKENS.color.ink} opacity=".12" />
            <rect x="250" y="64" width="320" height="130" rx="32" fill={TOKENS.color.ink} />
            <rect x="285" y="90" width="75" height="48" fill={TOKENS.color.bone} opacity=".7" /><rect x="460" y="90" width="75" height="48" fill={TOKENS.color.bone} opacity=".7" />
            <circle cx="320" cy="190" r="22" fill={TOKENS.color.ink} /><circle cx="500" cy="190" r="22" fill={TOKENS.color.ink} />
          </svg>
          <div style={{position: 'absolute', left: 48, right: 48, bottom: 22, padding: '12px 18px', background: TOKENS.color.pending, color: TOKENS.color.ink, fontFamily: TOKENS.font.mono, fontSize: 20, fontWeight: 700, letterSpacing: '.06em'}}>{typed('NEXT STOP: CANAL STREET', typeOne)}<span style={{opacity: frame % 18 < 10 ? 1 : 0}}>_</span></div>
        </FactCard>
        <div style={{height: 24}} />
        <FactCard number="2" label="PLANE / TRANSLATION" transform={cardTransform(two,true,1)}>
          <div style={{position: 'absolute', left: 62, top: 86, width: 170, height: 170, borderRadius: 90, border: `14px solid ${TOKENS.color.ink}`, overflow: 'hidden', boxSizing: 'border-box'}}>
            <div style={{position: 'absolute', left: -20, right: -20, top: 80, height: 50, background: TOKENS.color.pending, transform: 'rotate(-12deg)'}} />
            <div style={{position: 'absolute', left: -40, right: -40, top: 0, bottom: 0, background: `linear-gradient(155deg, transparent 45%, rgba(13,15,20,.14) 46% 55%, transparent 56%)`}} />
          </div>
          <div style={{position: 'absolute', right: 48, top: 94, display: 'flex', alignItems: 'center', gap: 18}}>
            <div style={{width: 120, height: 90, borderRadius: 22, background: TOKENS.color.ink, color: TOKENS.color.bone, display: 'grid', placeItems: 'center', fontFamily: TOKENS.font.display, fontSize: 42}}>EN</div>
            <div style={{fontFamily: TOKENS.font.display, fontSize: 50, color: TOKENS.color.pending, transform: `scaleX(${interpolate(flip,[0,.5,1],[1,.2,1])})`}}>→</div>
            <div style={{width: 120, height: 90, borderRadius: 22, border: `4px solid ${TOKENS.color.pending}`, color: TOKENS.color.ink, display: 'grid', placeItems: 'center', fontFamily: TOKENS.font.display, fontSize: 42, transform: `scaleX(${interpolate(flip,[0,.5,1],[.2,1,1])})`}}>JP</div>
          </div>
        </FactCard>
        <div style={{height: 24}} />
        <FactCard number="3" label="VOICE NOTE / ZERO SIGNAL" transform={cardTransform(three,false,-1)}>
          <div style={{position: 'absolute', left: 46, right: 46, top: 88, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: TOKENS.font.mono, fontSize: 20, fontWeight: 700}}><span>NO SERVICE</span><span style={{color: TOKENS.color.miss}}>××××</span></div>
          <div style={{position: 'absolute', left: 42, right: 42, top: 136, height: 120, overflow: 'hidden'}}><Waveform progress={record} color={TOKENS.color.ink} /></div>
          <div style={{position: 'absolute', right: 47, bottom: 30, width: 18, height: 18, borderRadius: 9, background: TOKENS.color.miss, boxShadow: `0 0 0 ${interpolate(record,[0,1],[0,10])}px rgba(229,72,77,.15)`}} />
        </FactCard>
      </div>
    </EduScene>
  );
};
