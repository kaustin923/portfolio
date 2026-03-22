import { Linkedin } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border py-8 px-6">
      <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted">
        <span>Built with Claude Code</span>
        <a
          href="https://linkedin.com/in/kyle-austin-83909512b"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 hover:text-primary transition-colors"
        >
          <Linkedin className="h-4 w-4" />
          LinkedIn
        </a>
      </div>
    </footer>
  );
}
