import {useMemo} from 'react';
import {Easing, interpolate, spring, useVideoConfig} from 'remotion';
import type {FieldPlayViz} from '../../schema';
import {TOKENS} from '../../tokens';
import {FieldCard} from '../FieldCard';
import {FieldChip} from '../FieldChip';
import {FieldLayer} from '../FieldLayer';
import {PlayerDot} from '../PlayerDot';
import {BlockBar, RouteArrow} from '../RouteArrow';
import {makeProjection, phase, pointAlong, type FieldView} from '../geometry';

const VIEW: FieldView = {xCenter: 26.665, widthYd: 40, yMin: -11, wPx: 888, hPx: 1000};

export const FieldPlay = ({viz, frame, duration}: {viz: FieldPlayViz; frame: number; duration: number}) => {
  const {fps} = useVideoConfig();
  const projection = useMemo(() => makeProjection(VIEW), []);
  const routePoints = useMemo(() => viz.run.path.map(projection.toPt), [projection, viz.run.path]);
  const blockById = useMemo(() => new Map((viz.blocks ?? []).map((block) => [block.id, block])), [viz.blocks]);
  const offenseOrder = useMemo(() => viz.players.filter((player) => player.team === 'offense').map((player) => player.id), [viz.players]);
  const defenseOrder = useMemo(() => viz.players.filter((player) => player.team === 'defense').map((player) => player.id), [viz.players]);
  const hero = viz.players.find((player) => player.id === viz.run.playerId)!;
  const fieldReveal = phase(frame, duration, .02, .12);
  const losReveal = Easing.out(Easing.cubic)(phase(frame, duration, .04, .16));
  const firstDownReveal = Easing.out(Easing.cubic)(phase(frame, duration, .10, .22));
  const blockProgress = Easing.out(Easing.cubic)(phase(frame, duration, .20, .34));
  const blockBarProgress = Easing.out(Easing.cubic)(phase(frame, duration, .28, .34));
  const laneReveal = phase(frame, duration, .26, .40);
  const runProgress = Easing.bezier(.18, 0, .98, 1)(phase(frame, duration, .34, .82));
  const heroPx = pointAlong(routePoints, runProgress);
  const heroWorld = pointAlong(viz.run.path, runProgress);
  const calloutStart = Math.round(duration * .84);
  const calloutPop = spring({
    frame: Math.max(0, frame - calloutStart),
    fps,
    config: {damping: 13, stiffness: 170, mass: .8},
  });
  const pulseFrame = frame - calloutStart;
  const heroPulse = interpolate(pulseFrame, [0, 6, 12], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const endpoint = routePoints[routePoints.length - 1];
  const towardCenter = {x: 444 - endpoint.x, y: 500 - endpoint.y};
  const centerDistance = Math.max(1, Math.hypot(towardCenter.x, towardCenter.y));
  const calloutPoint = {
    x: endpoint.x + towardCenter.x / centerDistance * 90,
    y: endpoint.y + towardCenter.y / centerDistance * 90,
  };

  const dotPop = (startPhase: number, stagger: number) => spring({
    frame: Math.max(0, frame - Math.round(duration * startPhase) - stagger),
    fps,
    config: {damping: 13, stiffness: 170, mass: .8},
  });

  return (
    <FieldCard label={viz.label} labelReveal={phase(frame, duration, 0, .10)} pxPerYd={projection.pxPerYd}>
      <svg width={VIEW.wPx} height={VIEW.hPx} viewBox={`0 0 ${VIEW.wPx} ${VIEW.hPx}`} style={{position: 'absolute', inset: 0}}>
        <FieldLayer
          view={VIEW}
          reveal={fieldReveal}
          losLabel={viz.losLabel}
          firstDownYd={viz.firstDownYd}
          firstDownReveal={firstDownReveal}
          losReveal={losReveal}
        />
        {viz.lane ? (() => {
          const laneTop = projection.toY(viz.firstDownYd ?? 12);
          const laneBottom = projection.toY(0);
          return (
            <rect
              x={projection.toX(viz.lane.x - viz.lane.width / 2)}
              y={Math.min(laneTop, laneBottom)}
              width={viz.lane.width * projection.pxPerYd}
              height={Math.abs(laneBottom - laneTop)}
              rx={14}
              fill={TOKENS.color.pendingSoft}
              opacity={laneReveal * .16}
              style={{mixBlendMode: 'screen'}}
            />
          );
        })() : null}
        <RouteArrow pts={routePoints} progress={runProgress} color={TOKENS.color.pending} width={10} glow arrowhead />
      </svg>

      {viz.losLabel ? (
        <FieldChip
          x={76}
          y={projection.toY(0) - 36}
          text={viz.losLabel}
          pop={spring({frame: Math.max(0, frame - Math.round(duration * .14)), fps, config: {damping: 13, stiffness: 170, mass: .8}})}
        />
      ) : null}

      {viz.players.map((player) => {
        const isHero = player.id === viz.run.playerId;
        const block = blockById.get(player.id);
        const start = projection.toPt(player);
        const position = isHero ? heroPx : block ? projection.toPt({
          x: player.x + block.dx * blockProgress,
          y: player.y + block.dy * blockProgress,
        }) : start;
        const order = player.team === 'offense' ? offenseOrder.indexOf(player.id) : defenseOrder.indexOf(player.id);
        const pop = dotPop(player.team === 'offense' ? .06 : .12, order * 3);
        const fades = viz.fadeOnPass?.includes(player.id) ?? false;
        const opacity = fades ? interpolate(heroWorld.y - player.y, [-2, 1.5], [1, .22], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }) : 1;
        return (
          <PlayerDot
            key={player.id}
            cx={position.x}
            cy={position.y}
            label={player.label}
            name={isHero ? player.name : undefined}
            team={player.team}
            tone={isHero ? 'accent' : 'bone'}
            hero={isHero}
            pop={pop}
            opacity={opacity}
            pulse={isHero ? heroPulse : 0}
            namePlacement={position.x > 600 ? 'left' : 'right'}
          />
        );
      })}

      <svg width={VIEW.wPx} height={VIEW.hPx} viewBox={`0 0 ${VIEW.wPx} ${VIEW.hPx}`} style={{position: 'absolute', inset: 0, zIndex: 9, pointerEvents: 'none'}}>
        {(viz.blocks ?? []).map((block) => {
          const player = viz.players.find((candidate) => candidate.id === block.id)!;
          const start = projection.toPt(player);
          const end = projection.toPt({x: player.x + block.dx, y: player.y + block.dy});
          return (
            <BlockBar
              key={block.id}
              point={end}
              angle={Math.atan2(end.y - start.y, end.x - start.x)}
              progress={blockBarProgress}
            />
          );
        })}
      </svg>

      {viz.callout ? (
        <FieldChip
          x={calloutPoint.x}
          y={calloutPoint.y}
          text={viz.callout.text}
          sub={viz.callout.sub}
          tone="accent"
          pop={calloutPop}
          big
        />
      ) : null}
    </FieldCard>
  );
};
