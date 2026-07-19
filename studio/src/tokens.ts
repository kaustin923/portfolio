import type {EpisodeTheme} from './schema';

export const DEFAULT_THEME = {
  name: 'Called It Gold',
  accent: '#D9A441',
  accentSoft: 'rgba(217,164,65,.24)',
} as const;

export const resolveThemeTokens = (theme?: EpisodeTheme) => ({
  name: theme?.name ?? DEFAULT_THEME.name,
  accent: theme?.accent ?? DEFAULT_THEME.accent,
  accentSoft: theme?.accentSoft ?? DEFAULT_THEME.accentSoft,
});

export const TOKENS = {
  color: {
    ink: '#0D0F14',
    bone: '#F2EDE4',
    hit: '#2FBF71',
    miss: '#E5484D',
    pending: 'var(--episode-accent, #D9A441)',
    pendingSoft: 'var(--episode-accent-soft, rgba(217,164,65,.24))',
    boneHairline: 'rgba(242, 237, 228, 0.22)',
    boneMuted: 'rgba(242, 237, 228, 0.62)',
    inkMuted: 'rgba(13, 15, 20, 0.68)',
  },
  font: {
    display: '"Archivo Black", sans-serif',
    mono: '"IBM Plex Mono", monospace',
    caption: '"Inter", sans-serif',
  },
  safe: {
    x: 96,
    top: 96,
    bottom: 220,
  },
  radius: {
    card: 24,
  },
} as const;

export const CANVAS = {width: 1080, height: 1920, fps: 30} as const;
