import {Easing, interpolate, spring} from 'remotion';

export const settle = (frame: number, fps = 30, delay = 0) =>
  spring({frame: frame - delay, fps, config: {damping: 13, mass: 0.9, stiffness: 170}});

export const slamTransform = (frame: number, fps = 30, delay = 0, distance = 540) => {
  const progress = settle(frame, fps, delay);
  const impactAge = frame - delay - 8;
  const squash = impactAge === 0 ? 1.06 : impactAge === 1 ? 0.96 : impactAge === 2 ? 1.025 : 1;
  return {
    transform: `translateY(${interpolate(progress, [0, 1], [-distance, 0])}px) scale(${squash}, ${2 - squash})`,
  };
};

export const snapProgress = (frame: number, delay = 0, duration = 28) =>
  interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.back(1.7)),
  });

export const rollOffset = (progress: number) => interpolate(progress, [0, 1], [0, -1]);
