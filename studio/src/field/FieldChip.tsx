import {TOKENS} from '../tokens';

const toneColor = (tone: 'accent' | 'bone' | 'red') => {
  if (tone === 'accent') return TOKENS.color.pending;
  if (tone === 'red') return TOKENS.color.miss;
  return TOKENS.color.bone;
};

export const FieldChip = ({
  x,
  y,
  text,
  sub,
  tone = 'bone',
  pop,
  big = false,
}: {
  x: number;
  y: number;
  text: string;
  sub?: string;
  tone?: 'accent' | 'bone' | 'red';
  pop: number;
  big?: boolean;
}) => {
  const clampedX = Math.min(864, Math.max(24, x));
  const clampedY = Math.min(930, Math.max(70, y));
  const color = toneColor(tone);
  return (
    <div
      style={{
        position: 'absolute',
        left: clampedX,
        top: clampedY,
        zIndex: 16,
        boxSizing: 'border-box',
        maxWidth: 520,
        padding: '12px 20px',
        border: `3px solid ${color}`,
        borderRadius: 12,
        background: 'rgba(13,15,20,.9)',
        boxShadow: tone === 'accent' ? `0 0 24px ${TOKENS.color.pendingSoft}` : undefined,
        color,
        opacity: pop,
        textAlign: 'center',
        textTransform: 'uppercase',
        transform: `translate(-50%, -50%) scale(${.6 + pop * .4})`,
        transformOrigin: 'center',
      }}
    >
      <div
        style={{
          fontFamily: big ? TOKENS.font.display : TOKENS.font.mono,
          fontSize: big ? 54 : 22,
          fontWeight: 800,
          letterSpacing: big ? '-.035em' : '.04em',
          lineHeight: .95,
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </div>
      {sub ? (
        <div style={{marginTop: 7, color: TOKENS.color.boneMuted, fontFamily: TOKENS.font.mono, fontSize: 15, fontWeight: 700, letterSpacing: '.07em', lineHeight: 1.12}}>
          {sub}
        </div>
      ) : null}
    </div>
  );
};
