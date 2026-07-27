import { Hero } from "@/components/sections/Hero";
import { Metrics } from "@/components/sections/Metrics";
import { Capabilities } from "@/components/sections/Capabilities";
import { Projects } from "@/components/sections/Projects";
import { Highlights } from "@/components/sections/Highlights";
import { About } from "@/components/sections/About";
import { Resume } from "@/components/sections/Resume";

export default function Home() {
  return (
    <main>
      <Hero />
      <Metrics />
      <Capabilities />
      <Projects />
      <Highlights />
      <About />
      <Resume />
    </main>
  );
}
