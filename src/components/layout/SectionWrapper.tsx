"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface SectionWrapperProps {
  id?: string;
  children: ReactNode;
  className?: string;
}

export function SectionWrapper({ id, children, className = "" }: SectionWrapperProps) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`px-6 py-12 md:py-20 md:px-12 lg:px-20 ${className}`}
    >
      <div className="mx-auto max-w-5xl">{children}</div>
    </motion.section>
  );
}
