"use client";

import { motion } from "framer-motion";
import { ArrowDown, Download, MessageSquare, Award } from "lucide-react";
import Image from "next/image";

const PROOF = [
  { label: "$1.5M platform", detail: "5 engineers, 2 shores" },
  { label: "54% → 99%", detail: "AI adoption, 500+ people" },
  { label: "92% accuracy", detail: "RAG tool, 20+ engagements" },
];

export function Hero() {
  return (
    <section className="relative flex min-h-[86vh] items-center justify-center overflow-hidden px-6 pb-14 pt-20 md:min-h-[94vh] md:pt-24">
      {/* Animated gradient mesh background */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-1/4 -left-1/4 h-[300px] w-[300px] rounded-full opacity-[0.07] sm:h-[600px] sm:w-[600px]"
          style={{
            background: "radial-gradient(circle, #2D5A3D 0%, transparent 70%)",
            animation: "gradient-drift 20s ease-in-out infinite",
          }}
        />
        <div
          className="absolute -bottom-1/4 -right-1/4 h-[250px] w-[250px] rounded-full opacity-[0.06] sm:h-[500px] sm:w-[500px]"
          style={{
            background: "radial-gradient(circle, #C8965A 0%, transparent 70%)",
            animation: "gradient-drift 25s ease-in-out infinite reverse",
          }}
        />
        <div
          className="absolute top-1/3 right-1/4 h-[200px] w-[200px] rounded-full opacity-[0.04] sm:h-[400px] sm:w-[400px]"
          style={{
            background: "radial-gradient(circle, #2D5A3D 0%, transparent 70%)",
            animation: "gradient-drift 18s ease-in-out infinite 5s",
          }}
        />
      </div>

      <div className="relative z-10 flex max-w-3xl flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="relative"
        >
          <Image
            src="/headshot.jpg"
            alt="Kyle Austin"
            width={132}
            height={132}
            className="h-[104px] w-[104px] rounded-full border-4 border-primary/15 object-cover shadow-lg ring-1 ring-border sm:h-[132px] sm:w-[132px]"
            preload
          />
        </motion.div>

        <motion.a
          href="#recognition"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="focus-ring mt-6 flex max-w-full flex-col items-center gap-x-2.5 gap-y-0.5 rounded-2xl border border-accent/30 bg-accent-light px-4 py-2 transition-colors hover:border-accent/60 sm:flex-row sm:rounded-full"
        >
          <span className="flex items-center gap-2">
            <Award
              className="h-4 w-4 shrink-0 text-accent"
              aria-hidden="true"
            />
            <span className="text-sm font-semibold text-accent">
              [A]mplify [I]mpact Luminary Award
            </span>
          </span>
          <span
            className="hidden h-3.5 w-px bg-accent/30 sm:block"
            aria-hidden="true"
          />
          <span className="text-xs text-accent">
            PwC&apos;s highest AI honor. 1 of 9 across PwC US.
          </span>
        </motion.a>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.18 }}
          className="mt-4 text-4xl font-bold tracking-tight text-text sm:text-5xl md:text-6xl"
        >
          Kyle Austin
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.28 }}
          className="mt-3 text-lg font-medium text-primary md:text-xl"
        >
          Forward-Deployed Engineer &amp; Solutions Architect
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.38 }}
          className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg"
        >
          I&apos;m a player-coach. I lead a five-developer team building AI for
          Fortune 500 clients, and I still write code every day. I like the
          problems where the answer has to be right: cost and schedule
          forecasting, decarbonization, regulated reporting.
        </motion.p>

        {/* Proof strip */}
        <motion.ul
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.48 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2"
        >
          {PROOF.map((item) => (
            <li
              key={item.label}
              className="rounded-lg border border-border bg-card/70 px-3 py-2 text-left backdrop-blur-sm"
            >
              <span className="tabular block text-sm font-semibold text-text">
                {item.label}
              </span>
              <span className="block text-xs text-subtle">{item.detail}</span>
            </li>
          ))}
        </motion.ul>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.58 }}
          className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row"
        >
          <a
            href="#capabilities"
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-white transition-colors hover:bg-primary-hover sm:w-auto"
          >
            See what I build
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("portfolio:open-chat"))
            }
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-3 font-medium text-text transition-colors hover:border-primary hover:text-primary sm:w-auto"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Ask about my work
          </button>
          <a
            href="/kyle-austin-resume.pdf"
            download
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium text-muted transition-colors hover:text-primary sm:w-auto"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Resume
          </a>
        </motion.div>
      </div>
    </section>
  );
}
