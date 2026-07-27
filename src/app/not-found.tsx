import Link from "next/link";
import { ArrowRight } from "lucide-react";

const ELSEWHERE = [
  { label: "What I build", href: "/#capabilities" },
  { label: "Selected work", href: "/#projects" },
  { label: "Resume", href: "/#resume" },
];

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-24">
      <div className="w-full max-w-md text-center">
        <p className="tabular mb-3 text-6xl font-bold text-primary">404</p>
        <h1 className="mb-2 text-2xl font-semibold text-text">
          Page not found
        </h1>
        <p className="mb-8 text-muted">
          That page doesn&apos;t exist. Here is where most people are headed.
        </p>

        <ul className="mb-8 space-y-2 text-left">
          {ELSEWHERE.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="focus-ring group flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-text transition-colors hover:border-primary/40 hover:text-primary"
              >
                {item.label}
                <ArrowRight
                  className="h-4 w-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>

        <Link
          href="/"
          className="focus-ring inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          Back to Home
        </Link>
      </div>
    </main>
  );
}
