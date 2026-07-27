import type { Capability, CapabilityId } from "@/types";

/**
 * The six capabilities the site is organized around. These drive the capability
 * filter on Projects, the capability map, and the topics the chat agent can
 * answer against.
 */
export const capabilities: Capability[] = [
  {
    id: "agent-orchestration",
    label: "Agent Orchestration",
    blurb: "Multi-agent systems that run real delivery, not demos.",
    proof:
      "I run a $1.5M engagement out of GitHub, where agents turn daily standup notes into action items, status reports, risk logs, and client comms. The reporting is derived from what actually shipped, not from what someone remembered to put in a slide.",
    evidence: [
      "Custom Teams and SharePoint MCP servers built against enterprise tenants with strict auth and data-handling rules",
      "Claude Code skills layered into the harness for task creation, PR opening, and automated PR review",
      "Agent-generated weekly status, milestone tracking, risk tracking, and resource plans across onshore and offshore teams",
      "Whole delivery engine built with Claude Code and Codex",
    ],
  },
  {
    id: "graph-architecture",
    label: "Graph Architecture",
    blurb: "Neo4j knowledge graphs that expose lineage and second-order impact.",
    proof:
      "I lead the dev team on a Neo4j knowledge graph suite for decarbonization modeling and reporting. Graphs are the right shape when the question is about relationships: what depends on what, where lineage breaks, and which change moves the most downstream.",
    evidence: [
      "Neo4j knowledge graph suite backing a set of interacting modeling and reporting solutions",
      "Modeled a Fortune 500 sustainability program as a graph to expose lineage gaps and efficiency opportunities",
      "Cypher for traversal and impact queries across connected entities",
      "Deployed on AKS through Azure DevOps CI/CD with SSO, Key Vault, and automated security gates",
    ],
  },
  {
    id: "retrieval",
    label: "Retrieval & RAG",
    blurb: "Production RAG with citations, safeguards, and measured accuracy.",
    proof:
      "I have shipped retrieval systems that people actually depend on. The gap assessment tool hits 92% accuracy against manual review and has been used on 20+ engagements without dedicated support.",
    evidence: [
      "RAG gap assessment tool: ADA-003 embeddings, hybrid semantic plus keyword search across 57 requirements, 92% accuracy",
      "Unified ingestion for Excel, PDF, and Word, including tables and footnotes that carry meaning",
      "Climate platform with RAG-powered chat, source citations traced to specific passages, and prompt injection safeguards",
      "Chunking strategies tuned to preserve context without flooding the window",
    ],
  },
  {
    id: "evals",
    label: "Evals & Quality",
    blurb: "Measuring whether AI output is good enough to send to a client.",
    proof:
      "Enterprise AI fails on trust, not capability. I build the measurement layer that tells you whether output is accurate enough to put in front of a regulator or a CFO, and the guardrails that keep it there.",
    evidence: [
      "Eval frameworks for accuracy scoring against manual review baselines",
      "Prompt injection safeguards built for a regulated financial environment",
      "Citation verification so every claim traces back to a source passage",
      "Quality checkpoints written into practice-wide delivery playbooks for AI-generated work",
    ],
  },
  {
    id: "platform-delivery",
    label: "Platform Delivery",
    blurb: "Proof of concept to scaled production without a rewrite.",
    proof:
      "I get something working in a client's hands fast, then scale it without a delivery freeze. On the capital project platform that meant a working solution in 3 weeks, then a 3-week shipping cadence from POC through scaled app.",
    evidence: [
      "$1.5M capital project engagement: a platform unifying cost, schedule, and risk, integrating Primavera P6 and Excel",
      "AKS deployments via Azure DevOps CI/CD with SSO, Key Vault secrets, and security scan gates",
      "Enterprise data migration consolidating 27 distinct scenarios into Postgres on GCP",
      "12-week timeline compressed to 4 on a food and beverage engagement",
    ],
  },
  {
    id: "leadership",
    label: "Player-Coach Leadership",
    blurb: "Leading 5 developers across time zones while still writing code.",
    proof:
      "I set the architecture, review the PRs, and still build. That is the whole point: I can validate an estimate because I could do the work myself. I also lift the teams around me, which is what the Luminary award was for.",
    evidence: [
      "5-developer onshore and offshore team across US and India, bridged with AI-generated recaps and daily connects",
      "Co-founded the AI Transformation Office for a 500+ person practice, adoption 54% to 99%",
      "Roughly 50 people personally upskilled on Claude Code, Cursor, and Codex",
      "Biweekly engineering upskilling plus weekly partner and director sessions",
    ],
  },
];

export const capabilityMap: Record<CapabilityId, Capability> = Object.fromEntries(
  capabilities.map((c) => [c.id, c])
) as Record<CapabilityId, Capability>;

export function getCapability(id: CapabilityId): Capability {
  return capabilityMap[id];
}
