export const TOKENS = {
  color: {
    ink: '#0D0F14',
    bone: '#F2EDE4',
    hit: '#2FBF71',
    miss: '#E5484D',
    pending: '#D9A441',
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
