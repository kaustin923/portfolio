import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectBySlug, getAllSlugs } from "@/data/projects";
import { capabilityMap } from "@/data/capabilities";
import { ProjectDetailView } from "@/components/projects/ProjectDetailView";

export const dynamicParams = false;

type ProjectPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

/** Search engines cut descriptions around 160 characters. */
function clampDescription(text: string, max = 158): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : cut.length).replace(/[.,;:]$/, "")}…`;
}

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) return {};

  const title = `${project.name} | Kyle Austin`;
  const description = clampDescription(
    project.metric
      ? `${project.metric}. ${project.description}`
      : project.description
  );
  const url = `/projects/${project.slug}`;

  // The root opengraph-image does not cascade into nested segments, so each
  // project points at its own generated card in this segment.
  const image = {
    url: `${url}/opengraph-image`,
    width: 1200,
    height: 630,
    alt: `${project.name} | Kyle Austin`,
  };

  return {
    title,
    description,
    keywords: [
      ...project.tech,
      ...project.capabilities
        .map((id) => capabilityMap[id]?.label)
        .filter((label): label is string => Boolean(label)),
    ],
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "article",
      siteName: "Kyle Austin",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);

  if (!project || !project.detail) {
    notFound();
  }

  return <ProjectDetailView project={project} />;
}
