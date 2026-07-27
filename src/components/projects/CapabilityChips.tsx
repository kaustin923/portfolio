import Link from "next/link";
import { capabilityMap } from "@/data/capabilities";
import type { CapabilityId } from "@/types";

/**
 * The capabilities a project demonstrates. Each chip links back to the
 * capability section on the homepage.
 */
export function CapabilityChips({ ids }: { ids: CapabilityId[] }) {
  if (ids.length === 0) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {ids.map((id) => {
        const capability = capabilityMap[id];
        if (!capability) return null;

        return (
          <Link
            key={id}
            href="/#capabilities"
            title={capability.blurb}
            className="focus-ring group flex min-h-[44px] flex-col justify-center rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-primary-light"
          >
            <span className="text-sm font-semibold text-text transition-colors group-hover:text-primary">
              {capability.label}
            </span>
            <span className="mt-0.5 text-xs leading-snug text-muted">
              {capability.blurb}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
