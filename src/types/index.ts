/** The capability taxonomy that drives filtering, the capability map, and chat retrieval. */
export type CapabilityId =
  | "agent-orchestration"
  | "graph-architecture"
  | "retrieval"
  | "evals"
  | "platform-delivery"
  | "leadership";

/** How a visitor is reading the work: hands-on building, or running the program. */
export type Lens = "build" | "lead";

export interface Capability {
  id: CapabilityId;
  label: string;
  /** One line, shown on the capability chip and map node. */
  blurb: string;
  /** Longer proof statement, shown when the capability is selected. */
  proof: string;
  /** Concrete things Kyle has actually built or run with this. */
  evidence: string[];
}

export interface ProjectDetail {
  longDescription: string;
  challenges: string[];
  outcomes: string[];
  architecture?: string;
  /** Ordered stages of how data or work moves through the system. Renders as a flow diagram. */
  pipeline?: { stage: string; detail: string }[];
}

export interface Project {
  name: string;
  slug: string;
  category: "personal" | "professional";
  tech: string[];
  description: string;
  metric?: string;
  /** Drives the capability filter and the map. */
  capabilities: CapabilityId[];
  /** Which lens this work speaks to. Most flagship work speaks to both. */
  lens: Lens[];
  /** Kyle's actual role on the work. */
  role?: string;
  /** Year or range, for the timeline ordering. */
  period?: string;
  /** Promotes the project into the spotlight rotation. */
  spotlight?: boolean;
  detail?: ProjectDetail;
}

export interface Highlight {
  title: string;
  subtitle: string;
  badge?: string;
  eventDate?: string;
  description: string;
  /** Renders the card full-width at the top of the highlights grid. */
  featured?: boolean;
}

/** A headline number with enough context to be meaningful on its own. */
export interface Metric {
  value: string;
  label: string;
  context?: string;
}

export interface ResumeExperience {
  title: string;
  company: string;
  period: string;
  bullets: string[];
}

export interface ResumeData {
  summary: string;
  skills: {
    category: string;
    items: string;
  }[];
  experience: ResumeExperience[];
  personalProjects: {
    name: string;
    tech: string;
    description: string;
  }[];
  education: {
    degree: string;
    school: string;
    year: string;
    details: string;
  };
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** A suggested question, optionally scoped to a topic so the UI can group them. */
export interface ChatSuggestion {
  label: string;
  question: string;
  topic: "work" | "skills" | "leadership" | "personal";
}
