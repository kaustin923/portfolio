"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SectionWrapper } from "@/components/layout/SectionWrapper";
import { projects } from "@/data/projects";
import type { Project } from "@/types";

export function Projects() {
  const personal = projects.filter((p) => p.category === "personal");
  const professional = projects.filter((p) => p.category === "professional");

  return (
    <SectionWrapper id="projects">
      <h2 className="text-3xl font-bold text-text mb-8">Projects</h2>

      <h3 className="text-lg font-semibold text-text mb-4">
        Personal Projects
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
        {personal.map((project, i) => (
          <ProjectCard key={project.name} project={project} index={i} />
        ))}
      </div>

      <h3 className="text-lg font-semibold text-text mb-4">
        Professional Projects
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {professional.map((project, i) => (
          <ProjectCard key={project.name} project={project} index={i} />
        ))}
      </div>
    </SectionWrapper>
  );
}

function ProjectCard({
  project,
  index,
}: {
  project: Project;
  index: number;
}) {
  const hasDetail = !!project.detail;

  const content = (
    <>
      <h4 className="font-semibold text-text mb-2">{project.name}</h4>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {project.tech.map((t) => (
          <span
            key={t}
            className="text-xs px-2 py-0.5 rounded-full bg-primary-light text-primary font-medium"
          >
            {t}
          </span>
        ))}
      </div>
      <p className="text-sm text-muted leading-relaxed mb-3">
        {project.description}
      </p>
      <div className="flex items-center justify-between">
        {project.metric && (
          <p className="text-xs font-medium text-primary">{project.metric}</p>
        )}
        {hasDetail && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary opacity-100 sm:opacity-0 sm:group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity ml-auto">
            View Details
            <ArrowRight className="h-3 w-3" />
          </span>
        )}
      </div>
    </>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
    >
      {hasDetail ? (
        <Link
          href={`/projects/${project.slug}`}
          className="group block bg-card border border-border rounded-xl p-5 hover:shadow-md hover:border-primary/30 transition-all focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
        >
          {content}
        </Link>
      ) : (
        <div className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-shadow">
          {content}
        </div>
      )}
    </motion.div>
  );
}
