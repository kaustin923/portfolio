import {relativeProgress} from '../scenes/EducationalShared';

// NFL rulebook constants (yards)
export const FIELD_W = 53.33;
export const HASH_L = 23.58;
export const HASH_R = 29.75;
export const NUMBERS_X = [12, 41.33] as const;

// x runs left-to-right; positive y is downfield, toward the top of the card.
export type Pt = {x: number; y: number};

export type FieldView = {
  xCenter: number;
  widthYd: number;
  yMin: number;
  wPx: number;
  hPx: number;
};

export const makeProjection = (view: FieldView) => {
  const pxPerYd = view.wPx / view.widthYd;
  const x0 = view.xCenter - view.widthYd / 2;
  return {
    pxPerYd,
    yMax: view.yMin + view.hPx / pxPerYd,
    toX: (x: number) => (x - x0) * pxPerYd,
    toY: (y: number) => view.hPx - (y - view.yMin) * pxPerYd,
    toPt: (point: Pt) => ({
      x: (point.x - x0) * pxPerYd,
      y: view.hPx - (point.y - view.yMin) * pxPerYd,
    }),
  };
};

export const polylineLength = (points: Pt[]): number => {
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return length;
};

export const pointAlong = (points: Pt[], t: number): {x: number; y: number; angle: number} => {
  if (points.length === 0) return {x: 0, y: 0, angle: 0};
  if (points.length === 1) return {...points[0], angle: 0};

  const clamped = Math.min(1, Math.max(0, t));
  const total = polylineLength(points);
  if (total === 0) return {...points[0], angle: 0};

  const target = clamped * total;
  let walked = 0;
  let fallbackAngle = 0;

  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const segment = Math.hypot(dx, dy);
    if (segment === 0) continue;
    fallbackAngle = Math.atan2(dy, dx);
    if (walked + segment >= target || index === points.length - 1) {
      const local = Math.min(1, Math.max(0, (target - walked) / segment));
      return {
        x: from.x + dx * local,
        y: from.y + dy * local,
        angle: fallbackAngle,
      };
    }
    walked += segment;
  }

  return {...points[points.length - 1], angle: fallbackAngle};
};

export const phase = (frame: number, duration: number, from: number, to: number) =>
  relativeProgress(frame, duration, from, to);
