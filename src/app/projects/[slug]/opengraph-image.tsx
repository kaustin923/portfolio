import { ImageResponse } from "next/og";
import { capabilityMap } from "@/data/capabilities";
import { getAllSlugs, getProjectBySlug } from "@/data/projects";

export const alt = "Project case study by Kyle Austin";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

/** In Next 16 the props of an image under a dynamic segment are Promises. */
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);

  const name = project?.name ?? "Kyle Austin";
  const metric = project?.metric ?? "";
  const description = project?.description ?? "";
  const stack = project?.tech.slice(0, 4) ?? [];
  const caps =
    project?.capabilities
      .map((id) => capabilityMap[id]?.label)
      .filter(Boolean)
      .slice(0, 3) ?? [];

  return new ImageResponse(
    (
      <div
        style={{
          background: "#FAF7F2",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "76px 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: "#8A662F",
            textTransform: "uppercase",
          }}
        >
          <span>Case study</span>
          {caps.length > 0 && <span style={{ color: "#D5CEC1" }}>/</span>}
          <span style={{ color: "#646C79", letterSpacing: "0.04em" }}>
            {caps.join("  ·  ")}
          </span>
        </div>

        <div
          style={{
            fontSize: 62,
            fontWeight: 700,
            color: "#14181A",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            marginTop: "18px",
            display: "flex",
          }}
        >
          {name}
        </div>

        {metric && (
          <div
            style={{
              fontSize: 30,
              fontWeight: 600,
              color: "#2D5A3D",
              marginTop: "14px",
              display: "flex",
            }}
          >
            {metric}
          </div>
        )}

        <div
          style={{
            fontSize: 23,
            color: "#4D545E",
            lineHeight: 1.45,
            maxWidth: "900px",
            marginTop: "16px",
            display: "flex",
          }}
        >
          {description.length > 168
            ? `${description.slice(0, 167).trimEnd()}…`
            : description}
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "28px" }}>
          {stack.map((t) => (
            <span
              key={t}
              style={{
                display: "flex",
                background: "#EDF5F0",
                color: "#2D5A3D",
                fontSize: 19,
                fontWeight: 600,
                padding: "8px 16px",
                borderRadius: "999px",
              }}
            >
              {t}
            </span>
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            bottom: "54px",
            left: "80px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            fontSize: 19,
          }}
        >
          <span style={{ fontWeight: 700, color: "#14181A" }}>Kyle Austin</span>
          <span style={{ color: "#D5CEC1" }}>|</span>
          <span style={{ color: "#646C79" }}>
            Forward-Deployed Engineer &amp; Solutions Architect
          </span>
        </div>

        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "8px",
            height: "100%",
            background: "#2D5A3D",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: "6px",
            background: "linear-gradient(to right, #2D5A3D, #C8965A)",
            display: "flex",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
