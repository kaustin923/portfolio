import type { CapabilityId, Lens, Project } from "@/types";

export const projects: Project[] = [
  {
    name: "Capital Project Platform",
    slug: "capital-project-platform",
    category: "professional",
    tech: ["Python", "Primavera P6", "AI Forecasting", "Claude Code"],
    capabilities: ["platform-delivery", "evals", "leadership"],
    lens: ["build", "lead"],
    role: "Delivery lead and hands-on engineer",
    period: "2025 to present",
    spotlight: true,
    description:
      "A $1.5M platform that unifies cost, schedule, and risk in one cockpit. Integrates Primavera P6 and Excel, and uses AI to forecast schedule slip and cost overrun for early risk detection.",
    metric: "Working solution in 3 weeks, 5-developer team",
    detail: {
      longDescription:
        "A $1.5M capital project platform I lead with a 5-developer onshore and offshore team. Capital projects normally run cost, schedule, and risk in three disconnected places. Schedules live in Primavera P6. Budgets live in Excel. Risk lives in someone's status deck. Nobody sees the whole picture until the project is already in trouble.\n\nThe platform pulls all three into a single cockpit. It integrates directly with P6 and the client's cost workbooks, normalizes the data, and layers forecasting on top. Models predict schedule slip and cost overrun at the activity and project level, and triage incoming data to surface early risk signals across the portfolio before they show up as variances.\n\nThe speed-to-value story matters here. We got the client something usable in about 3 weeks by shipping a local single-file HTML build with the calculations embedded, while working with their IT to deploy properly into their systems. That bought trust early. We now ship on 3-week cycles, moving from proof of concept to scaled application without pausing delivery.\n\nMy role is player-coach. I set the architecture, review every PR, and still write code.",
      challenges: [
        "Reconciling Primavera P6 schedule data with Excel cost workbooks that were never designed to be joined, including inconsistent WBS codes and activity naming",
        "Building forecasting that flags slip and overrun early enough to act on, without so many false alarms that project managers tune it out",
        "Coordinating a 5-developer onshore and offshore team on 3-week cycles while requirements were still moving",
        "Taking a proof of concept to a scaled production app with no rewrite and no delivery freeze",
      ],
      outcomes: [
        "Working solution in the client's hands in about 3 weeks, then a sustained 3-week shipping cadence",
        "Cost, schedule, and risk unified into one cockpit, replacing three disconnected systems",
        "AI triage surfaces early risk across projects, shifting the client from reactive variance reporting to early detection",
        "Grew into a $1.5M program with a 5-developer onshore and offshore team",
      ],
      architecture:
        "Python backend with a Primavera P6 and Excel ingestion layer that normalizes schedule and cost into a common model. AI forecasting services predict schedule slip and cost overrun. A risk triage pipeline scores and ranks signals across the portfolio, feeding a unified cockpit UI. Built and shipped end to end with Claude Code and Codex.",
      pipeline: [
        {
          stage: "Ingest",
          detail: "Primavera P6 schedules and Excel cost workbooks pulled on a schedule",
        },
        {
          stage: "Normalize",
          detail: "WBS codes and activity naming reconciled into one common data model",
        },
        {
          stage: "Forecast",
          detail: "Models predict schedule slip and cost overrun at activity and project level",
        },
        {
          stage: "Triage",
          detail: "Risk signals scored and ranked across the portfolio to cut false alarms",
        },
        {
          stage: "Cockpit",
          detail: "Cost, schedule, and risk surfaced together for the project leadership team",
        },
      ],
    },
  },
  {
    name: "AI-Native Delivery Engine",
    slug: "ai-native-delivery-engine",
    category: "professional",
    tech: ["GitHub", "Claude Code", "Codex", "MCP Servers"],
    capabilities: ["agent-orchestration", "leadership", "platform-delivery"],
    lens: ["build", "lead"],
    role: "Architect and builder",
    period: "2025 to present",
    spotlight: true,
    description:
      "Runs an entire client engagement out of GitHub: one hub for code, project management, and reporting. Custom Teams and SharePoint MCP servers turn standup notes into status reports, action items, and risk tracking.",
    metric: "100% built with Claude Code and Codex",
    detail: {
      longDescription:
        "An experiment that became the operating system for a $1.5M engagement. Run the entire delivery out of GitHub. Code, project management, client reporting, risk tracking, and resource planning all live in one hub, and the whole thing was built with Claude Code and Codex.\n\nThe core is a set of custom MCP servers. A Teams MCP integration pulls daily standup notes straight from the channel where the team already works. A SharePoint MCP integration reads and writes the client-facing document library. From that raw input, agents generate action items, weekly status reports, client communications, milestone and risk tracking, and PTO and resource plans. That is the project management overhead that normally eats a manager's week.\n\nOn top of that sit harness layers built as Claude skills: creating tasks, opening PRs, running peer review, and having Claude and Codex perform PR reviews before a human looks.\n\nThe point is not automation for its own sake. Pulling reporting into the same hub as the code means status is derived from what actually shipped, not from what someone remembered to type into a slide. That is the single biggest differentiator in how I run delivery.",
      challenges: [
        "Building Teams and SharePoint MCP servers against enterprise tenants with strict auth, permissions, and data-handling constraints",
        "Turning unstructured standup chatter into structured, trustworthy action items without hallucinated progress",
        "Getting a consulting team to adopt GitHub as the hub for project management and reporting, not just code",
        "Keeping client-facing deliverables accurate enough to send without a manual rewrite",
      ],
      outcomes: [
        "One hub for code, project management, and client reporting, eliminating the parallel PM tool stack",
        "Standup notes automatically become action items, weekly status, client comms, and risk tracking",
        "Works across onshore and offshore teams and holds people accountable in the same place the code lives",
        "Status reporting derived from shipped work rather than self-reported progress",
      ],
      architecture:
        "GitHub as the single system of record for issues, projects, PRs, and actions. Custom MCP servers for Microsoft Teams and SharePoint feed it. Agent orchestration on Claude Code and Codex reads standup notes and repository activity, then writes action items, weekly status reports, client communications, milestone and risk tracking, and resource plans back into GitHub and SharePoint. Claude skills provide the harness layer for task creation, PR opening, and automated PR review.",
      pipeline: [
        {
          stage: "Capture",
          detail: "Teams MCP pulls daily standup notes; SharePoint MCP reads the client doc library",
        },
        {
          stage: "Ground",
          detail: "Agents cross-check chatter against actual repository activity and shipped PRs",
        },
        {
          stage: "Generate",
          detail: "Action items, weekly status, client comms, risk logs, and resource plans drafted",
        },
        {
          stage: "Review",
          detail: "Claude and Codex run PR review passes through the skill harness before human sign-off",
        },
        {
          stage: "Publish",
          detail: "Output written back into GitHub and SharePoint where the team and client already work",
        },
      ],
    },
  },
  {
    name: "Decarbonization Knowledge Graph",
    slug: "decarbonization-knowledge-graph",
    category: "professional",
    tech: ["Neo4j", "Cypher", "AKS", "Azure DevOps"],
    capabilities: ["graph-architecture", "platform-delivery", "leadership"],
    lens: ["build", "lead"],
    role: "Architect and engineering manager",
    period: "2024 to present",
    spotlight: true,
    description:
      "A suite of solutions that interact through a Neo4j knowledge graph for decarbonization modeling and report generation. Deployed on AKS with SSO, Key Vault, and automated security gates.",
    metric: "Production graph platform on AKS",
    detail: {
      longDescription:
        "A suite of climate and decarbonization solutions that all talk to each other through a Neo4j knowledge graph. I architect it and manage the development team building it.\n\nThe reason it is a graph and not a relational schema is the shape of the questions. Decarbonization work is fundamentally about relationships. Which emissions sources feed which reporting boundary. Where does data lineage break between a source system and a disclosed number. If you change one input, what moves downstream, and by how much. Those are traversal questions. In a relational model they turn into recursive joins that nobody wants to maintain. In Cypher they are a few lines.\n\nModeling the domain as a graph also made the gaps visible. On an earlier Fortune 500 sustainability program I mapped the whole thing as a graph specifically to expose where lineage broke and where the efficiency opportunities were. You could see the orphaned nodes. That is a much harder thing to spot in a set of spreadsheets.\n\nThe platform is production infrastructure, not a notebook. It runs on AKS, deploys through Azure DevOps pipelines with live monitoring, authenticates through Azure SSO, stores secrets in Key Vault, and runs security code scans that validate and remediate before anything ships.",
      challenges: [
        "Modeling a messy real-world sustainability domain as a graph without the schema collapsing into a hairball",
        "Writing Cypher traversals for lineage and impact questions that stay fast as the graph grows",
        "Getting several separate solutions to interoperate cleanly through one shared graph rather than each keeping its own copy of the truth",
        "Meeting enterprise security requirements: SSO, secret management, and automated code scanning gates before delivery",
      ],
      outcomes: [
        "One shared knowledge graph backing multiple modeling and reporting solutions",
        "Data lineage gaps made visible as graph structure rather than buried in spreadsheets",
        "Impact analysis for decarbonization levers, showing what actually moves downstream",
        "Production deployment on AKS with CI/CD, SSO, Key Vault, and automated security remediation",
      ],
      architecture:
        "Neo4j as the shared knowledge layer, with domain entities and their relationships modeled for lineage and impact traversal. Cypher queries power lineage tracing and downstream impact analysis. Solutions in the suite read and write through the graph rather than holding private copies. Deployed to AKS via Azure DevOps CI/CD, with Azure SSO for identity, Key Vault for secrets, and security code scanning gates in the pipeline.",
      pipeline: [
        {
          stage: "Model",
          detail: "Domain entities and their relationships mapped into the graph schema",
        },
        {
          stage: "Load",
          detail: "Source data ingested and connected, with lineage recorded as edges",
        },
        {
          stage: "Traverse",
          detail: "Cypher queries trace lineage and compute downstream impact of a change",
        },
        {
          stage: "Expose",
          detail: "Modeling and reporting solutions in the suite read and write through the shared graph",
        },
        {
          stage: "Ship",
          detail: "AKS deployment via Azure DevOps with SSO, Key Vault, and security scan gates",
        },
      ],
    },
  },
  {
    name: "RAG Gap Assessment Tool",
    slug: "rag-gap-assessment",
    category: "professional",
    tech: ["Python", "ADA-003", "RAG", "Vector Store"],
    capabilities: ["retrieval", "evals"],
    lens: ["build"],
    role: "Builder",
    period: "2024",
    spotlight: true,
    description:
      "Ingests Excel, PDF, and Word docs via ADA-003 embeddings and hybrid semantic search. Automates gap assessment reporting across 57 requirements.",
    metric: "92% accuracy, used on 20+ engagements",
    detail: {
      longDescription:
        "A Python tool that automates gap assessment reporting for compliance engagements. Instead of analysts reading hundreds of pages of policy documents to check against 57 compliance requirements, the tool ingests the documents, creates embeddings, and uses semantic similarity search to find relevant evidence for each requirement.\n\nIt handles Excel, PDF, and Word through a unified ingestion pipeline, uses ADA-003 for embeddings, and stores them in a vector store. For each requirement it runs both semantic similarity and keyword-targeted search to maximize recall, then presents the strongest passages to the analyst for review.\n\nThe accuracy number is the part I care about most. 92% against manual review is not a guess, it is measured, and measuring it is what made the tool trustworthy enough for other teams to adopt without me supporting them. It started as a proof of concept on one engagement and became a standard tool across the practice.",
      challenges: [
        "Handling documents where tables, headers, and footnotes carry meaning that plain text extraction destroys",
        "Tuning the balance of semantic and keyword search to hold 92% accuracy across very different client document styles",
        "Building a chunking strategy that preserves enough context for good matching without flooding the context window",
        "Making it reliable enough for 20+ engagement teams to use with no dedicated support",
      ],
      outcomes: [
        "92% accuracy identifying relevant evidence, measured against manual review",
        "Adopted on 20+ engagements and folded into the standard assessment workflow",
        "Initial evidence gathering cut from 2 to 3 days down to 3 to 4 hours per engagement",
        "Senior analysts freed to spend time on judgment instead of document review",
      ],
      architecture:
        "Python CLI with a document ingestion pipeline: PDF via PyMuPDF, Word via python-docx, Excel via openpyxl. ADA-003 embeddings feed a vector store. Retrieval runs hybrid semantic plus keyword search across 57 requirements, and structured output templates assemble the gap assessment report.",
      pipeline: [
        { stage: "Ingest", detail: "Excel, PDF, and Word parsed with structure preserved" },
        { stage: "Chunk", detail: "Segmented to keep context without overflowing the window" },
        { stage: "Embed", detail: "ADA-003 embeddings written to the vector store" },
        { stage: "Retrieve", detail: "Hybrid semantic plus keyword search per requirement" },
        { stage: "Report", detail: "Ranked evidence assembled into a structured gap assessment" },
      ],
    },
  },
  {
    name: "Climate AI Platform",
    slug: "climate-ai-platform",
    category: "professional",
    tech: ["Azure OpenAI", "Python", "RAG", "AI Agents"],
    capabilities: ["retrieval", "evals", "agent-orchestration"],
    lens: ["build"],
    role: "Architect",
    period: "2023 to 2024",
    description:
      "Financial impact modeling with interactive visualizations. Context-aware agents with RAG-powered chat, source citations, and prompt injection safeguards.",
    metric: "Production deployment for Fortune 500 client",
    detail: {
      longDescription:
        "An AI platform for climate risk analysis and financial impact modeling, built for a Fortune 500 client. It combines structured financial data with unstructured climate research through a multi-agent architecture, so analysts can model scenarios and understand the financial implications.\n\nContext-aware agents answer climate risk questions using retrieval over the client's internal research library and public climate data. Every response carries source citations so an analyst can trace a claim back to the original passage. That was non-negotiable in a regulated environment, and it is the part that took the most engineering.\n\nThe platform also includes prompt injection safeguards, because the moment you put a chat interface in front of regulated financial data you have created an attack surface. The financial modeling side generates interactive visualizations showing how climate scenarios hit the client's portfolio, with adjustable assumptions and export for board-level presentations.",
      challenges: [
        "Building a multi-agent architecture where specialized agents collaborate on a complex climate risk question",
        "Implementing citations that accurately trace a response back to a specific source passage, not just a document",
        "Adding prompt injection safeguards robust enough for a regulated financial environment",
        "Making financial visualizations that non-technical executives could actually use in a board presentation",
      ],
      outcomes: [
        "Deployed to production for a Fortune 500 financial services client",
        "Scenario analyses that took weeks now take hours",
        "Citation traceability met the client's regulatory documentation requirements",
        "Used for board-level reporting on climate risk exposure",
      ],
      architecture:
        "Azure OpenAI for inference, Python backend with multi-agent orchestration, and a RAG pipeline over Azure AI Search for document retrieval. A citation extraction and verification layer ties every claim to a source passage. Security middleware handles prompt injection detection, and an interactive visualization frontend drives the financial modeling.",
    },
  },
  {
    name: "CoPilot Studio Agent Flows",
    slug: "copilot-studio-agent-flows",
    category: "professional",
    tech: ["CoPilot Studio", "Power Automate", "Claude Code", "Dataverse"],
    capabilities: ["agent-orchestration", "platform-delivery", "leadership"],
    lens: ["build", "lead"],
    role: "Sold and delivered",
    period: "2025",
    description:
      "Won and delivered a $325K data and AI engagement for a global food and beverage company. Agent flows designed around a team that does not write code, so they can extend the work themselves.",
    metric: "$325K won, 12-week timeline compressed to 4",
    detail: {
      longDescription:
        "A $325K data and AI engagement for a global food and beverage company, won on the strength of a 10-year client relationship and delivered in a quarter of the planned time. I later held a delivery role on a further $500K of work with the same client.\n\nThe technical constraint shaped everything. This client's team does not have deep technical skills, and they were not going to hire for it. So building the most elegant possible system would have been the wrong answer, because it would have died the moment we left. Instead I designed CoPilot Studio agents and Power Automate flows around their actual stack and their actual skill level, using reusable components they could recombine.\n\nThen I upskilled their team and the executive stakeholder on building and managing those components. That is the difference between a deliverable and a capability. They can extend it without us.\n\nWe had an initial working solution in 2 days and compressed the 12-week timeline to 4, building with Claude Code throughout.",
      challenges: [
        "Designing for a team without deep technical skills, so the solution survives after the consultants leave",
        "Compressing a 12-week plan into 4 weeks without shipping something fragile",
        "Working inside the client's existing Microsoft stack rather than introducing new infrastructure",
        "Upskilling an executive stakeholder to the point of managing reusable components themselves",
      ],
      outcomes: [
        "$325K engagement won and delivered, plus a delivery role on a further $500K of work",
        "Initial working solution in 2 days, full 12-week timeline compressed to 4",
        "Client team and executive stakeholder able to build and manage components without us",
        "10-year client relationship extended rather than spent",
      ],
      architecture:
        "CoPilot Studio agents fronting Power Automate flows over the client's existing Microsoft stack, with Dataverse for structured storage. Built as reusable components deliberately scoped to the client team's skill level so they could recombine and extend them independently. Developed with Claude Code.",
    },
  },
  {
    name: "Enterprise Data Migration",
    slug: "enterprise-data-migration",
    category: "professional",
    tech: ["Postgres", "GCP", "Python", "SQL"],
    capabilities: ["platform-delivery", "graph-architecture"],
    lens: ["build", "lead"],
    role: "Led end to end",
    period: "2023 to 2024",
    description:
      "An 18-month enterprise data migration. Untangled data across organizational silos, built the strategy with executives, and consolidated 27 distinct migration scenarios into Postgres on GCP.",
    metric: "27 migration scenarios, 18 months",
    detail: {
      longDescription:
        "An 18-month enterprise data migration that I led end to end. The hard part was never the pipes. It was that the data lived in organizational silos, and every silo had its own definition of the same entity, its own edge cases, and its own reason for believing it was correct.\n\nI worked with executives to build the migration strategy, then mapped the problem into 27 distinct migration scenarios. Naming them mattered more than it sounds. Once each scenario was explicit, we could sequence them, estimate them, and tell a stakeholder exactly which one their data fell into and when it was moving.\n\nEverything consolidated into a structured Postgres database on GCP. Understanding how entities related across silos, and where lineage broke between them, is the same instinct that later pushed me toward graph modeling for connected domains.",
      challenges: [
        "Reconciling entity definitions that differed across organizational silos, where each side had a legitimate reason for its version",
        "Building executive alignment on a migration strategy that touched every part of the business",
        "Sequencing 27 distinct migration scenarios so dependencies resolved in the right order",
        "Holding data quality and lineage through an 18-month migration while the source systems kept running",
      ],
      outcomes: [
        "27 distinct migration scenarios identified, sequenced, and delivered",
        "Siloed data consolidated into one structured Postgres database on GCP",
        "Migration strategy built and agreed with executive stakeholders",
        "Delivered over 18 months without disrupting the running source systems",
      ],
      architecture:
        "Structured Postgres database on GCP as the consolidation target. Python and SQL migration tooling per scenario, with entity reconciliation logic to resolve conflicting definitions across silos, and lineage tracking so a migrated record could be traced back to its source system.",
    },
  },
  {
    name: "GenAI Emissions Extraction",
    slug: "genai-emissions-extraction",
    category: "professional",
    tech: ["Python", "Azure OpenAI", "PDF Processing"],
    capabilities: ["retrieval", "evals"],
    lens: ["build"],
    role: "Builder",
    period: "2023 to 2024",
    description:
      "Python tool scraping granular emissions data from large PDFs for regulatory compliance. Paired with a Climate Disclosure Report writer.",
    metric: "Roughly 70% less manual compliance work",
    detail: {
      longDescription:
        "A Python tool that extracts granular emissions data from large corporate sustainability PDFs, paired with an automated Climate Disclosure Report writer. Companies publish emissions data in inconsistent formats across hundreds of pages, and the tool automates pulling specific Scope 1, 2, and 3 figures along with the methodological notes that qualify them.\n\nThe extraction pipeline handles what real sustainability reports actually look like: figures buried in tables, footnotes that change the meaning of a number, year-over-year comparisons scattered across sections, and inconsistent units. It uses Azure OpenAI for extraction that understands context and relationships rather than simple text parsing.\n\nThe distinction that mattered most was between reported, estimated, and restated figures. Those get treated differently in a disclosure, and getting it wrong is a compliance problem, not a formatting problem. The companion report writer takes verified extracted data and drafts Climate Disclosure Reports against regulatory frameworks, so compliance teams start from a draft instead of a blank page.",
      challenges: [
        "Extracting structured data from PDFs where figures sit in complex tables with merged cells and qualifying footnotes",
        "Handling inconsistent reporting formats across different companies and reporting years",
        "Distinguishing reported, estimated, and restated figures, which require different treatment in a disclosure",
        "Generating regulatory-compliant language that stays factually grounded in the extracted data",
      ],
      outcomes: [
        "Emissions extraction that previously took days of manual work automated",
        "Draft Climate Disclosure Reports generated against major regulatory frameworks",
        "Compliance team workload on initial data gathering and drafting cut by roughly 70%",
        "Became part of the standard workflow for climate compliance engagements",
      ],
      architecture:
        "Python pipeline with PDF processing for table extraction, section detection, and footnote linking. Azure OpenAI handles contextual extraction and report generation. Structured output validation checks emissions figures and classifies them as reported, estimated, or restated, then template-based assembly produces the regulatory report.",
    },
  },
  {
    name: "AI Transformation Office",
    slug: "ai-transformation-office",
    category: "professional",
    tech: ["Claude Code", "Enablement", "Change Management"],
    capabilities: ["leadership"],
    lens: ["lead"],
    role: "Co-founder",
    period: "2024 to present",
    description:
      "Co-founded the AI Transformation Office within a 500+ person practice. Built training, led executive upskilling, and reworked how the practice delivers.",
    metric: "Adoption grew from 54% to 99%",
    detail: {
      longDescription:
        "I co-founded the AI Transformation Office inside a 500+ person consulting practice, focused on real adoption rather than awareness. Most practitioners had heard about AI tools. Far fewer were using them on actual client work. That gap was where the value was sitting.\n\nWe built training tailored to role and skill level instead of generic intro sessions. The workshops used people's real project work, because that is the only version that changes behavior. For executives, upskilling focused on understanding capability well enough to make investment decisions and set realistic expectations.\n\nThe biggest lever was not training at all. It was reworking service delivery so AI-assisted workflows were part of the standard methodology rather than an add-on. That meant rewriting playbooks, adding quality checkpoints for AI-generated work, and building feedback loops so the practice learned from what worked.\n\nAdoption went from 54% to 99%. I have personally upskilled around 50 people on Claude Code, Cursor, and Codex, and I run biweekly engineering sessions plus weekly partner and director sessions. This body of work is what the Luminary award recognized.",
      challenges: [
        "Overcoming skepticism from experienced practitioners who read AI as a threat to their expertise",
        "Building training that worked from first-year analysts through partners without watering down",
        "Measuring real adoption instead of training completion, since attendance is not behavior change",
        "Reworking established delivery methodology without disrupting active engagements",
      ],
      outcomes: [
        "AI tool adoption grew from 54% to 99% across a 500+ person practice",
        "Roughly 50 people personally upskilled on Claude Code, Cursor, and Codex",
        "Executive leadership moved from cautious to actively sponsoring AI initiatives",
        "Delivery playbooks rewritten so AI-assisted workflows are standard practice",
      ],
    },
  },
  {
    name: "iOS Fitness App",
    slug: "ios-fitness-app",
    category: "personal",
    tech: ["Swift", "Supabase", "Claude Code"],
    capabilities: ["platform-delivery"],
    lens: ["build"],
    role: "Solo build",
    period: "2025",
    description:
      "Full-featured fitness app with macro tracking, AI coach, HealthKit sync, barcode scanning, workout tracking, push notifications, and subscription payments.",
    metric: "100% built with Claude Code",
    detail: {
      longDescription:
        "A complete iOS fitness app built entirely with Claude Code as a test of how far AI-assisted development goes on a real, shippable product. It covers macro and calorie logging with barcode scanning, customizable workout routines, and an AI coach that gives recommendations based on goals and history.\n\nIt integrates with Apple's ecosystem through HealthKit for health data sync, and uses Supabase for auth, real-time sync, and edge functions. Subscriptions run through StoreKit 2, with push notifications for reminders and milestones.\n\nEvery line went through Claude Code, from the SwiftUI views to the Supabase schema migrations. I am not a Swift developer by background, which is exactly what made it a useful experiment.",
      challenges: [
        "Building a production-quality iOS app through AI-assisted development with no manual code edits",
        "Integrating HealthKit, StoreKit 2, and push notifications, each needing careful entitlement configuration",
        "Designing a Supabase schema handling real-time sync across devices with tight row-level security",
        "Implementing barcode scanning with reliable nutrition lookup across multiple food database APIs",
      ],
      outcomes: [
        "Fully functional app with 15+ screens and complex navigation",
        "Showed Claude Code handling end-to-end iOS development including deployment configuration",
        "4 Apple frameworks and 3 third-party services integrated into one coherent experience",
        "Built and iterated in under 3 weeks of evenings and weekends",
      ],
      architecture:
        "SwiftUI frontend on MVVM, Supabase backend with Postgres, Auth, Edge Functions, and Realtime. A HealthKit integration layer handles bidirectional health data sync, StoreKit 2 manages subscriptions, and SwiftData provides local caching for offline support.",
    },
  },
  {
    name: "Super Bowl Squares",
    slug: "super-bowl-squares",
    category: "personal",
    tech: ["Next.js", "Vercel", "Supabase", "ESPN API"],
    capabilities: ["platform-delivery"],
    lens: ["build"],
    role: "Solo build",
    period: "2025",
    description:
      "Real-time web app with live ESPN scoring, admin dashboard, and confetti winner animations. Tested during the NFC Championship before Super Bowl deployment.",
    metric: "100 concurrent users, zero errors",
    detail: {
      longDescription:
        "A real-time Super Bowl Squares game that handled 100 concurrent users on game day with zero errors. Players claim squares on a 10x10 grid, and the app pulls live scores from the ESPN API to settle winners at the end of each quarter.\n\nIt includes an admin dashboard for managing the game, randomizing row and column numbers once squares are claimed, and overriding results if needed. Winners get a confetti animation, and the scoreboard updates in real time across every connected client through Supabase Realtime.\n\nThe part I would do again on any high-stakes launch: I ran the whole thing live during the NFC Championship with a smaller group first. That caught edge cases in score update timing and connection handling while the cost of being wrong was still low.",
      challenges: [
        "Holding 100 concurrent WebSocket connections through Supabase Realtime without dropped updates or stale state",
        "Syncing ESPN API score updates reliably during a live game with unpredictable API latency",
        "Preventing race conditions when several users claim the same square at once",
        "Validating the full pipeline against real game data before the game that actually mattered",
      ],
      outcomes: [
        "100 concurrent users on Super Bowl Sunday with zero errors and zero downtime",
        "Live score updates landing within seconds of actual game events",
        "Full game lifecycle managed from square claiming through final payout",
        "Zero support requests during the game, meaning the UX held up for non-technical users",
      ],
      architecture:
        "Next.js on Vercel with a Supabase backend using Realtime subscriptions for live grid updates. An edge function polls the ESPN API for score data. Square claiming uses optimistic UI updates with server reconciliation to avoid race conditions.",
    },
  },
];

export function getProjectBySlug(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

export function getAllSlugs(): string[] {
  return projects.map((p) => p.slug);
}

export function getSpotlightProjects(): Project[] {
  return projects.filter((p) => p.spotlight);
}

export function getProjectsByCapability(id: CapabilityId): Project[] {
  return projects.filter((p) => p.capabilities.includes(id));
}

export function getProjectsByLens(lens: Lens): Project[] {
  return projects.filter((p) => p.lens.includes(lens));
}
