import type { ChatSuggestion } from "@/types";

/**
 * Facts about Kyle that don't live in projects.ts or capabilities.ts.
 * The system prompt is composed from all three, so the agent can never drift
 * from what the site actually shows.
 */

export const bio = {
  name: "Kyle Austin",
  title: "Forward-Deployed Engineer & Solutions Architect",
  currentRole: "Manager at PwC (PricewaterhouseCoopers)",
  location: "Cherry Hill, NJ. Commutes to NYC for hybrid roles.",
  email: "kaustin923@gmail.com",
  linkedin: "linkedin.com/in/kyle-austin-83909512b",
  performance: "Rated Tier 1, the highest performance tier, all four years at PwC.",
  positioning:
    "Kyle is a builder who manages. He embeds with a client, gets working software into their hands in weeks, then scales it without a rewrite. He still writes code daily, which means he can validate an architecture or an estimate himself rather than taking someone's word for it.",
};

export const careerHistory = [
  {
    role: "Manager, PwC",
    period: "July 2025 to present",
    summary:
      "Leads a 5-developer onshore and offshore team on a $1.5M capital project platform. Architects a Neo4j knowledge graph suite for decarbonization. Runs delivery out of GitHub through an agent harness he built. Co-founded the AI Transformation Office.",
  },
  {
    role: "Senior Associate, PwC",
    period: "June 2023 to July 2025",
    summary:
      "Led an 18-month enterprise data migration across 27 scenarios into Postgres on GCP. Architected a climate platform with RAG chat, source citations, and prompt injection safeguards on Azure OpenAI. Built a GenAI model scoring 600+ climate surveys, featured firm-wide in Assurance Inside.",
  },
  {
    role: "Experienced Associate, PwC",
    period: "May 2022 to June 2023",
    summary:
      "Built financial and risk models for climate scenario analysis. Converted Excel models to Python with Power BI dashboards. Presented findings to CFOs and Chief Sustainability Officers.",
  },
  {
    role: "Pricing Analyst I & II, Progressive Insurance",
    period: "June 2020 to May 2022",
    summary:
      "Developed a loss trend model monitoring $680M in premium. Led concurrent pricing projects for government partners. This was pricing and analytics work, before he moved into AI.",
  },
];

export const education = {
  degree: "Bachelor of Business Administration, Kent State University, 2020",
  detail: "Major in Economics, minor in Entrepreneurship & Finance.",
  note: "Kyle came up through economics and analytics, then moved into engineering. He learned to build by building, and now architects systems and leads developers.",
};

export const recognition = [
  "PwC [A]mplify [I]mpact Luminary Award, the firm's highest AI honor. 1 of 9 recipients across the PwC US Acceleration Centers. The bracketed A and I spell AI, which is the intended branding of the award. It recognizes exceptional contribution to AI across the firm: upskilling engineers, delivering client work, and changing how the practice operates.",
  "Presented at the NARUC Spring Conference in Charlotte, April 2026, to the Staff Subcommittee on Accounting and Finance on AI, data centers, and large load rate impacts.",
  "Led a 75-minute AI session at an executive leadership conference in April 2026.",
  "Work featured firm-wide in Assurance Inside as an AI innovation example.",
];

export const toolbelt = {
  languages: "Python is his primary language. Also SQL and Cypher. AI-assisted development in Swift, TypeScript, JavaScript, and HTML/CSS.",
  ai: "Claude and Claude Code are his primary build tools and he considers himself in the top 1% of Claude Code users. Also Anthropic API, Codex, Azure OpenAI, Cursor, MCP servers he wrote himself for Teams, SharePoint, and GitHub, agent orchestration, RAG pipelines, vector stores, ADA-003 embeddings, prompt engineering, and eval frameworks.",
  data: "Neo4j and Cypher for knowledge graphs, Postgres, Databricks, Supabase, Dataverse, Power BI.",
  cloud: "Azure, GCP, and AWS. Azure DevOps, AKS (Kubernetes), CI/CD pipelines, Key Vault, SSO via Azure and Microsoft identity, automated security code scanning. GitHub for both code and delivery orchestration. Vercel for personal projects.",
  microsoft: "CoPilot Studio, Power Automate, Dataverse, Azure AI Foundry.",
};

/** Answers to the questions people actually ask, in Kyle's framing. */
export const talkingPoints = [
  {
    topic: "Why graphs",
    answer:
      "Kyle reaches for a graph when the question is about relationships rather than records. Decarbonization work is full of those: what feeds which reporting boundary, where lineage breaks between a source system and a disclosed number, and what moves downstream if you change one input. Those are traversal questions. In a relational model they become recursive joins nobody maintains. In Cypher they are a few lines. Modeling a Fortune 500 sustainability program as a graph is also what made its lineage gaps visible, because you could literally see the orphaned nodes.",
  },
  {
    topic: "Agent orchestration in practice",
    answer:
      "Kyle runs a $1.5M engagement out of GitHub. Custom Teams and SharePoint MCP servers pull daily standup notes, agents cross-check that chatter against actual repository activity, and then generate action items, weekly status, client comms, risk logs, and resource plans. The grounding step is the important part: reporting is derived from what actually shipped rather than what someone remembered to type into a slide. Claude skills provide the harness for task creation, PR opening, and automated PR review.",
  },
  {
    topic: "Speed to value",
    answer:
      "On the capital project engagement Kyle got the client a working solution in about 3 weeks by shipping a local single-file HTML build with the calculations embedded, while working with the client's IT to deploy properly into their systems longer term. Getting something real into their hands early bought the trust to do the bigger build.",
  },
  {
    topic: "Working across time zones",
    answer:
      "Kyle leads an offshore team in India alongside an onshore team. He uses AI to close the time-zone gap with meeting recaps, recordings, and end-of-day update emails, plus a daily morning connect. Coordination runs through GitHub, which provides the governance and review gates.",
  },
  {
    topic: "How he wins work",
    answer:
      "Kyle functions as a solutions engineer across the full sales cycle and has led around 15 client conversations selling AI solutions. He won the capital project work in a tight competitive situation against another firm, on the strength of a relationship built over time: he understood what leadership actually needed, showed up every week with working features plus a rollout plan, and made the stakeholder's vision real. He won a $325K food and beverage engagement the same way, off a 10-year relationship.",
  },
  {
    topic: "Teaching and upskilling",
    answer:
      "Kyle hosts biweekly upskilling sessions on Claude best practices: building skills, creating orchestration harnesses, and running reporting and project management through GitHub. He also runs weekly partner and director sessions and has personally upskilled around 50 people on Claude Code, Cursor, and Codex. This is a large part of what the Luminary award recognized.",
  },
  {
    topic: "Player-coach",
    answer:
      "Kyle runs 4 to 5 concurrent enterprise engagements across onshore, nearshore, and offshore teams while still building hands-on. He sets architecture, reviews PRs, and writes code. That is deliberate: he can validate an estimate because he could do the work himself.",
  },
  {
    topic: "Industries",
    answer:
      "Consumer products, energy and utilities, financial services, insurance, retail, tech, and capital projects and infrastructure. He has direct industry depth in insurance from Progressive, and deep specialization in climate, sustainability, and regulatory work. Around 20 clients total. He has never been tied to one industry and adapts fast.",
  },
  {
    topic: "What he is looking for",
    answer:
      "A forward-deployed engineer or solutions architect role where he is embedded with customers, building and shipping real systems, and still leading. The player-coach shape is the point: he does not want to stop building, and he does not want to stop leading.",
  },
];

/** Questions the UI offers, grouped so the panel can show a relevant mix. */
export const chatSuggestions: ChatSuggestion[] = [
  {
    label: "Agent orchestration",
    question: "How does Kyle actually use agent orchestration on real client work?",
    topic: "skills",
  },
  {
    label: "Why knowledge graphs",
    question: "Why does Kyle use Neo4j knowledge graphs, and what did he build with them?",
    topic: "skills",
  },
  {
    label: "The capital project",
    question: "Tell me about the $1.5M capital project platform.",
    topic: "work",
  },
  {
    label: "The Luminary Award",
    question: "What is the [A]mplify [I]mpact Luminary Award and why did Kyle win it?",
    topic: "work",
  },
  {
    label: "Shipping fast",
    question: "How does Kyle get working software in front of a client so quickly?",
    topic: "work",
  },
  {
    label: "Leading engineers",
    question: "How does Kyle lead an onshore and offshore team while still writing code?",
    topic: "leadership",
  },
  {
    label: "Production RAG",
    question: "What has Kyle shipped with RAG, and how does he know it works?",
    topic: "skills",
  },
  {
    label: "What he's after",
    question: "What kind of role is Kyle looking for?",
    topic: "personal",
  },
];
