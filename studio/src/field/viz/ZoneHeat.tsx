import {useMemo} from 'react';
import {Easing, interpolate, spring, useVideoConfig} from 'remotion';
import type {ZoneHeatViz} from '../../schema';
import {relativeProgress} from '../../scenes/EducationalShared';
import {TOKENS} from '../../tokens';
import {FieldCard} from '../FieldCard';
import {FieldChip} from '../FieldChip';
import {FieldLayer} from '../FieldLayer';
import {PlayerDot} from '../PlayerDot';
import {makeProjection, type FieldView} from '../geometry';

const VIEW: FieldView = {xCenter: 26.665, widthYd: 40, yMin: -11, wPx: 888, hPx: 1000};
const laneBounds = {
  left: [6.67, 21],
  middle: [21, 32.3],
  right: [32.3, 46.67],
} as const;
const depthBounds = {
  backfield: [-11, 0],
  short: [0, 10],
  mid: [10, 20],
  deep: [20, 34],
} as const;

type Zone = ZoneHeatViz['zones'][number];

export const ZoneHeat = ({viz, frame, duration}: {viz: ZoneHeatViz; frame: number; duration: number}) => {
  const {fps} = useVideoConfig();
  const ph = (from: number, to: number) => relativeProgress(frame, duration, from, to);
  const projection = useMemo(() => makeProjection(VIEW), []);
  const rectOf = (zone: Pick<Zone, 'lane' | 'depth'>) => {
    const [laneMin, laneMax] = laneBounds[zone.lane];
    const [depthMin, depthMax] = depthBounds[zone.depth];
    const left = projection.toX(laneMin + .6);
    const right = projection.toX(laneMax - .6);
    const top = projection.toY(depthMax - .5);
    const bottom = projection.toY(depthMin + .5);
    return {x: left, y: top, width: right - left, height: bottom - top, cx: (left + right) / 2, cy: (top + bottom) / 2};
  };
  const focus = viz.zones.find((zone) => zone.focus);
  const focusRect = focus ? rectOf(focus) : undefined;
  const ordered = useMemo(() => viz.zones.filter((zone) => !zone.focus).sort((a, b) => a.intensity - b.intensity), [viz.zones]);
  const fieldReveal = ph(.02, .12);
  const losReveal = Easing.out(Easing.cubic)(ph(.04, .14));
  const focusProgress = Easing.inOut(Easing.cubic)(ph(.55, .72));
  const cameraScale = 1 + focusProgress * .06;
  const markerStart = Math.round(duration * .74);
  const markerPop = spring({frame: Math.max(0, frame - markerStart), fps, config: {damping: 13, stiffness: 170, mass: .8}});
  const breathe = frame < duration * .86 ? 0 : (1 - Math.cos((frame - duration * .86) * .08)) * .01;
  const markerRect = viz.marker ? rectOf(viz.marker) : focusRect;

  const revealFor = (zone: Zone) => {
    const index = ordered.indexOf(zone);
    const start = Math.round(duration * (.16 + index * .05));
    return interpolate(frame, [start, start + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  };

  const statPopFor = (zone: Zone) => {
    const index = ordered.indexOf(zone);
    const start = Math.round(duration * (.16 + index * .05)) + 4;
    return spring({frame: Math.max(0, frame - start), fps, config: {damping: 13, stiffness: 170, mass: .8}});
  };

  const focusStatPop = spring({frame: Math.max(0, frame - Math.round(duration * .60)), fps, config: {damping: 13, stiffness: 170, mass: .8}});
  const origin = focusRect ? `${focusRect.cx}px ${focusRect.cy}px` : 'center';

  return (
    <FieldCard label={viz.label} labelReveal={ph(0, .10)} pxPerYd={projection.pxPerYd}>
      <div style={{position: 'absolute', inset: 0, transform: `scale(${cameraScale})`, transformOrigin: origin}}>
        <svg width={VIEW.wPx} height={VIEW.hPx} viewBox={`0 0 ${VIEW.wPx} ${VIEW.hPx}`} style={{position: 'absolute', inset: 0}}>
          <FieldLayer view={VIEW} reveal={fieldReveal} losReveal={losReveal} />
          {ordered.map((zone) => {
            const rect = rectOf(zone);
            const reveal = revealFor(zone);
            return (
              <rect
                key={`${zone.lane}-${zone.depth}`}
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                rx={10}
                fill={TOKENS.color.pending}
                fillOpacity={zone.intensity * .38 * reveal}
                stroke={TOKENS.color.pending}
                strokeWidth={1}
                strokeOpacity={.25 * reveal}
                transform={`translate(${rect.cx} ${rect.cy}) scale(${.94 + reveal * .06}) translate(${-rect.cx} ${-rect.cy})`}
                style={{mixBlendMode: 'screen'}}
              />
            );
          })}
          {focus && focusRect ? (
            <rect
              x={focusRect.x}
              y={focusRect.y}
              width={focusRect.width}
              height={focusRect.height}
              rx={10}
              fill={TOKENS.color.pending}
              fillOpacity={focus.intensity * .55 * focusProgress}
              stroke={TOKENS.color.pending}
              strokeWidth={3}
              strokeOpacity={focusProgress}
              transform={`translate(${focusRect.cx} ${focusRect.cy}) scale(${1 + breathe}) translate(${-focusRect.cx} ${-focusRect.cy})`}
              style={{mixBlendMode: 'screen', filter: `drop-shadow(0 0 12px ${TOKENS.color.pendingSoft})`}}
            />
          ) : null}
        </svg>

        {ordered.map((zone) => {
          if (!zone.stat) return null;
          const rect = rectOf(zone);
          return <FieldChip key={`stat-${zone.lane}-${zone.depth}`} x={rect.cx} y={rect.cy} text={zone.stat} tone="bone" pop={statPopFor(zone)} />;
        })}
        {focus?.stat && focusRect ? <FieldChip x={focusRect.cx} y={focusRect.cy} text={focus.stat} tone="accent" pop={focusStatPop} big /> : null}
        {viz.marker && markerRect ? (
          <PlayerDot
            cx={markerRect.cx}
            cy={markerRect.cy + 70}
            label={viz.marker.label}
            name={viz.marker.name}
            team="offense"
            tone="accent"
            hero
            pop={markerPop}
            namePlacement={markerRect.cx > 540 ? 'left' : 'right'}
          />
        ) : null}
      </div>
    </FieldCard>
  );
};
