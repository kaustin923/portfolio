import type { Metadata } from "next";
import { resumeData } from "@/data/resume";

/**
 * Print-only view of the resume, rendered from the same `resumeData` the site
 * uses. `scripts/generate-resume-pdf.mjs` renders this route with Chromium to
 * produce `public/kyle-austin-resume.pdf`, so the download can never drift from
 * what the site says.
 */
export const metadata: Metadata = {
  title: "Kyle Austin | Resume",
  robots: { index: false, follow: false },
};

const CONTACT = [
  "(330) 815-1191",
  "kaustin923@gmail.com",
  "Cherry Hill, NJ",
  "linkedin.com/in/kyle-austin-83909512b",
];

export default function ResumePrintPage() {
  return (
    <>
      <style>{`
        @page { size: Letter; margin: 0.5in 0.55in; }
        html, body { background: #fff; }
        /* The root layout wraps pages in #main and also renders the navbar,
           footer, skip link, and chat launcher. None of those belong in a PDF. */
        @media print {
          body > *:not(#main) { display: none !important; }
        }
        .sheet {
          color: #111;
          font-size: 8.9pt;
          line-height: 1.3;
          max-width: 7.4in;
          margin: 0 auto;
          padding: 0.1in 0 0;
        }
        .sheet h1 {
          font-size: 18pt; font-weight: 700; letter-spacing: -0.02em; margin: 0;
        }
        .sheet .contact {
          font-size: 8.2pt; color: #333; margin-top: 2pt;
        }
        .sheet h2 {
          font-size: 9.6pt; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.06em; color: #2D5A3D;
          margin: 9pt 0 3.5pt; padding-bottom: 1.5pt;
          border-bottom: 0.8pt solid #2D5A3D;
        }
        .sheet .role { display: flex; justify-content: space-between; gap: 12pt; margin-top: 6pt; }
        .sheet .role:first-of-type { margin-top: 0; }
        .sheet .role strong { font-weight: 700; }
        .sheet .period { color: #444; white-space: nowrap; font-size: 8.2pt; }
        /* Tailwind's reset strips list markers, so put them back for print. */
        .sheet ul { margin: 2pt 0 0; padding-left: 11pt; list-style: disc outside; }
        .sheet li { margin-bottom: 1.8pt; }
        .sheet li::marker { color: #2D5A3D; }
        .sheet .skill { margin-bottom: 2.5pt; }
        .sheet .skill b { font-weight: 700; }
        .sheet p { margin: 0; }
        /* Keep a role and its first bullets together across a page break. */
        .sheet section, .sheet .role-block { break-inside: avoid-page; }
      `}</style>

      <main className="sheet">
        <h1>Kyle Austin</h1>
        <p className="contact">{CONTACT.join("  |  ")}</p>

        <section>
          <h2>Summary</h2>
          <p>{resumeData.summary}</p>
        </section>

        <section>
          <h2>Technical Skills</h2>
          {resumeData.skills.map((s) => (
            <p className="skill" key={s.category}>
              <b>{s.category}:</b> {s.items}
            </p>
          ))}
        </section>

        <section>
          <h2>Professional Experience</h2>
          {resumeData.experience.map((exp) => (
            <div className="role-block" key={`${exp.title}-${exp.company}-${exp.period}`}>
              <div className="role">
                <span>
                  <strong>{exp.title}</strong>, {exp.company}
                </span>
                <span className="period">{exp.period}</span>
              </div>
              <ul>
                {exp.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section>
          <h2>Personal Projects</h2>
          {resumeData.personalProjects.map((p) => (
            <div className="role-block" key={p.name}>
              <div className="role">
                <span>
                  <strong>{p.name}</strong> ({p.tech})
                </span>
              </div>
              <ul>
                <li>{p.description}</li>
              </ul>
            </div>
          ))}
        </section>

        <section>
          <h2>Education</h2>
          <div className="role">
            <span>
              <strong>{resumeData.education.degree}</strong>,{" "}
              {resumeData.education.school}
            </span>
            <span className="period">{resumeData.education.year}</span>
          </div>
          <p>{resumeData.education.details}</p>
        </section>
      </main>
    </>
  );
}
