"use client";

import { Mail, Linkedin, MapPin, FileText } from "lucide-react";
import { SectionWrapper } from "@/components/layout/SectionWrapper";

const FACTS = [
  { label: "Now", value: "Manager at PwC, Tier 1 rated all four years" },
  { label: "Before", value: "Pricing Analyst at Progressive, $680M in premium" },
  { label: "Studied", value: "BBA Economics, Kent State. Not a CS grad" },
  { label: "Industries", value: "Energy, financial services, consumer products, insurance, capital projects" },
];

export function About() {
  return (
    <SectionWrapper id="about">
      <h2 className="mb-8 text-3xl font-bold text-text">About</h2>

      <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
        <div className="space-y-4 leading-relaxed text-muted md:col-span-2">
          <p>
            I work like a forward-deployed engineer. I go to the client, figure
            out what they actually need, and get something real in front of them
            fast. On the capital project engagement that meant working software
            in about 3 weeks, shipped as a single HTML file with the
            calculations embedded, while we worked with their IT to deploy it
            properly. That bought the trust to build the rest.
          </p>

          <p>
            The part I care about is the architecture underneath. Knowledge
            graphs when the question is about relationships and lineage. Agent
            orchestration when the work is repetitive and the source of truth
            already exists somewhere. Retrieval when the answer is buried in
            documents nobody wants to read. I pick the shape that fits the
            problem, then measure whether it actually works.
          </p>

          <p>
            I lead a 5-developer team across two shores and I still write code.
            That is deliberate. It means I can validate an estimate or an
            architecture because I could do the work myself. I also spend real
            time lifting the people around me, which is what the Luminary award
            was actually for.
          </p>

          <p>
            Python is my primary language. Claude Code is my primary build tool.
            This site was built with it.
          </p>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 pt-4 sm:grid-cols-2">
            {FACTS.map((f) => (
              <div key={f.label}>
                <dt className="text-xs font-semibold uppercase tracking-wider text-subtle">
                  {f.label}
                </dt>
                <dd className="mt-0.5 text-sm text-text">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-subtle">
              Get in touch
            </h3>
            <div className="space-y-1">
              <a
                href="mailto:kaustin923@gmail.com"
                className="focus-ring flex items-center gap-3 py-1.5 text-sm text-muted transition-colors hover:text-primary"
              >
                <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                kaustin923@gmail.com
              </a>
              <a
                href="https://linkedin.com/in/kyle-austin-83909512b"
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring flex items-center gap-3 py-1.5 text-sm text-muted transition-colors hover:text-primary"
              >
                <Linkedin className="h-4 w-4 shrink-0" aria-hidden="true" />
                LinkedIn
              </a>
              <a
                href="/kyle-austin-resume.pdf"
                download
                className="focus-ring flex items-center gap-3 py-1.5 text-sm text-muted transition-colors hover:text-primary"
              >
                <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                Download resume
              </a>
              <p className="flex items-center gap-3 py-1.5 text-sm text-muted">
                <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                Cherry Hill, NJ
              </p>
            </div>
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
