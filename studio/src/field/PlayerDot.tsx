import {TOKENS} from '../tokens';

type DotTone = 'accent' | 'bone' | 'red';

const toneColor = (tone: DotTone | undefined, team: 'offense' | 'defense', hero: boolean) => {
  if (tone === 'accent' || hero) return TOKENS.color.pending;
  if (tone === 'red') return TOKENS.color.miss;
  return team === 'defense' ? TOKENS.color.boneMuted : TOKENS.color.bone;
};

export const PlayerDot = ({
  cx,
  cy,
  label,
  name,
  team,
  tone,
  hero = false,
  pop,
  opacity = 1,
  pulse = 0,
  namePlacement = 'right',
}: {
  cx: number;
  cy: number;
  label: string;
  name?: string;
  team: 'offense' | 'defense';
  tone?: DotTone;
  hero?: boolean;
  pop: number;
  opacity?: number;
  pulse?: number;
  namePlacement?: 'left' | 'right';
}) => {
  const ring = toneColor(tone, team, hero);
  const size = team === 'offense' ? (hero ? 76 : 64) : 56;
  const scale = (.5 + pop * .5) * (1 + pulse * .12);
  return (
    <div
      style={{
        position: 'absolute',
        left: cx,
        top: cy,
        zIndex: hero ? 12 : 8,
        width: size,
        height: size,
        opacity: pop * opacity,
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: 'center',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          boxSizing: 'border-box',
          border: `${team === 'offense' ? 4 : 3}px solid ${ring}`,
          borderRadius: team === 'offense' ? '50%' : 7,
          background: TOKENS.color.ink,
          boxShadow: hero ? `0 0 ${18 + pulse * 26}px ${TOKENS.color.pendingSoft}` : undefined,
          transform: team === 'defense' ? 'rotate(45deg)' : undefined,
        }}
      >
        <span
          style={{
            color: ring,
            fontFamily: TOKENS.font.mono,
            fontSize: 24,
            fontWeight: 800,
            lineHeight: 1,
            transform: team === 'defense' ? 'rotate(-45deg)' : undefined,
          }}
        >
          {label}
        </span>
      </div>
      {name ? (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            ...(namePlacement === 'right' ? {left: size + 8} : {right: size + 8}),
            padding: '6px 12px',
            border: `2px solid ${ring}`,
            borderRadius: 8,
            background: 'rgba(13,15,20,.88)',
            color: ring,
            fontFamily: TOKENS.font.mono,
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: '.09em',
            lineHeight: 1.1,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            transform: 'translateY(-50%)',
          }}
        >
          {name}
        </div>
      ) : null}
    </div>
  );
};
