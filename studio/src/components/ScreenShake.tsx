import type {ReactNode} from 'react';
import {useCurrentFrame} from 'remotion';

export const ScreenShake = ({children, impactFrame}: {children: ReactNode; impactFrame: number | null}) => {
  const frame = useCurrentFrame();
  const age = impactFrame === null ? -1 : frame - impactFrame;
  const transform = age === 0 ? 'translate(9px, -6px)' : age === 1 ? 'translate(-7px, 5px)' : 'translate(0, 0)';
  return <div style={{position: 'absolute', inset: 0, transform}}>{children}</div>;
};

export const WhooshCut = ({children}: {children: ReactNode}) => {
  const frame = useCurrentFrame();
  const x = frame === 0 ? 18 : frame === 1 ? -5 : 0;
  return <div style={{position: 'absolute', inset: 0, transform: `translateX(${x}px)`}}>{children}</div>;
};
