import Link from "next/link";
import { Linkedin, Mail, FileText } from "lucide-react";

const SECTIONS = [
  { label: "What I build", href: "/#capabilities" },
  { label: "Work", href: "/#projects" },
  { label: "About", href: "/#about" },
  { label: "Resume", href: "/#resume" },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-sunken/40 px-6 py-12 md:px-12 lg:px-20">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <p className="font-semibold text-text">Kyle Austin</p>
            <p className="mt-1 text-sm text-muted">
              Forward-Deployed Engineer &amp; Solutions Architect
            </p>
            <p className="mt-1 text-sm text-subtle">Cherry Hill, NJ</p>
          </div>

          <nav aria-label="Footer sections">
            <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
              Sections
            </p>
            <ul className="mt-2 space-y-0.5">
              {SECTIONS.map((s) => (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    className="focus-ring inline-block py-1.5 text-sm text-muted transition-colors hover:text-primary"
                  >
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
              Contact
            </p>
            <ul className="mt-2 space-y-0.5">
              <li>
                <a
                  href="mailto:kaustin923@gmail.com"
                  className="focus-ring flex items-center gap-2 py-1.5 text-sm text-muted transition-colors hover:text-primary"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  kaustin923@gmail.com
                </a>
              </li>
              <li>
                <a
                  href="https://linkedin.com/in/kyle-austin-83909512b"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-ring flex items-center gap-2 py-1.5 text-sm text-muted transition-colors hover:text-primary"
                >
                  <Linkedin className="h-4 w-4" aria-hidden="true" />
                  LinkedIn
                </a>
              </li>
              <li>
                <a
                  href="/kyle-austin-resume.pdf"
                  download
                  className="focus-ring flex items-center gap-2 py-1.5 text-sm text-muted transition-colors hover:text-primary"
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Resume (PDF)
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6 text-sm text-subtle">
          Designed and built with Claude Code. Next.js on Vercel.
        </div>
      </div>
    </footer>
  );
}
