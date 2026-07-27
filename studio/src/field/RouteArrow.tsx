import {TOKENS} from '../tokens';
import {pointAlong, type Pt} from './geometry';

const pointsString = (points: Pt[]) => points.map((point) => `${point.x},${point.y}`).join(' ');

export const RouteArrow = ({
  pts,
  progress,
  color,
  width = 10,
  glow = false,
  dashed = false,
  arrowhead = true,
  frame = 0,
}: {
  pts: Pt[];
  progress: number;
  color: string;
  width?: number;
  glow?: boolean;
  dashed?: boolean;
  arrowhead?: boolean;
  frame?: number;
}) => {
  if (pts.length < 2) return null;
  const tip = pointAlong(pts, dashed ? 1 : progress);
  const shared = dashed ? {
    strokeDasharray: '20 16',
    strokeDashoffset: -frame * 3,
  } : {
    pathLength: 1,
    strokeDasharray: 1,
    strokeDashoffset: 1 - progress,
  };
  return (
    <g opacity={dashed ? progress : 1}>
      <polyline
        points={pointsString(pts)}
        fill="none"
        stroke="rgba(13,15,20,.55)"
        strokeWidth={width * 2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...shared}
      />
      <polyline
        points={pointsString(pts)}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={glow ? {filter: `drop-shadow(0 0 12px ${TOKENS.color.pendingSoft})`} : undefined}
        {...shared}
      />
      {arrowhead ? (
        <polygon
          points="0,-11 26,0 0,11"
          fill={color}
          opacity={progress > .06 ? 1 : 0}
          transform={`translate(${tip.x} ${tip.y}) rotate(${tip.angle * 180 / Math.PI})`}
        />
      ) : null}
    </g>
  );
};

export const BlockBar = ({
  point,
  angle,
  progress = 1,
  color = TOKENS.color.bone,
}: {
  point: Pt;
  angle: number;
  progress?: number;
  color?: string;
}) => {
  const perpendicular = angle + Math.PI / 2;
  const dx = Math.cos(perpendicular) * 13;
  const dy = Math.sin(perpendicular) * 13;
  return (
    <line
      x1={point.x - dx}
      y1={point.y - dy}
      x2={point.x + dx}
      y2={point.y + dy}
      pathLength={1}
      stroke={color}
      strokeWidth={8}
      strokeLinecap="round"
      strokeDasharray={1}
      strokeDashoffset={1 - progress}
      opacity={progress}
    />
  );
};
