import Nav from "@/components/Nav";
import DemoHero from "@/components/DemoHero";
import LogoBar from "@/components/LogoBar";
import ForWho from "@/components/ForWho";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import CTASection from "@/components/CTASection";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main>
      <Nav />
      <DemoHero />
      <LogoBar />
      <ForWho />
      <Features />
      <HowItWorks />
      <CTASection />
      <Footer />
    </main>
  );
}
