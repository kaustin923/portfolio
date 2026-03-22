import type { Project } from "@/types";

export const projects: Project[] = [
  {
    name: "iOS Fitness App",
    slug: "ios-fitness-app",
    category: "personal",
    tech: ["Swift", "Supabase", "Claude Code"],
    description:
      "Full-featured fitness app with macro tracking, AI coach, Apple HealthKit sync, barcode scanning, workout tracking, push notifications, and subscription payments.",
    metric: "100% built with Claude Code",
    detail: {
      longDescription:
        "A comprehensive iOS fitness application built entirely with Claude Code as an experiment in AI-assisted development. The app covers the full spectrum of fitness tracking: macro and calorie logging with barcode scanning, customizable workout routines with exercise tracking, and an AI coaching feature that provides personalized recommendations based on user goals and history.\n\nThe app integrates deeply with Apple's ecosystem through HealthKit for syncing health data, and uses Supabase for the backend including authentication, real-time data sync, and edge functions. It also includes subscription payment handling through StoreKit 2 and a push notification system for workout reminders and goal milestones.\n\nThis project was a deliberate test of how far you can push AI-assisted development on a real, shippable product. Every line of code was written through Claude Code, from the SwiftUI views to the Supabase schema migrations.",
      challenges: [
        "Building a production-quality iOS app entirely through AI-assisted development with no manual code edits",
        "Integrating multiple Apple frameworks (HealthKit, StoreKit 2, Push Notifications) that require careful entitlement and capability configuration",
        "Designing a Supabase schema that handles real-time sync across devices while keeping row-level security policies tight",
        "Implementing barcode scanning with reliable nutritional data lookup from multiple food database APIs",
      ],
      outcomes: [
        "Completed a fully functional app with 15+ screens and complex navigation flows",
        "Demonstrated that Claude Code can handle end-to-end iOS development including deployment configuration",
        "Integrated 4 Apple frameworks and 3 third-party services into a cohesive user experience",
        "Built and iterated on the entire app in under 3 weeks of evening/weekend work",
      ],
      architecture:
        "SwiftUI frontend with MVVM architecture, Supabase backend (PostgreSQL + Auth + Edge Functions + Realtime), HealthKit integration layer for bidirectional health data sync, StoreKit 2 for subscription management, and a local caching layer using SwiftData for offline support.",
    },
  },
  {
    name: "Super Bowl Squares",
    slug: "super-bowl-squares",
    category: "personal",
    tech: ["Vercel", "Supabase", "ESPN API"],
    description:
      "Real-time web app with live scoring, admin dashboard, confetti winner animations, and zero downtime. Tested during NFC Championship before Super Bowl deployment.",
    metric: "100 concurrent users, zero errors",
    detail: {
      longDescription:
        "A real-time Super Bowl Squares game that handled 100 concurrent users on game day with zero errors. Players could claim squares on a 10x10 grid, and the app automatically pulled live scores from the ESPN API to determine winners at the end of each quarter.\n\nThe app featured a full admin dashboard for managing the game, randomizing row/column numbers after all squares were claimed, and manually overriding results if needed. Winners got a confetti animation celebration, and the entire scoreboard updated in real-time across all connected clients using Supabase's realtime subscriptions.\n\nI tested the app during the NFC Championship game with a smaller group before deploying it for the actual Super Bowl. This let me catch edge cases around score update timing and connection handling before the high-stakes game day.",
      challenges: [
        "Handling 100 concurrent WebSocket connections through Supabase Realtime without dropped updates or stale state",
        "Syncing ESPN API score updates reliably during a live game with unpredictable API latency",
        "Building a square-claiming system that prevents race conditions when multiple users try to claim the same square",
        "Testing with real game data during NFC Championship to validate the entire pipeline before Super Bowl",
      ],
      outcomes: [
        "100 concurrent users on Super Bowl Sunday with zero errors or downtime",
        "Real-time score updates within seconds of actual game events",
        "Successfully managed the full game lifecycle from square claiming through final payout",
        "Zero support requests during the game, meaning the UX was intuitive enough for non-technical users",
      ],
      architecture:
        "Next.js frontend deployed on Vercel, Supabase backend with Realtime subscriptions for live grid updates, ESPN API polling via edge function for score data, and optimistic UI updates with server reconciliation for square claiming.",
    },
  },
  {
    name: "RAG Gap Assessment Tool",
    slug: "rag-gap-assessment",
    category: "professional",
    tech: ["Python", "ADA-003", "RAG", "Vector Store"],
    description:
      "Ingests Excel, PDF, and Word docs via ADA-003 embeddings and semantic similarity search. Automates gap assessment reporting across 57 requirements with keyword-targeted searches.",
    metric: "92% accuracy, used on 20+ engagements",
    detail: {
      longDescription:
        "A Python-based tool that automates the tedious process of gap assessment reporting for compliance engagements. Instead of analysts manually reading through hundreds of pages of policy documents to check against 57 compliance requirements, this tool ingests the documents, creates embeddings, and uses semantic similarity search to find relevant evidence for each requirement.\n\nThe tool handles Excel, PDF, and Word documents through a unified ingestion pipeline. It uses OpenAI's ADA-003 model for embeddings and stores them in a vector database. For each of the 57 requirements, it runs both semantic similarity searches and keyword-targeted searches to maximize recall, then presents the most relevant passages to the analyst for review.\n\nThis started as a proof of concept on one engagement and quickly became a standard tool across the practice. It cut the initial evidence-gathering phase from days to hours, freeing analysts to focus on the judgment calls that actually require human expertise.",
      challenges: [
        "Handling messy document formats where tables, headers, and formatting carry important semantic meaning that gets lost in plain text extraction",
        "Tuning the balance between semantic search and keyword search to hit 92% accuracy across diverse client document styles",
        "Building a chunking strategy that preserves enough context for meaningful similarity matching without overwhelming the context window",
        "Making the tool reliable enough for 20+ different engagement teams to use without dedicated support",
      ],
      outcomes: [
        "92% accuracy in identifying relevant evidence across diverse client document sets",
        "Adopted on 20+ engagements across the practice, becoming a standard part of the assessment workflow",
        "Reduced initial evidence-gathering phase from 2-3 days to 3-4 hours per engagement",
        "Freed senior analysts to focus on judgment and advisory work instead of document review",
      ],
      architecture:
        "Python CLI tool with document ingestion pipeline (PDF via PyMuPDF, Word via python-docx, Excel via openpyxl), ADA-003 embeddings with hybrid semantic + keyword search, vector store for document chunks, and structured output templates for gap assessment reports.",
    },
  },
  {
    name: "Climate AI Platform",
    slug: "climate-ai-platform",
    category: "professional",
    tech: ["Azure OpenAI", "Python", "RAG", "AI Agents"],
    description:
      "Financial impact modeling with interactive visualizations. Context-aware agents with RAG-powered chats, source citations, and prompt injection safeguards.",
    metric: "Production deployment for Fortune 500 client",
    detail: {
      longDescription:
        "An AI-powered platform for climate risk analysis and financial impact modeling, built for a Fortune 500 client. The platform combines structured financial data with unstructured climate research through a multi-agent architecture, giving analysts the ability to model climate scenarios and understand their financial implications.\n\nThe core of the platform is a set of context-aware AI agents that can answer questions about climate risk using RAG-powered retrieval from the client's internal research library and public climate data. Every response includes source citations so analysts can trace claims back to original documents. The system also includes prompt injection safeguards to prevent misuse in a regulated environment.\n\nThe financial modeling component generates interactive visualizations showing how different climate scenarios impact the client's portfolio. Analysts can adjust assumptions, compare scenarios, and export results for board-level presentations.",
      challenges: [
        "Building a multi-agent architecture where specialized agents collaborate on complex climate risk questions",
        "Implementing source citations that accurately trace AI responses back to specific passages in source documents",
        "Adding prompt injection safeguards robust enough for a regulated financial environment",
        "Creating interactive financial visualizations that non-technical executives could use in presentations",
      ],
      outcomes: [
        "Deployed to production for a Fortune 500 financial services client",
        "Enabled analysts to generate climate scenario analyses in hours instead of weeks",
        "Source citation system achieved high traceability, meeting regulatory documentation requirements",
        "Platform used for board-level reporting on climate risk exposure",
      ],
      architecture:
        "Azure OpenAI for LLM inference, Python backend with multi-agent orchestration, RAG pipeline with Azure AI Search for document retrieval, citation extraction and verification layer, interactive visualization frontend, and security middleware for prompt injection detection.",
    },
  },
  {
    name: "GenAI Emissions Extraction",
    slug: "genai-emissions-extraction",
    category: "professional",
    tech: ["Python", "Azure OpenAI", "PDF Processing"],
    description:
      "Python tool scraping granular emissions data from large PDFs for regulatory compliance. Paired with a Climate Disclosure Report writer.",
    metric: "Automated regulatory compliance reporting",
    detail: {
      longDescription:
        "A Python tool that extracts granular emissions data from large corporate sustainability PDFs and pairs it with an automated Climate Disclosure Report writer. Companies publish emissions data in inconsistent formats across hundreds of pages of sustainability reports, and this tool automates the extraction of specific Scope 1, 2, and 3 emissions figures along with their methodological notes.\n\nThe extraction pipeline handles the messiness of real-world sustainability reports: data buried in tables, footnotes that qualify reported numbers, year-over-year comparisons spread across multiple sections, and varying units of measurement. The tool uses Azure OpenAI for intelligent extraction, going beyond simple text parsing to understand context and relationships between data points.\n\nThe companion report writer takes the extracted data and generates draft Climate Disclosure Reports that follow regulatory frameworks. This gives compliance teams a strong starting point instead of a blank page.",
      challenges: [
        "Extracting structured data from PDFs where emissions figures are embedded in complex tables with merged cells and footnotes",
        "Handling inconsistent reporting formats across different companies and years",
        "Distinguishing between reported, estimated, and restated emissions figures that require different treatment in disclosures",
        "Building a report writer that generates regulatory-compliant language while remaining factually grounded in extracted data",
      ],
      outcomes: [
        "Automated extraction of emissions data from sustainability reports that previously required days of manual work",
        "Generated draft Climate Disclosure Reports aligned with major regulatory frameworks",
        "Reduced compliance team workload on initial data gathering and report drafting by roughly 70%",
        "Tool became part of the standard engagement workflow for climate-related compliance projects",
      ],
      architecture:
        "Python pipeline with PDF processing (table extraction, section detection, footnote linking), Azure OpenAI for contextual data extraction and report generation, structured output validation for emissions figures, and template-based report assembly for regulatory compliance formats.",
    },
  },
  {
    name: "AI Transformation Office",
    slug: "ai-transformation-office",
    category: "professional",
    tech: ["Claude Code", "Training", "Change Management"],
    description:
      "Co-founded the AI Transformation Office within a 500+ person practice. Built training programs, led executive upskilling, and reworked service delivery.",
    metric: "Grew adoption from 54% to 89%",
    detail: {
      longDescription:
        "Co-founded and led the AI Transformation Office (ATO) within a 500+ person consulting practice, focused on driving real AI adoption rather than just awareness. The initiative started from recognizing that most practitioners had heard about AI tools but weren't actually using them in their day-to-day work. The gap between awareness and adoption was where most of the value was being left on the table.\n\nThe ATO built structured training programs tailored to different roles and experience levels. Rather than generic \"intro to AI\" sessions, we created hands-on workshops where people used AI tools on their actual project work. For executives, the upskilling focused on understanding AI capabilities well enough to make informed decisions about where to invest and what to expect.\n\nThe biggest impact came from reworking service delivery itself. Instead of treating AI as an add-on, we integrated AI-assisted workflows into standard engagement methodologies. This meant rewriting playbooks, creating new quality checkpoints for AI-generated work, and building feedback loops so the practice could learn from what was working.",
      challenges: [
        "Overcoming skepticism from experienced practitioners who saw AI as a threat to their expertise rather than a multiplier",
        "Creating training programs that worked across vastly different technical skill levels, from partners to first-year analysts",
        "Measuring real adoption rather than just training completion, since attendance does not equal behavior change",
        "Reworking established service delivery methodologies without disrupting active engagements",
      ],
      outcomes: [
        "Grew AI tool adoption from 54% to 89% across the 500+ person practice",
        "Built and delivered training programs covering hands-on AI tool usage for consulting workflows",
        "Led executive upskilling sessions that shifted leadership from cautious to actively sponsoring AI initiatives",
        "Reworked service delivery playbooks to integrate AI-assisted workflows as standard practice",
      ],
    },
  },
];

export function getProjectBySlug(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

export function getAllSlugs(): string[] {
  return projects.map((p) => p.slug);
}
