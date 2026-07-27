"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSectionInView } from "@/hooks/use-section-in-view";

const NAV_LINKS = [
  { label: "What I build", href: "#capabilities" },
  { label: "Work", href: "#projects" },
  { label: "About", href: "#about" },
  { label: "Resume", href: "#resume" },
] as const;

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const activeSection = useSectionInView();
  const pathname = usePathname();
  const isHome = pathname === "/";

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Escape closes the mobile menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <nav
      aria-label="Main"
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        scrolled || menuOpen
          ? "border-b border-border bg-background/85 shadow-sm backdrop-blur-md"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 md:px-12 lg:px-20">
        <Link
          href="/"
          className="focus-ring text-lg font-semibold tracking-tight text-primary"
        >
          Kyle Austin
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map(({ label, href }) => {
            const resolvedHref = isHome ? href : `/${href}`;
            const active = isHome && activeSection === href.slice(1);
            return (
              <Link
                key={href}
                href={resolvedHref}
                aria-current={active ? "true" : undefined}
                className={`focus-ring relative text-sm font-medium transition-colors ${
                  active ? "text-primary" : "text-muted hover:text-primary"
                }`}
              >
                {label}
                {active && (
                  <span
                    className="absolute -bottom-1.5 left-0 right-0 h-0.5 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                )}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("portfolio:open-chat"))
            }
            className="focus-ring rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-primary hover:text-primary"
          >
            Ask AI
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="focus-ring flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1.5 p-2 md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          <span
            className={`block h-0.5 w-5 bg-text transition-transform ${
              menuOpen ? "translate-y-2 rotate-45" : ""
            }`}
          />
          <span
            className={`block h-0.5 w-5 bg-text transition-opacity ${
              menuOpen ? "opacity-0" : ""
            }`}
          />
          <span
            className={`block h-0.5 w-5 bg-text transition-transform ${
              menuOpen ? "-translate-y-2 -rotate-45" : ""
            }`}
          />
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-b border-border bg-background/95 px-6 pb-4 backdrop-blur-md md:hidden">
          {NAV_LINKS.map(({ label, href }) => {
            const resolvedHref = isHome ? href : `/${href}`;
            return (
              <Link
                key={href}
                href={resolvedHref}
                className="focus-ring block py-3 text-sm font-medium text-muted hover:text-primary"
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              window.dispatchEvent(new CustomEvent("portfolio:open-chat"));
            }}
            className="focus-ring block w-full py-3 text-left text-sm font-medium text-muted hover:text-primary"
          >
            Ask AI about my work
          </button>
        </div>
      )}
    </nav>
  );
}
