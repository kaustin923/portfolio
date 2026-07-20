import {memo, useMemo} from 'react';
import {TOKENS} from '../tokens';
import {HASH_L, HASH_R, NUMBERS_X, makeProjection, type FieldView} from './geometry';

const spacedYardNumber = (yard: number) => {
  const normalized = ((Math.round(yard) % 100) + 100) % 100;
  const folded = Math.min(normalized, 100 - normalized);
  return String(folded).padStart(2, '0').split('').join(' ');
};

export const FieldLayer = memo(({
  view,
  reveal,
  losLabel,
  firstDownYd,
  firstDownReveal = 0,
  losReveal = 1,
}: {
  view: FieldView;
  reveal: number;
  losLabel?: string;
  firstDownYd?: number;
  firstDownReveal?: number;
  losReveal?: number;
}) => {
  const geometry = useMemo(() => {
    const projection = makeProjection(view);
    const firstFive = Math.ceil(view.yMin / 5) * 5;
    const firstTen = Math.ceil(view.yMin / 10) * 10;
    const firstYard = Math.ceil(view.yMin);
    const yardLines: number[] = [];
    const hashRows: number[] = [];
    const numberRows: number[] = [];
    for (let y = firstFive; y <= projection.yMax; y += 5) {
      if (Math.abs(y) > .001) yardLines.push(y);
    }
    for (let y = firstYard; y <= projection.yMax; y += 1) hashRows.push(y);
    for (let y = firstTen; y <= projection.yMax; y += 10) numberRows.push(y);
    const losYard = Number(losLabel?.match(/(\d{1,2})\s*$/)?.[1] ?? 20);
    return {projection, yardLines, hashRows, numberRows, losYard};
  }, [view, losLabel]);

  const {projection} = geometry;
  return (
    <g opacity={reveal}>
      <g stroke={TOKENS.color.bone} strokeWidth={2}>
        {geometry.yardLines.map((worldY) => (
          <line key={`yard-${worldY}`} x1={0} x2={view.wPx} y1={projection.toY(worldY)} y2={projection.toY(worldY)} opacity={.2} />
        ))}
      </g>
      <g stroke={TOKENS.color.bone} strokeWidth={2} opacity={.15}>
        {geometry.hashRows.flatMap((worldY) => {
          const py = projection.toY(worldY);
          return [
            <line key={`left-edge-${worldY}`} x1={0} x2={10} y1={py} y2={py} />,
            <line key={`left-hash-${worldY}`} x1={projection.toX(HASH_L) - 5} x2={projection.toX(HASH_L) + 5} y1={py} y2={py} />,
            <line key={`right-hash-${worldY}`} x1={projection.toX(HASH_R) - 5} x2={projection.toX(HASH_R) + 5} y1={py} y2={py} />,
            <line key={`right-edge-${worldY}`} x1={view.wPx - 10} x2={view.wPx} y1={py} y2={py} />,
          ];
        })}
      </g>
      <g
        fill={TOKENS.color.bone}
        fontFamily={TOKENS.font.mono}
        fontSize={30}
        fontWeight={700}
        opacity={.12}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {geometry.numberRows.flatMap((worldY) => NUMBERS_X.map((worldX) => (
          <text key={`number-${worldX}-${worldY}`} x={projection.toX(worldX)} y={projection.toY(worldY)}>
            {spacedYardNumber(geometry.losYard + worldY)}
          </text>
        )))}
      </g>
      <line
        x1={0}
        x2={view.wPx}
        y1={projection.toY(0)}
        y2={projection.toY(0)}
        pathLength={1}
        stroke="#3B82F6"
        strokeWidth={5}
        strokeDasharray={1}
        strokeDashoffset={1 - losReveal}
        opacity={.75}
      />
      {firstDownYd !== undefined ? (
        <line
          x1={0}
          x2={view.wPx}
          y1={projection.toY(firstDownYd)}
          y2={projection.toY(firstDownYd)}
          pathLength={1}
          stroke="#FACC15"
          strokeWidth={5}
          strokeDasharray={1}
          strokeDashoffset={1 - firstDownReveal}
          opacity={.8}
        />
      ) : null}
    </g>
  );
});

FieldLayer.displayName = 'FieldLayer';
