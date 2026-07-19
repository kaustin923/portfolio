import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {CaptionPage, EpisodeTheme} from '../schema';
import {resolveThemeTokens, TOKENS} from '../tokens';

export const Captions = ({pages, theme, frameOverride}: {pages: CaptionPage[]; theme?: EpisodeTheme; frameOverride?: number}) => {
  const currentFrame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const themeTokens = resolveThemeTokens(theme);
  const frame = frameOverride ?? currentFrame;
  const nowMs = (frame / fps) * 1000;
  const page = pages.find((candidate) => nowMs >= candidate.startMs && nowMs <= candidate.endMs);
  if (!page) return null;
  const dialogue = Boolean(page.speaker);
  const jessica = page.speaker === 'jessica';
  const speakerColor = jessica ? themeTokens.accent : TOKENS.color.bone;
  const pageFrame = frame - Math.round((page.startMs / 1000) * fps);
  const scale = interpolate(pageFrame, [0, 1, 2], [1.12, 0.97, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', left: 96, right: 96, bottom: 274, display: 'flex', justifyContent: jessica ? 'flex-start' : dialogue ? 'flex-end' : 'center', zIndex: 80, transform: `scale(${scale})`, transformOrigin: jessica ? 'left center' : dialogue ? 'right center' : 'center'}}>
      <div
        style={{
          maxWidth: 888,
          padding: dialogue ? '18px 27px 20px' : '15px 24px 17px',
          color: speakerColor,
          background: 'rgba(13,15,20,.9)',
          border: `2px solid ${dialogue ? speakerColor : TOKENS.color.boneHairline}`,
          fontFamily: TOKENS.font.caption,
          fontSize: dialogue ? 60 : 54,
          fontWeight: 700,
          lineHeight: 1.06,
          textAlign: dialogue ? 'left' : 'center',
          textTransform: 'uppercase',
          letterSpacing: '-.025em',
          boxShadow: dialogue ? `8px 8px 0 rgba(13,15,20,.38), 0 0 24px ${themeTokens.accentSoft}` : '8px 8px 0 rgba(13,15,20,.38)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: dialogue ? 18 : 0,
        }}
      >
        {dialogue ? (
          <span style={{display: 'grid', flex: '0 0 auto', placeItems: 'center', width: 46, height: 46, marginTop: 4, borderRadius: 8, color: TOKENS.color.ink, background: speakerColor, fontFamily: TOKENS.font.mono, fontSize: 26, fontWeight: 800, letterSpacing: 0}}>
            {jessica ? 'J' : 'G'}
          </span>
        ) : null}
        <span>
          {page.words?.length ? page.words.map((word, index) => {
            const active = nowMs >= word.startMs && nowMs <= word.endMs;
            const spoken = nowMs >= word.startMs;
            return (
              <span
                key={`${page.id}-word-${index}`}
                style={{
                  display: 'inline-block',
                  marginRight: index < page.words!.length - 1 ? '.22em' : 0,
                  opacity: spoken ? 1 : .48,
                  transform: active ? 'translateY(-2px)' : 'none',
                  textShadow: active ? `0 0 18px ${jessica ? themeTokens.accentSoft : 'rgba(242,237,228,.3)'}` : 'none',
                }}
              >
                {word.text}
              </span>
            );
          }) : page.text}
        </span>
      </div>
    </div>
  );
};
