"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Star, X } from "lucide-react";
import { SectionWrapper } from "@/components/layout/SectionWrapper";
import { capabilities } from "@/data/capabilities";
import { projects } from "@/data/projects";
import type { CapabilityId, Lens, Project } from "@/types";

type LensFilter = "all" | Lens;

const LENS_TABS: { id: LensFilter; label: string; hint: string }[] = [
  { id: "all", label: "All work", hint: "Everything, most significant first" },
  { id: "build", label: "Hands on", hint: "Work where I wrote the code" },
  { id: "lead", label: "Leading", hint: "Work where I ran the team or the program" },
];

/** Spotlight first, then client work, then personal. */
function rank(p: Project): number {
  if (p.spotlight) return 0;
  return p.category === "professional" ? 1 : 2;
}

export function Projects() {
  const [lens, setLens] = useState<LensFilter>("all");
  const [capability, setCapability] = useState<CapabilityId | null>(null);

  const visible = useMemo(() => {
    return projects
      .filter((p) => (lens === "all" ? true : p.lens.includes(lens)))
      .filter((p) => (capability ? p.capabilities.includes(capability) : true))
      .sort((a, b) => rank(a) - rank(b));
  }, [lens, capability]);

  const activeCapability = capabilities.find((c) => c.id === capability);

  return (
    <SectionWrapper id="projects">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-text">Selected work</h2>
          <p className="mt-2 max-w-2xl text-muted">
            Client platforms and things I built on my own time. Filter by how I
            worked on it, or by capability.
          </p>
        </div>
        <p className="tabular text-sm text-subtle" aria-live="polite">
          {visible.length} {visible.length === 1 ? "project" : "projects"}
        </p>
      </div>

      {/* Lens tabs */}
      <div
        role="tablist"
        aria-label="Filter by involvement"
        className="mb-3 inline-flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1"
      >
        {LENS_TABS.map((t) => {
          const selected = lens === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={selected}
              title={t.hint}
              onClick={() => setLens(t.id)}
              className={`focus-ring min-h-[40px] rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                selected
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted hover:text-primary"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Capability filter */}
      <div className="mb-8 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-subtle">
          Capability
        </span>
        {capabilities.map((c) => {
          const selected = capability === c.id;
          return (
            <button
              key={c.id}
              aria-pressed={selected}
              onClick={() => setCapability(selected ? null : c.id)}
              className={`focus-ring rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                selected
                  ? "border-primary bg-primary-light text-primary"
                  : "border-border bg-card text-muted hover:border-primary/40 hover:text-primary"
              }`}
            >
              {c.label}
            </button>
          );
        })}
        {capability && (
          <button
            onClick={() => setCapability(null)}
            className="focus-ring inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-medium text-subtle hover:text-primary"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Clear
          </button>
        )}
      </div>

      {activeCapability && (
        <p className="mb-6 rounded-lg border border-border bg-primary-light/40 px-4 py-3 text-sm text-muted">
          <span className="font-medium text-text">
            {activeCapability.label}:
          </span>{" "}
          {activeCapability.blurb}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {visible.map((project) => (
            <motion.div
              key={project.slug}
              layout
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              <ProjectCard project={project} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {visible.length === 0 && (
        <p className="rounded-xl border border-dashed border-border py-12 text-center text-muted">
          Nothing matches that combination. Try clearing a filter.
        </p>
      )}
    </SectionWrapper>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const hasDetail = !!project.detail;

  const content = (
    <>
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="font-semibold text-text group-hover:text-primary">
          {project.name}
        </h3>
        <div className="flex shrink-0 items-center gap-1.5">
          {project.spotlight && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-light px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
              <Star className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
              Flagship
            </span>
          )}
          {project.category === "personal" && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">
              Personal
            </span>
          )}
        </div>
      </div>

      {(project.role || project.period) && (
        <p className="mb-3 text-xs text-subtle">
          {[project.role, project.period].filter(Boolean).join(" · ")}
        </p>
      )}

      <div className="mb-3 flex flex-wrap gap-1.5">
        {project.tech.map((t) => (
          <span
            key={t}
            className="rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-primary"
          >
            {t}
          </span>
        ))}
      </div>

      <p className="mb-3 text-sm leading-relaxed text-muted">
        {project.description}
      </p>

      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        {project.metric && (
          <p className="tabular text-xs font-medium text-primary">
            {project.metric}
          </p>
        )}
        {hasDetail && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 group-focus-visible:opacity-100">
            Case study
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </span>
        )}
      </div>
    </>
  );

  const shell =
    "group flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-all";

  return hasDetail ? (
    <Link
      href={`/projects/${project.slug}`}
      className={`${shell} focus-ring hover:border-primary/30 hover:shadow-md`}
    >
      {content}
    </Link>
  ) : (
    <div className={`${shell} hover:shadow-md`}>{content}</div>
  );
}
