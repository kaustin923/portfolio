"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface TocItem {
  id: string;
  label: string;
}

/**
 * Sticky in-page nav. Rendered only on wide screens by the parent, so it never
 * competes with the content on smaller viewports. The only reason this is a
 * client component is the active-section highlight.
 */
export function ProjectToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");
  const ids = items.map((item) => item.id).join(",");

  useEffect(() => {
    const order = ids.split(",");
    const targets = order
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (targets.length === 0) return;

    // The observer only reports sections whose state changed, so keep a running
    // record and pick the topmost one currently inside the band.
    const intersecting = new Map<string, boolean>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          intersecting.set(entry.target.id, entry.isIntersecting);
        }
        const current = order.find((id) => intersecting.get(id));
        if (current) setActive(current);
      },
      { rootMargin: "-88px 0px -55% 0px", threshold: 0 }
    );

    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [ids]);

  return (
    <nav aria-label="On this page" className="sticky top-28">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">
        On this page
      </p>
      <ul className="mt-3 border-l border-border">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? "true" : undefined}
              className={cn(
                "focus-ring -ml-px flex min-h-[44px] items-center border-l-2 pl-4 text-sm transition-colors",
                active === item.id
                  ? "border-primary font-medium text-primary"
                  : "border-transparent text-muted hover:border-border-strong hover:text-text"
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
