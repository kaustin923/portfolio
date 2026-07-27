"use client";

import { motion } from "framer-motion";
import { metrics } from "@/data/metrics";

export function Metrics() {
  return (
    <section
      aria-label="Key numbers"
      className="border-y border-border bg-sunken/60 px-6 py-10 md:px-12 lg:px-20"
    >
      <div className="mx-auto max-w-5xl">
        <ul className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
          {metrics.map((m, i) => (
            <motion.li
              key={m.label}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
            >
              <p className="tabular text-2xl font-bold leading-none text-primary">
                {m.value}
              </p>
              <p className="mt-2 text-sm font-medium text-text">{m.label}</p>
              {m.context && (
                <p className="mt-1 text-xs leading-snug text-subtle">
                  {m.context}
                </p>
              )}
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
