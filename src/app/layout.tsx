import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ChatWidget } from "@/components/chat/ChatWidget";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000"
  ),
  title: "Kyle Austin | AI Solutions Engineer",
  description:
    "I build AI systems that ship. RAG pipelines, eval frameworks, rapid prototypes. Six years turning Fortune 500 companies from AI-curious to AI-adopted.",
  openGraph: {
    title: "Kyle Austin | AI Solutions Engineer",
    description:
      "I build AI systems that ship. RAG pipelines, eval frameworks, rapid prototypes. Six years turning Fortune 500 companies from AI-curious to AI-adopted.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-screen bg-background text-text font-sans">
        <Navbar />
        {children}
        <Footer />
        <ChatWidget />
      </body>
    </html>
  );
}
