"use client";

import { motion } from "framer-motion";
import { ArrowDown, Download } from "lucide-react";
import Image from "next/image";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-6">
      {/* Animated gradient mesh background */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-1/4 -left-1/4 w-[300px] h-[300px] sm:w-[600px] sm:h-[600px] rounded-full opacity-[0.07]"
          style={{
            background: "radial-gradient(circle, #2D5A3D 0%, transparent 70%)",
            animation: "gradient-drift 20s ease-in-out infinite",
          }}
        />
        <div
          className="absolute -bottom-1/4 -right-1/4 w-[250px] h-[250px] sm:w-[500px] sm:h-[500px] rounded-full opacity-[0.05]"
          style={{
            background: "radial-gradient(circle, #C8965A 0%, transparent 70%)",
            animation: "gradient-drift 25s ease-in-out infinite reverse",
          }}
        />
        <div
          className="absolute top-1/3 right-1/4 w-[200px] h-[200px] sm:w-[400px] sm:h-[400px] rounded-full opacity-[0.04]"
          style={{
            background: "radial-gradient(circle, #2D5A3D 0%, transparent 70%)",
            animation: "gradient-drift 18s ease-in-out infinite 5s",
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center max-w-3xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        >
          <Image
            src="/headshot.jpg"
            alt="Kyle Austin"
            width={160}
            height={160}
            className="rounded-full border-4 border-primary/20 shadow-lg mb-8"
            priority
          />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="text-5xl md:text-6xl font-bold text-text tracking-tight"
        >
          Kyle Austin
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-4 text-xl md:text-2xl font-medium text-primary"
        >
          AI Solutions Engineer
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="mt-6 text-lg text-muted max-w-2xl leading-relaxed"
        >
          I build AI systems that ship. RAG pipelines, eval frameworks, rapid
          prototypes. Six years turning Fortune 500 companies from AI-curious to
          AI-adopted.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-10 flex flex-col sm:flex-row gap-4"
        >
          <a
            href="#projects"
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary-hover transition-colors"
          >
            See My Work
            <ArrowDown className="h-4 w-4" />
          </a>
          <a
            href="/kyle-austin-resume.pdf"
            download
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 border border-border rounded-lg font-medium text-text hover:border-primary hover:text-primary transition-colors"
          >
            Download Resume
            <Download className="h-4 w-4" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
