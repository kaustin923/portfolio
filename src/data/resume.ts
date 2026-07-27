import type { ResumeData } from "@/types";

export const resumeData: ResumeData = {
  summary:
    "Forward-deployed engineer and solutions architect who still writes the code. Manager at PwC, rated Tier 1 all four years, accountable for $2M+ in client revenue and leading a 5-developer onshore and offshore team. Six years in enterprise consulting and analytics, the last four building and leading AI delivery: agent orchestration, Neo4j knowledge graphs, and production RAG. Recipient of the PwC [A]mplify [I]mpact Luminary Award, the firm's highest AI honor, 1 of 9 recipients across the US Acceleration Centers.",

  skills: [
    {
      category: "AI & LLM",
      items:
        "Claude / Claude Code / Cowork, Anthropic API, Codex, Azure OpenAI, MCP servers (Teams, SharePoint, GitHub), agent orchestration, RAG pipelines, vector stores, embeddings (ADA-003), prompt engineering, eval frameworks, knowledge graphs",
    },
    {
      category: "Programming",
      items:
        "Python (primary), SQL, Cypher; AI-assisted development in Swift, JavaScript, HTML/CSS",
    },
    {
      category: "Cloud & Delivery",
      items:
        "GitHub, Azure DevOps, CI/CD, AKS (Kubernetes), Azure Key Vault, SSO, Neo4j, Postgres, Supabase, Vercel, Primavera P6, Power Automate, CoPilot Studio, Power BI; deployed on Azure and GCP",
    },
  ],

  experience: [
    {
      title: "Manager",
      company: "PwC (PricewaterhouseCoopers)",
      period: "July 2025 - Present",
      bullets: [
        "Lead a $1.5M capital project engagement with a 5-developer onshore and offshore team, delivering a platform that unifies cost, schedule, and risk in one cockpit. Integrates Primavera P6 and Excel; AI forecasts schedule slip and cost overrun for early risk detection across projects. Working software in 3 weeks, now shipping on 3-week cycles",
        "Run the entire delivery out of GitHub, built with Claude Code and Codex. Custom Teams and SharePoint MCP servers pull daily standup notes and generate action items, weekly status, client comms, and risk tracking, so reporting derives from what actually shipped",
        "Architect and manage the dev team on a Neo4j knowledge graph suite for decarbonization modeling and reporting. Cypher traversals expose data lineage gaps and downstream impact. Deployed on AKS via Azure DevOps CI/CD with Azure SSO, Key Vault secrets management, and automated security scanning gates",
        "Co-founded the AI Transformation Office for a 500+ person practice. Grew AI adoption from 54% to 99% through hands-on training, executive coaching, and reworking how we deliver AI-powered services",
        "Won and delivered a $325K engagement for a global food and beverage company. Shipped Power Automate and CoPilot Studio agent flows with Claude Code. Initial solution in 2 days, 12-week timeline compressed to 4",
        "Shipped a RAG-powered gap assessment tool (92% accuracy vs. manual review) used on 20+ client engagements; ingests Excel, PDF, and Word via ADA-003 embeddings and semantic similarity search",
        "Function as a solutions engineer across the full sales cycle: prototyped AI for 25+ go-to-market efforts, led ~15 client conversations, and presented to Fortune 500 executives across four industries",
      ],
    },
    {
      title: "Senior Associate",
      company: "PwC",
      period: "June 2023 - July 2025",
      bullets: [
        "Led an 18-month enterprise data migration end-to-end: untangled data across organizational silos, built strategy with executives, and consolidated 27 distinct migration scenarios into Postgres on GCP",
        "Architected a climate platform with financial impact modeling, context-aware AI agents, RAG-powered chat with source citations, and prompt injection safeguards on Azure OpenAI",
        "Built GenAI review pipelines with custom UX for Fortune 500 clients across multiple industries",
        "Built a GenAI model scoring 600+ climate surveys for go-to-market targeting, featured firm-wide in Assurance Inside; plus a Python emissions extraction tool and Climate Disclosure Report writer for regulatory compliance",
      ],
    },
    {
      title: "Experienced Associate",
      company: "PwC",
      period: "May 2022 - June 2023",
      bullets: [
        "Built financial and risk models for climate scenario analysis; converted Excel models to Python with Power BI dashboards, and presented findings to CFOs and Chief Sustainability Officers",
      ],
    },
    {
      title: "Pricing Analyst I & II",
      company: "Progressive Insurance",
      period: "June 2020 - May 2022",
      bullets: [
        "Developed loss trend model monitoring $680M in premium; led concurrent pricing projects for government partners",
      ],
    },
  ],

  personalProjects: [
    {
      name: "iOS Fitness App",
      tech: "Swift, Supabase, Claude Code",
      description:
        "Macro tracking, AI coach, Apple HealthKit sync, barcode scanning, workout tracking, push notifications, and subscription payments. 100% built with Claude Code.",
    },
    {
      name: "Super Bowl Squares",
      tech: "Vercel, Supabase",
      description:
        "Real-time web app for 100 concurrent users with ESPN API live scoring, admin dashboard, confetti winner animations, and zero downtime. Fully tested during the NFC Championship before live Super Bowl deployment.",
    },
  ],

  education: {
    degree: "Bachelor of Business Administration",
    school: "Kent State University",
    year: "2020",
    details: "Major: Economics | Minor: Entrepreneurship & Finance",
  },
};
