import {useCurrentFrame, useVideoConfig} from 'remotion';
import {TOKENS} from '../tokens';
import {slamTransform} from './motion';
import {PaperTexture, FoilShimmer} from './PaperTexture';
import {ConfidenceDial} from './ConfidenceDial';

export type PredictionCardProps = {
  title: string;
  date: string;
  callId: string;
  confidence: number;
  variant?: 'default' | 'longshot';
  delay?: number;
  width?: number;
  compact?: boolean;
  animationOffset?: number;
  rotate?: number;
  frameOverride?: number;
  slamDistance?: number;
};

export const PredictionCard = ({
  title,
  date,
  callId,
  confidence,
  variant = 'default',
  delay = 0,
  width = 888,
  compact = false,
  animationOffset = 0,
  rotate = 0,
  frameOverride,
  slamDistance,
}: PredictionCardProps) => {
  const currentFrame = useCurrentFrame();
  const frame = frameOverride ?? currentFrame;
  const {fps} = useVideoConfig();
  const longshot = variant === 'longshot';
  const height = compact ? 420 : 570;
  const slam = slamTransform(frame + animationOffset, fps, delay, slamDistance ?? (compact ? 560 : 1400));
  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        background: TOKENS.color.bone,
        borderRadius: TOKENS.radius.card,
        border: longshot ? `5px solid ${TOKENS.color.pending}` : '2px solid rgba(13,15,20,.2)',
        boxShadow: '0 28px 0 rgba(0,0,0,.22), 0 42px 70px rgba(0,0,0,.34), inset 0 0 0 8px rgba(13,15,20,.045)',
        overflow: 'hidden',
        ...slam,
        transform: `${slam.transform} rotate(${rotate}deg)`,
      }}
    >
      <PaperTexture />
      <div style={{position: 'absolute', inset: compact ? '38px 46px' : '46px 54px', display: 'flex', flexDirection: 'column'}}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `3px solid ${TOKENS.color.ink}`, paddingBottom: 18}}>
          <div style={{fontFamily: TOKENS.font.mono, color: TOKENS.color.ink, fontSize: 28, fontWeight: 600, letterSpacing: '.08em'}}>{callId}</div>
          <div style={{fontFamily: TOKENS.font.mono, color: TOKENS.color.ink, fontSize: 28, fontWeight: 600}}>{date}</div>
        </div>
        {longshot ? (
          <FoilShimmer style={{position: 'absolute', right: -2, top: 63, fontFamily: TOKENS.font.display, fontSize: 28, letterSpacing: '.16em', transform: 'scaleX(1.08)', transformOrigin: 'right'}}>
            LONG SHOT
          </FoilShimmer>
        ) : null}
        <div style={{display: 'flex', alignItems: 'center', flex: 1, gap: 22}}>
          <div
            style={{
              flex: 1,
              color: TOKENS.color.ink,
              fontFamily: TOKENS.font.display,
              fontSize: compact ? 46 : 56,
              lineHeight: 0.98,
              letterSpacing: '-.035em',
              textTransform: 'uppercase',
              transform: 'scaleX(1.06)',
              transformOrigin: 'left',
            }}
          >
            {title}
          </div>
          <ConfidenceDial target={confidence} delay={delay + 5} size={compact ? 210 : 246} frameOverride={frameOverride} />
        </div>
        <div style={{height: 46, borderTop: `3px solid ${TOKENS.color.ink}`, display: 'flex', alignItems: 'flex-end', gap: 18}}>
          <div style={{height: 28, width: '58%', background: `repeating-linear-gradient(90deg, ${TOKENS.color.ink} 0 4px, transparent 4px 9px, ${TOKENS.color.ink} 9px 11px, transparent 11px 16px)`}} />
          <div style={{fontFamily: TOKENS.font.mono, color: TOKENS.color.ink, fontSize: 18, fontWeight: 500, letterSpacing: '.12em'}}>DATED CALL / GRADE LIVE</div>
        </div>
      </div>
    </div>
  );
};
