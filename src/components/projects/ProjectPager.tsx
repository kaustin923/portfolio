import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { projects } from "@/data/projects";
import type { Project } from "@/types";

/** Previous and next project, in the order they are listed in the data file. */
export function ProjectPager({ project }: { project: Project }) {
  const index = projects.findIndex((p) => p.slug === project.slug);
  if (index === -1) return null;

  const previous = index > 0 ? projects[index - 1] : null;
  const next = index < projects.length - 1 ? projects[index + 1] : null;
  if (!previous && !next) return null;

  return (
    <nav
      aria-label="Previous and next project"
      className="grid gap-3 sm:grid-cols-2"
    >
      {previous ? (
        <PagerLink project={previous} direction="previous" />
      ) : (
        <span className="hidden sm:block" aria-hidden />
      )}
      {next && <PagerLink project={next} direction="next" />}
    </nav>
  );
}

function PagerLink({
  project,
  direction,
}: {
  project: Project;
  direction: "previous" | "next";
}) {
  const isNext = direction === "next";

  return (
    <Link
      href={`/projects/${project.slug}`}
      className={`focus-ring group flex min-h-[44px] flex-col justify-center rounded-2xl border border-border bg-card px-5 py-4 transition-all hover:border-primary/35 hover:shadow-md ${
        isNext ? "sm:items-end sm:text-right" : ""
      }`}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">
        {!isNext && (
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
        )}
        {isNext ? "Next project" : "Previous project"}
        {isNext && (
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        )}
      </span>
      <span className="mt-1.5 font-semibold text-text transition-colors group-hover:text-primary">
        {project.name}
      </span>
    </Link>
  );
}
