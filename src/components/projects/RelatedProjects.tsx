import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getProjectsByCapability } from "@/data/projects";
import { capabilityMap } from "@/data/capabilities";
import type { CapabilityId, Project } from "@/types";

interface RelatedMatch {
  project: Project;
  shared: CapabilityId[];
}

/**
 * Other projects that share at least one capability with the current one,
 * ranked by how many capabilities overlap.
 */
function findRelated(project: Project, limit: number): RelatedMatch[] {
  const matches = new Map<string, RelatedMatch>();

  for (const id of project.capabilities) {
    for (const candidate of getProjectsByCapability(id)) {
      if (candidate.slug === project.slug || !candidate.detail) continue;

      const existing = matches.get(candidate.slug);
      if (existing) {
        existing.shared.push(id);
      } else {
        matches.set(candidate.slug, { project: candidate, shared: [id] });
      }
    }
  }

  return [...matches.values()]
    .sort(
      (a, b) =>
        b.shared.length - a.shared.length ||
        Number(Boolean(b.project.spotlight)) -
          Number(Boolean(a.project.spotlight))
    )
    .slice(0, limit);
}

export function RelatedProjects({ project }: { project: Project }) {
  const related = findRelated(project, 3);
  if (related.length === 0) return null;

  return (
    <section aria-labelledby="related-projects" className="scroll-mt-28">
      <div className="flex items-center gap-3">
        <h2 id="related-projects" className="text-lg font-semibold text-text">
          Related work
        </h2>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
      <p className="mt-2 text-sm text-muted">
        Other projects that use the same capabilities.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {related.map(({ project: match, shared }) => (
          <Link
            key={match.slug}
            href={`/projects/${match.slug}`}
            className="focus-ring group flex flex-col rounded-2xl border border-border bg-card p-5 transition-all hover:border-primary/35 hover:shadow-md"
          >
            <div className="flex flex-wrap gap-1.5">
              {shared.map((id) => (
                <span
                  key={id}
                  className="rounded-full bg-primary-light px-2 py-0.5 text-[11px] font-medium text-primary"
                >
                  {capabilityMap[id].label}
                </span>
              ))}
            </div>

            <h3 className="mt-3 font-semibold text-text transition-colors group-hover:text-primary">
              {match.name}
            </h3>
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">
              {match.description}
            </p>

            {match.metric && (
              <p className="tabular mt-3 text-xs font-medium text-primary">
                {match.metric}
              </p>
            )}

            <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary">
              View project
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
