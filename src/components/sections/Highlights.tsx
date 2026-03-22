"use client";

import { motion } from "framer-motion";
import { highlights } from "@/data/highlights";

function getBadge(item: { badge?: string; eventDate?: string }) {
  if (item.badge) return item.badge;
  if (!item.eventDate) return undefined;
  const now = new Date();
  const event = new Date(item.eventDate + "T23:59:59");
  return now <= event ? "Upcoming" : "Presented";
}

export function Highlights() {
  return (
    <section className="px-6 py-12 md:px-12 lg:px-20">
      <div className="mx-auto max-w-5xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {highlights.map((item, i) => {
            const badge = getBadge(item);
            return (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-text text-sm">
                  {item.title}
                </h3>
                {badge && (
                  <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                    {badge}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted mb-2">{item.subtitle}</p>
              <p className="text-sm text-muted leading-relaxed">
                {item.description}
              </p>
            </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
