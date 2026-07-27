"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Award } from "lucide-react";
import { SectionWrapper } from "@/components/layout/SectionWrapper";
import { highlights } from "@/data/highlights";

function getBadge(item: { badge?: string; eventDate?: string }) {
  if (item.badge) return item.badge;
  if (!item.eventDate) return undefined;
  const now = new Date();
  const event = new Date(item.eventDate + "T23:59:59");
  return now <= event ? "Upcoming" : "Presented";
}

export function Highlights() {
  const featured = highlights.find((h) => h.featured);
  const rest = highlights.filter((h) => !h.featured);

  return (
    <SectionWrapper id="recognition">
      <h2 className="mb-2 text-3xl font-bold text-text">Recognition</h2>
      <p className="mb-8 max-w-2xl text-muted">
        Awards, talks, and the practice-wide work behind them.
      </p>

      {featured && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-4 rounded-xl border border-accent/30 bg-accent-light/60 p-6"
        >
          <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
            <h3 className="flex items-start gap-2.5 text-lg font-semibold text-text">
              <Award
                className="mt-0.5 h-5 w-5 shrink-0 text-accent"
                aria-hidden="true"
              />
              {featured.title}
            </h3>
            <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
              {featured.badge ?? "Award"}
            </span>
          </div>
          <p className="mb-2 text-xs text-subtle">{featured.subtitle}</p>
          <p className="max-w-3xl leading-relaxed text-muted">
            {featured.description}
          </p>
        </motion.div>
      )}

      <div className="grid gap-4 md:grid-cols-5">
        <motion.figure
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="flex flex-col overflow-hidden rounded-xl border border-border bg-card md:col-span-2"
        >
          {/* Fills whatever height the column beside it ends up being. */}
          <div className="relative min-h-[13rem] flex-1">
            <Image
              src="/speaking.jpg"
              alt="Kyle Austin presenting a briefing on large-load regulatory response at a conference"
              fill
              sizes="(max-width: 768px) 100vw, 40vw"
              className="object-cover"
            />
          </div>
          <figcaption className="border-t border-border px-4 py-3">
            <p className="text-sm font-medium text-text">
              Speaking to regulators and executives
            </p>
            <p className="mt-0.5 text-xs text-subtle">
              On AI, data centers, and large load rate impacts.
            </p>
          </figcaption>
        </motion.figure>

        <div className="space-y-4 md:col-span-3">
          {rest.map((item, i) => {
            const badge = getBadge(item);
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.12 + i * 0.07 }}
                className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md"
              >
                <div className="mb-1.5 flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-text">{item.title}</h3>
                  {badge && (
                    <span className="shrink-0 rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-primary">
                      {badge}
                    </span>
                  )}
                </div>
                <p className="mb-2 text-xs text-subtle">{item.subtitle}</p>
                <p className="text-sm leading-relaxed text-muted">
                  {item.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </SectionWrapper>
  );
}
