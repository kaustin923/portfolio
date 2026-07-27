import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectDetail } from "@/types";

type PipelineStage = NonNullable<ProjectDetail["pipeline"]>[number];

/**
 * Renders the ordered stages of a project as a flow diagram.
 * Horizontal rail on large screens, vertical rail on everything smaller.
 * Purely presentational, so it stays a server component.
 */
export function PipelineDiagram({ stages }: { stages: PipelineStage[] }) {
  if (stages.length === 0) return null;

  const lastIndex = stages.length - 1;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 lg:px-7 lg:py-8">
      {/* Vertical stack: phones and tablets. */}
      <ol className="lg:hidden">
        {stages.map((stage, i) => (
          <li key={`${i}-${stage.stage}`} className="relative flex gap-4 pb-6 last:pb-0">
            {i < lastIndex && (
              <span
                aria-hidden
                className="absolute bottom-0 left-5 top-11 w-px bg-border-strong"
              />
            )}
            <StageBadge index={i} isLast={i === lastIndex} />
            <div className="min-w-0 pt-1">
              <p className="text-sm font-semibold text-text">{stage.stage}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {stage.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {/* Horizontal rail: desktop. */}
      <ol
        className="hidden lg:grid"
        style={{
          gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))`,
        }}
      >
        {stages.map((stage, i) => (
          <li
            key={`${i}-${stage.stage}`}
            className="relative flex flex-col items-center text-center"
          >
            <div className="relative flex h-10 w-full items-center justify-center">
              {i < lastIndex && (
                <>
                  <span
                    aria-hidden
                    className="absolute left-1/2 top-1/2 h-px w-full -translate-y-1/2 bg-border-strong"
                  />
                  <span
                    aria-hidden
                    className="absolute left-full top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-card"
                  >
                    <ChevronRight
                      className="h-4 w-4 text-primary/60"
                      strokeWidth={2.25}
                    />
                  </span>
                </>
              )}
              <StageBadge index={i} isLast={i === lastIndex} />
            </div>
            <p className="mt-4 px-2 text-[13px] font-semibold text-text">
              {stage.stage}
            </p>
            <p className="mt-1.5 px-2 text-xs leading-[1.55] text-muted">
              {stage.detail}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StageBadge({ index, isLast }: { index: number; isLast: boolean }) {
  return (
    <span
      className={cn(
        "tabular relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
        isLast
          ? "border-primary bg-primary text-white"
          : "border-primary/25 bg-primary-light text-primary"
      )}
    >
      {String(index + 1).padStart(2, "0")}
    </span>
  );
}
