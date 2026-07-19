import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {CaptionPage} from '../schema';
import {TOKENS} from '../tokens';

export const Captions = ({pages, frameOverride}: {pages: CaptionPage[]; frameOverride?: number}) => {
  const currentFrame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const frame = frameOverride ?? currentFrame;
  const nowMs = (frame / fps) * 1000;
  const page = pages.find((candidate) => nowMs >= candidate.startMs && nowMs <= candidate.endMs);
  if (!page) return null;
  const pageFrame = frame - Math.round((page.startMs / 1000) * fps);
  const scale = interpolate(pageFrame, [0, 1, 2], [1.12, 0.97, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', left: 96, right: 96, bottom: 274, display: 'flex', justifyContent: 'center', zIndex: 80, transform: `scale(${scale})`}}>
      <div
        style={{
          maxWidth: 888,
          padding: '15px 24px 17px',
          color: TOKENS.color.bone,
          background: 'rgba(13,15,20,.9)',
          border: `2px solid ${TOKENS.color.boneHairline}`,
          fontFamily: TOKENS.font.caption,
          fontSize: 54,
          fontWeight: 700,
          lineHeight: 1.06,
          textAlign: 'center',
          textTransform: 'uppercase',
          letterSpacing: '-.025em',
          boxShadow: '8px 8px 0 rgba(13,15,20,.38)',
        }}
      >
        {page.text}
      </div>
    </div>
  );
};
