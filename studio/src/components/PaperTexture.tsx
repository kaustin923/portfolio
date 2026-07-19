import type {CSSProperties, ReactNode} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {TOKENS} from '../tokens';

const paperSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="52"/></filter><rect width="100%" height="100%" filter="url(#n)" opacity=".34"/></svg>`;
const PAPER_NOISE = `url("data:image/svg+xml,${encodeURIComponent(paperSvg)}")`;

export const PaperTexture = ({opacity = 0.07, dark = false}: {opacity?: number; dark?: boolean}) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      opacity,
      mixBlendMode: dark ? 'screen' : 'multiply',
      backgroundImage: PAPER_NOISE,
      backgroundSize: '220px 220px',
    }}
  />
);

export const FoilShimmer = ({children, style}: {children: ReactNode; style?: CSSProperties}) => {
  const frame = useCurrentFrame();
  const position = interpolate(frame % 90, [0, 89], [-80, 180]);
  return (
    <div
      style={{
        color: TOKENS.color.pending,
        backgroundImage: `linear-gradient(108deg, ${TOKENS.color.pending} 0%, ${TOKENS.color.bone} 42%, ${TOKENS.color.pending} 57%, ${TOKENS.color.pending} 100%)`,
        backgroundSize: '240% 100%',
        backgroundPosition: `${position}% 0`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        ...style,
      }}
    >
      {children}
    </div>
  );
};
