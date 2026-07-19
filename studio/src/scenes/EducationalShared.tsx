import type {ReactNode} from 'react';
import {interpolate} from 'remotion';
import {TOKENS} from '../tokens';
import {SceneField} from './shared';

export const relativeProgress = (frame: number, duration: number, from: number, to: number) =>
  interpolate(frame, [duration * from, duration * to], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

export const typed = (text: string, progress: number) => text.slice(0, Math.floor(text.length * progress));

export const EduScene = ({children}: {children: ReactNode}) => <SceneField>{children}</SceneField>;

export const EduMasthead = ({section}: {section: string}) => (
  <>
    <div style={{position: 'absolute', top: 112, left: 96, right: 96, display: 'flex', alignItems: 'center', gap: 18}}>
      <div style={{width: 42, height: 8, background: TOKENS.color.pending}} />
      <div style={{fontFamily: TOKENS.font.mono, color: TOKENS.color.pending, fontSize: 22, fontWeight: 700, letterSpacing: '.17em'}}>{section}</div>
      <div style={{height: 2, flex: 1, background: TOKENS.color.boneHairline}} />
    </div>
    <div style={{position: 'absolute', top: 166, left: 96, right: 96, fontFamily: TOKENS.font.display, fontSize: 45, lineHeight: .94, letterSpacing: '-.035em', transform: 'scaleX(1.045)', transformOrigin: 'left'}}>
      YOUR PHONE LEARNED<br/><span style={{color: TOKENS.color.pending}}>TO LISTEN OFFLINE</span>
    </div>
  </>
);

export const PhoneFrame = ({
  children,
  width = 520,
  height = 880,
  glow = false,
  style,
}: {
  children?: ReactNode;
  width?: number;
  height?: number;
  glow?: boolean;
  style?: React.CSSProperties;
}) => (
  <div
    style={{
      width,
      height,
      position: 'relative',
      boxSizing: 'border-box',
      borderRadius: width * .105,
      border: `5px solid ${glow ? TOKENS.color.pending : TOKENS.color.bone}`,
      background: '#11151C',
      boxShadow: glow ? `0 0 44px rgba(217,164,65,.35), inset 0 0 30px rgba(217,164,65,.08)` : '0 28px 50px rgba(0,0,0,.38)',
      overflow: 'hidden',
      ...style,
    }}
  >
    <div style={{position: 'absolute', top: 14, left: '35%', right: '35%', height: 22, borderRadius: 14, background: TOKENS.color.ink, zIndex: 4}} />
    <div style={{position: 'absolute', left: '36%', right: '36%', bottom: 14, height: 6, borderRadius: 5, background: TOKENS.color.boneMuted, zIndex: 4}} />
    {children}
  </div>
);

export const FactCard = ({
  number,
  label,
  children,
  transform,
}: {
  number: string;
  label: string;
  children: ReactNode;
  transform?: string;
}) => (
  <div style={{height: 300, boxSizing: 'border-box', position: 'relative', overflow: 'hidden', borderRadius: TOKENS.radius.card, background: TOKENS.color.bone, color: TOKENS.color.ink, border: '2px solid rgba(13,15,20,.16)', boxShadow: '0 18px 0 rgba(0,0,0,.25)', padding: '30px 34px', transform}}>
    <div style={{display: 'flex', alignItems: 'center', gap: 16, position: 'relative', zIndex: 3}}>
      <span style={{display: 'grid', placeItems: 'center', width: 42, height: 42, background: TOKENS.color.pending, borderRadius: 21, fontFamily: TOKENS.font.mono, fontSize: 20, fontWeight: 700}}>{number}</span>
      <span style={{fontFamily: TOKENS.font.mono, fontSize: 21, fontWeight: 700, letterSpacing: '.13em'}}>{label}</span>
    </div>
    {children}
  </div>
);

export const Waveform = ({progress = 1, color = TOKENS.color.pending}: {progress?: number; color?: string}) => {
  const points = Array.from({length: 36}, (_, index) => {
    const x = 8 + index * 13;
    const amplitude = 10 + Math.abs(Math.sin(index * 1.73) * 55) + Math.abs(Math.cos(index * .61) * 20);
    return `${x},${90 - amplitude / 2} ${x},${90 + amplitude / 2}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 480 180" width="100%" height="100%" style={{overflow: 'visible'}}>
      <path d="M0 90H480" stroke={TOKENS.color.boneHairline} strokeWidth="2" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray="1 12" pathLength="100" strokeDashoffset={100 - progress * 100} />
    </svg>
  );
};

export const CloudIcon = ({muted = false}: {muted?: boolean}) => (
  <svg viewBox="0 0 220 130" width="220" height="130">
    <path d="M53 111h117c27 0 40-19 35-39-4-17-20-27-38-25C158 20 135 9 112 17 91 24 79 40 78 61 53 52 27 66 24 87c-2 14 10 24 29 24Z" fill="none" stroke={muted ? TOKENS.color.boneMuted : TOKENS.color.bone} strokeWidth="8" strokeLinejoin="round" />
  </svg>
);
