"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import type { Project } from "@/types";

export function ProjectDetailView({ project }: { project: Project }) {
  const detail = project.detail!;

  return (
    <main className="min-h-screen pt-20 pb-12 md:pt-24 md:pb-16 px-6 md:px-12 lg:px-20">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/#projects"
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-primary transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <h1 className="text-3xl font-bold text-text">{project.name}</h1>
            <span className="text-xs px-2.5 py-1 rounded-full bg-card border border-border text-muted font-medium capitalize">
              {project.category}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-8">
            {project.tech.map((t) => (
              <span
                key={t}
                className="text-xs px-2 py-0.5 rounded-full bg-primary-light text-primary font-medium"
              >
                {t}
              </span>
            ))}
          </div>

          {project.metric && (
            <p className="text-sm font-medium text-primary mb-8">
              {project.metric}
            </p>
          )}

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-text mb-4">Overview</h2>
            <div className="space-y-4">
              {detail.longDescription.split("\n\n").map((paragraph, i) => (
                <p key={i} className="text-muted leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>

          {detail.architecture && (
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-text mb-4">
                Architecture & Approach
              </h2>
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-muted leading-relaxed">
                  {detail.architecture}
                </p>
              </div>
            </section>
          )}

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-text mb-4">
              Challenges
            </h2>
            <ol className="space-y-3">
              {detail.challenges.map((challenge, i) => (
                <li key={i} className="flex gap-3 text-muted leading-relaxed">
                  <span className="text-primary font-semibold shrink-0">
                    {i + 1}.
                  </span>
                  {challenge}
                </li>
              ))}
            </ol>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-text mb-4">Outcomes</h2>
            <ul className="space-y-3">
              {detail.outcomes.map((outcome, i) => (
                <li key={i} className="flex gap-3 text-muted leading-relaxed">
                  <span className="text-primary shrink-0">&#8226;</span>
                  {outcome}
                </li>
              ))}
            </ul>
          </section>
        </motion.div>
      </div>
    </main>
  );
}
