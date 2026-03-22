import { Hero } from "@/components/sections/Hero";
import { Highlights } from "@/components/sections/Highlights";
import { About } from "@/components/sections/About";
import { Resume } from "@/components/sections/Resume";
import { Projects } from "@/components/sections/Projects";

export default function Home() {
  return (
    <main>
      <Hero />
      <Highlights />
      <About />
      <Resume />
      <Projects />
    </main>
  );
}
