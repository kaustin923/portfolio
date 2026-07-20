import type {ReactNode} from 'react';
import {TOKENS} from '../tokens';

export const FIELD_CARD_WIDTH = 888;
export const FIELD_CARD_HEIGHT = 1000;

export const FieldCard = ({
  label,
  labelReveal = 1,
  pxPerYd = 22.2,
  children,
}: {
  label?: string;
  labelReveal?: number;
  pxPerYd?: number;
  children?: ReactNode;
}) => (
  <div
    style={{
      width: FIELD_CARD_WIDTH,
      height: FIELD_CARD_HEIGHT,
      position: 'relative',
      flex: '0 0 auto',
      boxSizing: 'border-box',
      border: `3px solid ${TOKENS.color.boneHairline}`,
      borderRadius: TOKENS.radius.card,
      background: `radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(0,0,0,.5) 100%), repeating-linear-gradient(180deg, rgba(242,237,228,.022) 0, rgba(242,237,228,.022) ${5 * pxPerYd}px, transparent ${5 * pxPerYd}px, transparent ${10 * pxPerYd}px), #0E1310`,
      overflow: 'hidden',
    }}
  >
    {children}
    {label ? (
      <div
        style={{
          position: 'absolute',
          top: 24,
          left: 28,
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          opacity: labelReveal,
        }}
      >
        <span style={{width: 42, height: 6, flex: '0 0 auto', background: TOKENS.color.pending}} />
        <span
          style={{
            color: TOKENS.color.pending,
            fontFamily: TOKENS.font.mono,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '.14em',
            lineHeight: 1,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
      </div>
    ) : null}
  </div>
);
