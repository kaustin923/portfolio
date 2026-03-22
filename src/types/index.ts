export interface ProjectDetail {
  longDescription: string;
  challenges: string[];
  outcomes: string[];
  architecture?: string;
}

export interface Project {
  name: string;
  slug: string;
  category: "personal" | "professional";
  tech: string[];
  description: string;
  metric?: string;
  detail?: ProjectDetail;
}

export interface Highlight {
  title: string;
  subtitle: string;
  badge?: string;
  eventDate?: string;
  description: string;
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
