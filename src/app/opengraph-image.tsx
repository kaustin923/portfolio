import { ImageResponse } from "next/og";

export const alt =
  "Kyle Austin - Forward-Deployed Engineer & Solutions Architect";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

const PROOF = [
  { value: "1 of 9", label: "PwC Luminary Award" },
  { value: "$2M+", label: "Revenue managed" },
  { value: "54% → 99%", label: "AI adoption" },
  { value: "92%", label: "RAG accuracy" },
];

export default function Image() {
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
          padding: "80px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            border: "1px solid rgba(143, 106, 49, 0.35)",
            background: "#FBF3E8",
            color: "#8F6A31",
            fontSize: 20,
            fontWeight: 600,
            padding: "8px 16px",
            borderRadius: "999px",
            marginBottom: "24px",
          }}
        >
          PwC&apos;s highest AI honor, 2026
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div
            style={{
              fontSize: 68,
              fontWeight: 700,
              color: "#14181A",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            Kyle Austin
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 600,
              color: "#2D5A3D",
            }}
          >
            Forward-Deployed Engineer &amp; Solutions Architect
          </div>
          <div
            style={{
              fontSize: 24,
              color: "#5C6470",
              lineHeight: 1.45,
              maxWidth: "860px",
              marginTop: "6px",
            }}
          >
            Agent orchestration, knowledge graphs, and production RAG. I lead a
            5-developer team and still write the code.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "48px",
            marginTop: "44px",
          }}
        >
          {PROOF.map((p) => (
            <div
              key={p.label}
              style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            >
              <span style={{ fontSize: 32, fontWeight: 700, color: "#2D5A3D" }}>
                {p.value}
              </span>
              <span style={{ fontSize: 17, color: "#8A929E" }}>{p.label}</span>
            </div>
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            bottom: "56px",
            left: "80px",
            display: "flex",
            gap: "20px",
            fontSize: 18,
            color: "#8A929E",
          }}
        >
          <span>kaustin923@gmail.com</span>
          <span style={{ color: "#D5CEC1" }}>|</span>
          <span>Cherry Hill, NJ</span>
        </div>
        <div
          style={{
            position: "absolute",
            top: "0",
            right: "0",
            width: "8px",
            height: "100%",
            background: "#2D5A3D",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "0",
            left: "0",
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
