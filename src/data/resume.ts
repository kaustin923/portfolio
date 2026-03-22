import type { ResumeData } from "@/types";

export const resumeData: ResumeData = {
  summary:
    "Manager at PwC (Tier 1, highest rating, all 4 years). I co-founded our practice's AI Transformation Office and function as a solutions engineer across the full sales cycle, building RAG pipelines, eval frameworks, and rapid prototypes, then presenting them directly to Fortune 500 decision-makers. Six years turning enterprise organizations from AI-curious to AI-adopted, with hands-on Python development and Claude Code as my primary build tool.",

  skills: [
    {
      category: "AI & LLM",
      items:
        "Claude / Claude Code, Anthropic API, Azure OpenAI, RAG pipelines, vector stores, embeddings (ADA-002/003), prompt engineering, eval frameworks, AI agents, knowledge graphs",
    },
    {
      category: "Programming",
      items:
        "Python (primary), SQL; AI-assisted development in Swift, JavaScript, HTML/CSS",
    },
    {
      category: "Cloud & Tools",
      items:
        "Postgres, Supabase, Vercel, Power Automate, CoPilot Studio, Power BI, Salesforce; deployed on GCP, AWS, Azure",
    },
  ],

  experience: [
    {
      title: "Manager",
      company: "PwC (PricewaterhouseCoopers)",
      period: "July 2025 - Present",
      bullets: [
        "Co-founded the AI Transformation Office for a 500+ person practice. Grew AI adoption from 54% to 89% through hands-on training, executive coaching, and reworking how we deliver AI-powered services",
        "Built rapid AI prototypes for 20-30 go-to-market efforts and presented them directly to Fortune 500 executives across four industries",
        "Won and delivered a $325K engagement for a global food and beverage company. Built Power Automate and CoPilot Studio agent flows using Claude Code, delivering an initial solution in 2 days and compressing a 12-week timeline to 4 weeks",
        "Built a RAG-powered gap assessment tool (92% accuracy vs. manual review) used on 20+ client engagements. Ingests Excel, PDF, and Word docs via ADA-003 embeddings and semantic similarity search",
        "Led executive AI upskilling including weekly partner/director sessions, a three-part training series, and 1-on-1 AI-assisted development workshops with practice leadership",
        "Upcoming speaker at NARUC conference on AI data centers and rate impacts, and executive leadership conference leading a 75-minute AI session",
      ],
    },
    {
      title: "Senior Associate",
      company: "PwC",
      period: "June 2023 - July 2025",
      bullets: [
        "Developed GenAI automation solutions using Azure OpenAI for Fortune 500 clients, creating end-to-end review pipelines with custom UX across multiple industries",
        "Built a climate solution platform with financial impact modeling and interactive visualizations. Integrated context-aware AI agents with RAG-powered chats, source citations, and prompt injection safeguards",
        "Created a GenAI emissions extraction tool in Python to scrape granular data from large PDFs, and a Climate Disclosure Report writer ensuring regulatory compliance",
        "Led a 1.5-year data migration end-to-end: untangled data across organizational silos, built the migration strategy with executives, and moved everything into a structured Postgres database on GCP",
        "Built a GenAI model that analyzed 600+ climate surveys to score and rank clients for go-to-market; featured in firm-wide publication as an AI innovation example",
      ],
    },
    {
      title: "Experienced Associate",
      company: "PwC",
      period: "May 2022 - June 2023",
      bullets: [
        "Built financial and risk models for climate scenario analysis; converted Excel-based models to Python with Power BI dashboard integration",
        "Presented climate risk findings to CFOs and Chief Sustainability Officers, turning regulatory analysis into investment and disclosure decisions",
      ],
    },
    {
      title: "Pricing Analyst I & II",
      company: "Progressive Insurance",
      period: "June 2020 - May 2022",
      bullets: [
        "Developed loss trend model monitoring $680M in premium; led concurrent data-driven pricing projects for government partners",
      ],
    },
  ],

  personalProjects: [
    {
      name: "iOS Fitness App",
      tech: "Swift, Supabase, Claude Code",
      description:
        "Full-featured fitness app with macro tracking, AI coach, Apple HealthKit sync, barcode scanning, workout tracking, push notifications, and subscription payments. 100% built with Claude Code.",
    },
    {
      name: "Super Bowl Squares",
      tech: "Vercel, Supabase",
      description:
        "Real-time web app serving 100 concurrent users with ESPN API live scoring, admin dashboard, confetti winner animations, and zero downtime. Fully tested during NFC Championship before live Super Bowl deployment.",
    },
  ],

  education: {
    degree: "Bachelor of Business Administration",
    school: "Kent State University",
    year: "2020",
    details: "Major: Economics | Minor: Entrepreneurship & Finance",
  },
};
