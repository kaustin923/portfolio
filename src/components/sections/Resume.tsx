"use client";

import { useId, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, ChevronDown } from "lucide-react";
import { SectionWrapper } from "@/components/layout/SectionWrapper";
import { resumeData } from "@/data/resume";

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
        className="focus-ring flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-primary-light/50"
      >
        <span className="font-semibold text-text">{title}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-5 pb-5 pt-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Resume() {
  return (
    <SectionWrapper id="resume">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-text">Resume</h2>
          <p className="mt-2 text-muted">
            The full version. Everything here is also in the PDF.
          </p>
        </div>
        <a
          href="/kyle-austin-resume.pdf"
          download
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download PDF
        </a>
      </div>

      <div className="space-y-3">
        <CollapsibleSection title="Summary" defaultOpen>
          <p className="max-w-3xl leading-relaxed text-muted">
            {resumeData.summary}
          </p>
        </CollapsibleSection>

        <CollapsibleSection title="Technical Skills" defaultOpen>
          <div className="space-y-4">
            {resumeData.skills.map((skill) => (
              <div key={skill.category}>
                <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
                  {skill.category}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {skill.items}
                </p>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Experience" defaultOpen>
          <div className="space-y-8">
            {resumeData.experience.map((exp) => (
              <div key={`${exp.title}-${exp.company}-${exp.period}`}>
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <div>
                    <span className="font-semibold text-text">{exp.title}</span>
                    <span className="text-muted">, {exp.company}</span>
                  </div>
                  <span className="shrink-0 text-sm text-subtle">
                    {exp.period}
                  </span>
                </div>
                <ul className="space-y-2">
                  {exp.bullets.map((bullet, i) => (
                    <li
                      key={i}
                      className="relative pl-4 text-sm leading-relaxed text-muted before:absolute before:left-0 before:top-[0.6em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-primary/40 before:content-['']"
                    >
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Personal Projects">
          <div className="space-y-4">
            {resumeData.personalProjects.map((proj) => (
              <div key={proj.name}>
                <div className="mb-1 flex flex-wrap items-baseline gap-2">
                  <span className="font-medium text-text">{proj.name}</span>
                  <span className="text-xs text-subtle">({proj.tech})</span>
                </div>
                <p className="text-sm leading-relaxed text-muted">
                  {proj.description}
                </p>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Education">
          <div>
            <span className="font-medium text-text">
              {resumeData.education.degree}
            </span>
            <span className="text-muted">
              , {resumeData.education.school}, {resumeData.education.year}
            </span>
            <p className="mt-1 text-sm text-subtle">
              {resumeData.education.details}
            </p>
          </div>
        </CollapsibleSection>
      </div>
    </SectionWrapper>
  );
}
