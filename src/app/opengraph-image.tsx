import { ImageResponse } from "next/og";

export const alt = "Kyle Austin - AI Solutions Engineer";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

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
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: "#1A1A1A",
              lineHeight: 1.1,
            }}
          >
            Kyle Austin
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 600,
              color: "#2D5A3D",
            }}
          >
            AI Solutions Engineer
          </div>
          <div
            style={{
              fontSize: 24,
              color: "#6B7280",
              lineHeight: 1.5,
              maxWidth: "800px",
              marginTop: "8px",
            }}
          >
            I build AI systems that ship. RAG pipelines, eval frameworks, rapid
            prototypes. Six years turning Fortune 500 companies from AI-curious
            to AI-adopted.
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: "60px",
            left: "80px",
            display: "flex",
            gap: "24px",
            fontSize: 18,
            color: "#6B7280",
          }}
        >
          <span>kaustin923@gmail.com</span>
          <span style={{ color: "#E5E2DC" }}>|</span>
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
