"use client";

import { useState } from "react";
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

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-primary-light/50 transition-colors"
      >
        <span className="font-semibold text-text">{title}</span>
        <ChevronDown
          className={`h-4 w-4 text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Resume() {
  return (
    <SectionWrapper id="resume">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-bold text-text">Resume</h2>
        <a
          href="/kyle-austin-resume.pdf"
          download
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
        >
          <Download className="h-4 w-4" />
          Download PDF
        </a>
      </div>

      <div className="space-y-4">
        <CollapsibleSection title="Summary" defaultOpen>
          <p className="text-muted leading-relaxed">{resumeData.summary}</p>
        </CollapsibleSection>

        <CollapsibleSection title="Technical Skills" defaultOpen>
          <div className="space-y-3">
            {resumeData.skills.map((skill) => (
              <div key={skill.category}>
                <span className="text-sm font-medium text-text">
                  {skill.category}:
                </span>{" "}
                <span className="text-sm text-muted">{skill.items}</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Experience" defaultOpen>
          <div className="space-y-8">
            {resumeData.experience.map((exp) => (
              <div key={`${exp.title}-${exp.company}`}>
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 mb-3">
                  <div>
                    <span className="font-medium text-text">{exp.title}</span>
                    <span className="text-muted">, {exp.company}</span>
                  </div>
                  <span className="text-sm text-muted shrink-0">
                    {exp.period}
                  </span>
                </div>
                <ul className="space-y-2">
                  {exp.bullets.map((bullet, i) => (
                    <li
                      key={i}
                      className="text-sm text-muted leading-relaxed pl-4 relative before:content-[''] before:absolute before:left-0 before:top-[0.6em] before:w-1.5 before:h-1.5 before:rounded-full before:bg-primary/30"
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
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-medium text-text">{proj.name}</span>
                  <span className="text-xs text-muted">({proj.tech})</span>
                </div>
                <p className="text-sm text-muted leading-relaxed">
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
            <p className="text-sm text-muted mt-1">
              {resumeData.education.details}
            </p>
          </div>
        </CollapsibleSection>
      </div>
    </SectionWrapper>
  );
}
