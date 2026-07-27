"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { capabilities } from "@/data/capabilities";
import { projects } from "@/data/projects";
import type { CapabilityId } from "@/types";

/**
 * The site renders Kyle's own work as a knowledge graph: projects on the inner
 * ring, capabilities on the outer ring, an edge wherever a project demonstrates
 * a capability. Same modeling instinct the Neo4j work is built on, so showing
 * it beats claiming it.
 *
 * Layout is fully deterministic. No physics sim and no randomness, so server
 * and client render identically.
 */

const W = 900;
const H = 660;
const CX = W / 2;
const CY = H / 2;
const R_PROJ = 128;
const R_CAP = 232;

interface Placed {
  id: string;
  x: number;
  y: number;
  angle: number;
  label: string;
  kind: "capability" | "project";
  slug?: string;
  metric?: string;
  hasDetail?: boolean;
}

function polar(angle: number, radius: number) {
  return { x: CX + Math.cos(angle) * radius, y: CY + Math.sin(angle) * radius };
}

/** Push a label clear of its node, and pick the anchor that keeps it readable. */
function labelFor(n: Placed) {
  const cos = Math.cos(n.angle);
  const sin = Math.sin(n.angle);
  if (cos > 0.35) {
    return { x: n.x + 20, y: n.y + 4, anchor: "start" as const };
  }
  if (cos < -0.35) {
    return { x: n.x - 20, y: n.y + 4, anchor: "end" as const };
  }
  return {
    x: n.x,
    y: n.y + (sin > 0 ? 30 : -20),
    anchor: "middle" as const,
  };
}

export function CapabilityGraph() {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);

  const { capNodes, projNodes, edges, byId } = useMemo(() => {
    const capAngles = new Map<CapabilityId, number>();
    const capNodes: Placed[] = capabilities.map((c, i) => {
      // Offset the start so no node lands dead-centre top, which crowds the title.
      const angle = (i / capabilities.length) * Math.PI * 2 - Math.PI / 2 + 0.26;
      capAngles.set(c.id, angle);
      const { x, y } = polar(angle, R_CAP);
      return {
        id: c.id,
        x,
        y,
        angle,
        label: c.label,
        kind: "capability" as const,
      };
    });

    // Cluster each project under its first-listed capability so its strongest
    // edge stays short, then fan the cluster out around that angle.
    const groups = new Map<CapabilityId, typeof projects>();
    projects.forEach((p) => {
      const primary = p.capabilities[0];
      if (!groups.has(primary)) groups.set(primary, []);
      groups.get(primary)!.push(p);
    });

    const projNodes: Placed[] = [];
    groups.forEach((members, capId) => {
      const base = capAngles.get(capId) ?? 0;
      const span = Math.min(members.length * 0.26, 0.9);
      members.forEach((p, i) => {
        const offset =
          members.length === 1
            ? 0
            : -span / 2 + (i / (members.length - 1)) * span;
        const angle = base + offset;
        const { x, y } = polar(angle, R_PROJ);
        projNodes.push({
          id: p.slug,
          x,
          y,
          angle,
          label: p.name,
          kind: "project",
          slug: p.slug,
          metric: p.metric,
          hasDetail: !!p.detail,
        });
      });
    });

    const edges = projects.flatMap((p) =>
      p.capabilities.map((c) => ({ from: p.slug, to: c as string }))
    );

    const byId = new Map<string, Placed>();
    [...capNodes, ...projNodes].forEach((n) => byId.set(n.id, n));

    return { capNodes, projNodes, edges, byId };
  }, []);

  const neighbours = useMemo(() => {
    const m = new Map<string, Set<string>>();
    edges.forEach((e) => {
      if (!m.has(e.from)) m.set(e.from, new Set());
      if (!m.has(e.to)) m.set(e.to, new Set());
      m.get(e.from)!.add(e.to);
      m.get(e.to)!.add(e.from);
    });
    return m;
  }, [edges]);

  const isLit = (id: string) =>
    !active || id === active || !!neighbours.get(active)?.has(id);
  const edgeLit = (from: string, to: string) =>
    !active || from === active || to === active;

  const activeNode = active ? byId.get(active) : null;
  const activeCap = capabilities.find((c) => c.id === active);
  const activeDegree = active ? (neighbours.get(active)?.size ?? 0) : 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">
          My work as a knowledge graph
        </h3>
        <p className="tabular text-xs text-subtle">
          {projects.length} projects · {capabilities.length} capabilities ·{" "}
          {edges.length} edges
        </p>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label={`A graph of Kyle's work. ${projects.length} projects on an inner ring connect to ${capabilities.length} capabilities on an outer ring across ${edges.length} connections. The same information is in the capability tabs above.`}
        onMouseLeave={() => setActive(null)}
      >
        <g>
          {edges.map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            const lit = edgeLit(e.from, e.to);
            // Bow each edge outward, away from the centre, so runs separate
            // instead of piling up through the middle.
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const qx = mx + (mx - CX) * 0.22;
            const qy = my + (my - CY) * 0.22;
            return (
              <path
                key={`${e.from}-${e.to}`}
                d={`M ${a.x} ${a.y} Q ${qx} ${qy} ${b.x} ${b.y}`}
                fill="none"
                stroke={lit && active ? "var(--color-primary)" : "#B9B1A2"}
                strokeWidth={lit && active ? 1.8 : 1}
                opacity={lit ? (active ? 0.8 : 0.28) : 0.05}
                style={{ transition: "opacity 200ms, stroke 200ms" }}
              />
            );
          })}
        </g>

        {/* Projects, inner ring */}
        <g>
          {projNodes.map((n) => {
            const lit = isLit(n.id);
            const isActive = n.id === active;
            return (
              <g
                key={n.id}
                onMouseEnter={() => setActive(n.id)}
                onClick={() => n.hasDetail && router.push(`/projects/${n.slug}`)}
                style={{
                  cursor: n.hasDetail ? "pointer" : "default",
                  transition: "opacity 200ms",
                  opacity: lit ? 1 : 0.15,
                }}
              >
                <title>{n.label}</title>
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={isActive ? 9 : 6}
                  fill={isActive ? "var(--color-primary)" : "var(--color-card)"}
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  style={{ transition: "r 180ms, fill 180ms" }}
                />
                <circle cx={n.x} cy={n.y} r={22} fill="transparent" />
              </g>
            );
          })}
        </g>

        {/* Capabilities, outer ring */}
        <g>
          {capNodes.map((n) => {
            const lit = isLit(n.id);
            const isActive = n.id === active;
            const lbl = labelFor(n);
            return (
              <g
                key={n.id}
                onMouseEnter={() => setActive(n.id)}
                style={{
                  cursor: "pointer",
                  transition: "opacity 200ms",
                  opacity: lit ? 1 : 0.18,
                }}
              >
                <title>{n.label}</title>
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={isActive ? 14 : 11}
                  fill={
                    isActive
                      ? "var(--color-primary)"
                      : "var(--color-primary-light)"
                  }
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  style={{ transition: "r 180ms, fill 180ms" }}
                />
                <text
                  x={lbl.x}
                  y={lbl.y}
                  textAnchor={lbl.anchor}
                  className="fill-[var(--color-text)] text-[13px] font-semibold"
                >
                  {n.label}
                </text>
                <circle cx={n.x} cy={n.y} r={24} fill="transparent" />
              </g>
            );
          })}
        </g>
      </svg>

      {/* One caption instead of labelling every node, which would not fit. */}
      <div className="mt-2 min-h-[3.5rem] rounded-lg border border-border bg-background px-4 py-3">
        {activeNode ? (
          <>
            <p className="text-sm font-medium text-text">
              {activeNode.label}
              <span className="tabular ml-2 text-xs font-normal text-subtle">
                {activeDegree} {activeDegree === 1 ? "connection" : "connections"}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-subtle">
              {activeCap
                ? activeCap.blurb
                : [activeNode.metric, activeNode.hasDetail && "Click to open the case study"]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
          </>
        ) : (
          <p className="text-sm text-subtle">
            Hover a node to trace its connections. Click a project to open the
            case study.
          </p>
        )}
      </div>
    </div>
  );
}
