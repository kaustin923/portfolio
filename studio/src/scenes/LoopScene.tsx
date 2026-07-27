import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {FlipClock} from '../components/FlipClock';
import {Stamp} from '../components/Stamp';
import {TOKENS} from '../tokens';
import {Kicker, SceneField} from './shared';

const cards = [
  ['CALL 052 / 1', 'CODY — 72%'],
  ['CALL 052 / 2', 'ROLLINS — 61%'],
  ['CALL 052 / 3', 'OBA FEMI — 28%'],
];

export const LoopScene = ({duration}: {duration: number}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const clockStart = Math.floor(duration * .5);
  const clockProgress = spring({frame: frame - clockStart, fps, config: {damping: 14, mass: .9, stiffness: 160}});
  const stackY = interpolate(clockProgress, [0,1], [0,-720], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
  return (
    <SceneField>
      <Kicker>CLIP THIS / RECEIPTS LOCKED</Kicker>
      <div style={{position: 'absolute', top: 235, left: 96, right: 96, fontFamily: TOKENS.font.display, fontSize: 88, lineHeight: .92, letterSpacing: '-.045em', transform: 'scaleX(1.07)', transformOrigin: 'left'}}>EVERY CARD.<br/><span style={{color: TOKENS.color.pending}}>GRADED LIVE.</span></div>
      <div style={{position: 'absolute', top: 520, left: 96, width: 888, transform: `translateY(${stackY}px)`}}>
        {cards.map(([id,title], index) => {
          const progress = spring({frame: frame - index * 7, fps, config: {damping: 13, stiffness: 175, mass: .8}});
          return (
            <div key={id} style={{position: 'absolute', top: index * 210, left: index * 18, width: 852 - index * 36, height: 250, borderRadius: 22, background: TOKENS.color.bone, color: TOKENS.color.ink, padding: '34px 40px', boxSizing: 'border-box', border: index === 2 ? `4px solid ${TOKENS.color.pending}` : '2px solid rgba(13,15,20,.2)', boxShadow: '0 18px 0 rgba(0,0,0,.3)', transform: `translateX(${(1-progress) * (index % 2 ? 650 : -650)}px) rotate(${index * 2 - 2}deg)`}}>
              <div style={{fontFamily: TOKENS.font.mono, fontSize: 22, fontWeight: 600, letterSpacing: '.1em'}}>{id}</div>
              <div style={{fontFamily: TOKENS.font.display, fontSize: 56, marginTop: 34, transform: 'scaleX(1.06)', transformOrigin: 'left'}}>{title}</div>
              <div style={{position: 'absolute', bottom: 26, left: 40, right: 40, height: 20, background: `repeating-linear-gradient(90deg, ${TOKENS.color.ink} 0 4px, transparent 4px 11px)`}} />
            </div>
          );
        })}
        <div style={{position: 'absolute', top: 560, left: 200}}><Stamp status="PENDING" landFrame={34} /></div>
        <div style={{position: 'absolute', top: 752, left: 118, fontFamily: TOKENS.font.mono, fontSize: 42, fontWeight: 600, letterSpacing: '.1em', color: TOKENS.color.bone}}>GRADED AUG 2 — LIVE</div>
      </div>
      <div style={{position: 'absolute', top: interpolate(clockProgress,[0,1],[1960,750]), left: 0, right: 0}}><FlipClock frameOverride={Math.max(0, frame - clockStart)} /></div>
    </SceneField>
  );
};
