"use client";

import { SectionWrapper } from "@/components/layout/SectionWrapper";
import { Mail, Linkedin, MapPin } from "lucide-react";

export function About() {
  return (
    <SectionWrapper id="about">
      <h2 className="text-3xl font-bold text-text mb-8">About</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-4 text-muted leading-relaxed">
          <p>
            I&apos;m a solutions engineer who builds and sells AI systems.
            Manager at PwC, where I co-founded our practice&apos;s AI
            Transformation Office. I build prototypes, present them to
            executives, and scale what works.
          </p>

          <p>
            <span className="font-semibold text-text">Industries:</span>{" "}
            energy and utilities, financial services, food and beverage. Over
            20 engagements across Fortune 500 clients, with $325K in
            business won through hands-on demos and rapid prototyping.
          </p>

          <p>
            <span className="font-semibold text-text">Results:</span> grew
            AI adoption from 54% to 89% across a 500+ person practice by
            reworking service delivery and running hands-on training.
          </p>

          <p>
            <span className="font-semibold text-text">Tools I work with:</span>
          </p>
          <ul className="list-disc list-inside space-y-1 ml-1">
            <li>Python, TypeScript, SQL</li>
            <li>Claude Code, Azure OpenAI, AWS Bedrock</li>
            <li>RAG pipelines, embeddings, eval frameworks</li>
            <li>Next.js, Tailwind, Vercel</li>
          </ul>

          <p>
            Python is my primary language. Claude Code is my primary build
            tool. Everything on this site was built with it.
          </p>
        </div>
        <div className="space-y-4">
          <a
            href="mailto:kaustin923@gmail.com"
            className="flex items-center gap-3 text-sm text-muted hover:text-primary transition-colors"
          >
            <Mail className="h-4 w-4 shrink-0" />
            kaustin923@gmail.com
          </a>
          <a
            href="https://linkedin.com/in/kyle-austin-83909512b"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 text-sm text-muted hover:text-primary transition-colors"
          >
            <Linkedin className="h-4 w-4 shrink-0" />
            LinkedIn
          </a>
          <div className="flex items-center gap-3 text-sm text-muted">
            <MapPin className="h-4 w-4 shrink-0" />
            Cherry Hill, NJ
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
