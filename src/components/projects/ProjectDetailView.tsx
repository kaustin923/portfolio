import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { CapabilityChips } from "@/components/projects/CapabilityChips";
import { PipelineDiagram } from "@/components/projects/PipelineDiagram";
import { ProjectPager } from "@/components/projects/ProjectPager";
import { ProjectToc, type TocItem } from "@/components/projects/ProjectToc";
import { RelatedProjects } from "@/components/projects/RelatedProjects";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";

const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle";

interface Fact {
  label: string;
  value: string;
  emphasize?: boolean;
}

/**
 * Case study page for a single project. Server rendered end to end. The only
 * client boundary is the sticky in-page nav, which is desktop only.
 */
export function ProjectDetailView({ project }: { project: Project }) {
  const detail = project.detail;
  if (!detail) return null;

  const pipeline = detail.pipeline;
  const paragraphs = detail.longDescription
    .split("\n\n")
    .map((p) => p.trim())
    .filter(Boolean);

  const sections: TocItem[] = [
    { id: "overview", label: "Overview" },
    ...(detail.architecture
      ? [{ id: "architecture", label: "Architecture" }]
      : []),
    ...(pipeline && pipeline.length > 0
      ? [{ id: "pipeline", label: "Pipeline" }]
      : []),
    { id: "challenges", label: "Challenges" },
    { id: "outcomes", label: "Outcomes" },
  ];

  const facts: Fact[] = [];
  if (project.role) facts.push({ label: "Role", value: project.role });
  if (project.period) facts.push({ label: "Timeline", value: project.period });
  if (project.metric)
    facts.push({ label: "Headline", value: project.metric, emphasize: true });

  const factColumns =
    facts.length >= 3
      ? "sm:grid-cols-3"
      : facts.length === 2
        ? "sm:grid-cols-2"
        : "sm:grid-cols-1";

  return (
    <main className="min-h-screen px-6 pb-16 pt-20 md:px-12 md:pb-24 md:pt-24 lg:px-20">
      <div className="mx-auto max-w-5xl xl:grid xl:grid-cols-[minmax(0,1fr)_10rem] xl:gap-10">
        <div className="min-w-0">
          <Link
            href="/#projects"
            className="focus-ring -ml-1 inline-flex min-h-[44px] items-center gap-2 px-1 text-sm text-muted transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>

          {/* Header */}
          <header className="mt-4">
            <div
              className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-2",
                EYEBROW
              )}
            >
              <span className="capitalize">{project.category}</span>
              {project.spotlight && (
                <>
                  <span
                    aria-hidden
                    className="h-1 w-1 rounded-full bg-border-strong"
                  />
                  <span className="text-accent">Spotlight</span>
                </>
              )}
            </div>

            <h1 className="mt-3 text-3xl font-bold leading-tight text-text sm:text-4xl">
              {project.name}
            </h1>

            <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-muted">
              {project.description}
            </p>

            {facts.length > 0 && (
              <dl
                className={cn(
                  "mt-8 grid gap-px overflow-hidden rounded-2xl border border-border bg-border",
                  factColumns
                )}
              >
                {facts.map((fact) => (
                  <div key={fact.label} className="bg-card px-5 py-4">
                    <dt className={EYEBROW}>{fact.label}</dt>
                    <dd
                      className={cn(
                        "mt-1.5 text-sm leading-relaxed",
                        fact.emphasize
                          ? "tabular font-semibold text-primary"
                          : "text-text"
                      )}
                    >
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-8">
              <h2 className={EYEBROW}>Stack</h2>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {project.tech.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-primary-light px-2.5 py-1 text-xs font-medium text-primary"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {project.capabilities.length > 0 && (
              <div className="mt-7">
                <h2 className={EYEBROW}>Capabilities demonstrated</h2>
                <div className="mt-2.5">
                  <CapabilityChips ids={project.capabilities} />
                </div>
              </div>
            )}
          </header>

          <hr className="mt-10 border-border" />

          {/* Body */}
          <div className="mt-10 space-y-14">
            <section id="overview" className="scroll-mt-4">
              <SectionHeading>Overview</SectionHeading>
              <div className="mt-5 max-w-[70ch] space-y-5">
                {paragraphs.map((paragraph, i) => (
                  <p
                    key={i}
                    className="text-[17px] leading-[1.75] text-muted"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>

            {detail.architecture && (
              <section id="architecture" className="scroll-mt-4">
                <SectionHeading>Architecture</SectionHeading>
                <div className="mt-5 max-w-[70ch] rounded-2xl border border-border bg-sunken p-5 sm:p-6">
                  <p className="text-[15px] leading-[1.75] text-muted">
                    {detail.architecture}
                  </p>
                </div>
              </section>
            )}

            {pipeline && pipeline.length > 0 && (
              <section id="pipeline" className="scroll-mt-4">
                <SectionHeading>Pipeline</SectionHeading>
                <p className="mt-2 text-sm text-muted">
                  How work moves through the system, in order.
                </p>
                <div className="mt-5">
                  <PipelineDiagram stages={pipeline} />
                </div>
              </section>
            )}

            <section id="challenges" className="scroll-mt-4">
              <SectionHeading>Challenges</SectionHeading>
              <ol className="mt-5 max-w-[70ch] space-y-4">
                {detail.challenges.map((challenge, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="tabular mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sunken text-xs font-semibold text-muted">
                      {i + 1}
                    </span>
                    <span className="text-[15px] leading-[1.7] text-muted">
                      {challenge}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <section id="outcomes" className="scroll-mt-4">
              <SectionHeading>Outcomes</SectionHeading>
              <ul className="mt-5 max-w-[70ch] space-y-3.5 rounded-2xl border border-primary/15 bg-primary-light/50 p-5 sm:p-6">
                {detail.outcomes.map((outcome, i) => (
                  <li key={i} className="flex gap-3">
                    <Check
                      aria-hidden
                      className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                      strokeWidth={2.5}
                    />
                    <span className="text-[15px] leading-[1.7] text-muted">
                      {outcome}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="mt-16 space-y-12">
            <RelatedProjects project={project} />
            <ProjectPager project={project} />
          </div>
        </div>

        <aside className="hidden xl:block">
          <ProjectToc items={sections} />
        </aside>
      </div>
    </main>
  );
}

function SectionHeading({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-lg font-semibold text-text">{children}</h2>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}
