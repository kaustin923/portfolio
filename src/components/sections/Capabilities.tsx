"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Gauge,
  Rocket,
  Search,
  Share2,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { SectionWrapper } from "@/components/layout/SectionWrapper";
import { CapabilityGraph } from "@/components/sections/CapabilityGraph";
import { capabilities } from "@/data/capabilities";
import { projects } from "@/data/projects";
import type { CapabilityId } from "@/types";

const ICONS: Record<CapabilityId, LucideIcon> = {
  "agent-orchestration": Workflow,
  "graph-architecture": Share2,
  retrieval: Search,
  evals: Gauge,
  "platform-delivery": Rocket,
  leadership: Users,
};

export function Capabilities() {
  const [active, setActive] = useState<CapabilityId>("agent-orchestration");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const current = capabilities.find((c) => c.id === active)!;
  const related = projects
    .filter((p) => p.capabilities.includes(active))
    .slice(0, 3);

  // Roving focus so the tablist behaves the way a keyboard user expects.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = capabilities.findIndex((c) => c.id === active);
    let next = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % capabilities.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (i - 1 + capabilities.length) % capabilities.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = capabilities.length - 1;
    else return;

    e.preventDefault();
    const id = capabilities[next].id;
    setActive(id);
    tabRefs.current[id]?.focus();
  };

  return (
    <SectionWrapper id="capabilities">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-text">What I build</h2>
        <p className="mt-2 max-w-2xl text-muted">
          Six things I do that are hard to fake. Pick one to see the proof and
          the work behind it.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Capabilities"
        onKeyDown={onKeyDown}
        className="mb-6 flex flex-wrap gap-2"
      >
        {capabilities.map((c) => {
          const Icon = ICONS[c.id];
          const selected = c.id === active;
          return (
            <button
              key={c.id}
              ref={(el) => {
                tabRefs.current[c.id] = el;
              }}
              role="tab"
              id={`cap-tab-${c.id}`}
              aria-selected={selected}
              aria-controls={`cap-panel-${c.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(c.id)}
              className={`focus-ring inline-flex min-h-[44px] items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-all ${
                selected
                  ? "border-primary bg-primary text-white shadow-sm"
                  : "border-border bg-card text-muted hover:border-primary/40 hover:text-primary"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {c.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          id={`cap-panel-${active}`}
          role="tabpanel"
          aria-labelledby={`cap-tab-${active}`}
          tabIndex={0}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="focus-ring rounded-2xl border border-border bg-card p-6 md:p-8"
        >
          <div className="grid gap-8 md:grid-cols-5">
            <div className="md:col-span-3">
              <p className="text-lg leading-relaxed text-text">
                {current.proof}
              </p>

              <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-subtle">
                Evidence
              </h3>
              <ul className="mt-3 space-y-2.5">
                {current.evidence.map((e) => (
                  <li key={e} className="flex gap-2.5 text-sm leading-relaxed text-muted">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="md:col-span-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-subtle">
                Where I&apos;ve done it
              </h3>
              <div className="mt-3 space-y-2">
                {related.map((p) => {
                  const card = (
                    <>
                      <span className="block text-sm font-medium text-text group-hover:text-primary">
                        {p.name}
                      </span>
                      {p.metric && (
                        <span className="tabular mt-0.5 block text-xs text-subtle">
                          {p.metric}
                        </span>
                      )}
                    </>
                  );
                  return p.detail ? (
                    <Link
                      key={p.slug}
                      href={`/projects/${p.slug}`}
                      className="focus-ring group flex items-start justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3 transition-colors hover:border-primary/40"
                    >
                      <span className="min-w-0">{card}</span>
                      <ArrowRight
                        className="mt-0.5 h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                        aria-hidden="true"
                      />
                    </Link>
                  ) : (
                    <div
                      key={p.slug}
                      className="rounded-lg border border-border bg-background px-4 py-3"
                    >
                      {card}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-6">
        <CapabilityGraph />
      </div>
    </SectionWrapper>
  );
}
