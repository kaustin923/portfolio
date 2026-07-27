"use client";

import { useEffect, useState } from "react";

const SECTIONS = ["capabilities", "projects", "about", "resume"] as const;
export type SectionId = (typeof SECTIONS)[number];

export function useSectionInView() {
  const [activeSection, setActiveSection] = useState<SectionId | null>(null);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    SECTIONS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveSection(id);
          }
        },
        { rootMargin: "-40% 0px -40% 0px", threshold: 0 }
      );

      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  return activeSection;
}
