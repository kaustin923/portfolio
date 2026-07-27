import type {ReactNode} from 'react';
import {AbsoluteFill} from 'remotion';
import {PaperTexture} from '../components/PaperTexture';
import {TOKENS} from '../tokens';

export const SceneField = ({children}: {children: ReactNode}) => (
  <AbsoluteFill style={{background: TOKENS.color.ink, color: TOKENS.color.bone, overflow: 'hidden'}}>
    <div style={{position: 'absolute', inset: 32, border: `2px solid ${TOKENS.color.boneHairline}`, pointerEvents: 'none'}} />
    <div style={{position: 'absolute', top: 62, left: 62, width: 42, height: 8, background: TOKENS.color.pending}} />
    <div style={{position: 'absolute', bottom: 62, right: 62, width: 42, height: 8, background: TOKENS.color.pending}} />
    <PaperTexture opacity={0.035} dark />
    {children}
  </AbsoluteFill>
);

export const Kicker = ({children, right}: {children: ReactNode; right?: boolean}) => (
  <div style={{position: 'absolute', top: 154, left: right ? undefined : 96, right: right ? 96 : undefined, fontFamily: TOKENS.font.mono, fontSize: 24, fontWeight: 600, color: TOKENS.color.pending, letterSpacing: '.18em'}}>
    {children}
  </div>
);

export const RuleLabel = ({children}: {children: ReactNode}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: 16, fontFamily: TOKENS.font.mono, fontSize: 22, fontWeight: 600, color: TOKENS.color.boneMuted, letterSpacing: '.13em'}}>
    <span style={{display: 'block', width: 54, height: 4, background: TOKENS.color.pending}} />{children}
  </div>
);
