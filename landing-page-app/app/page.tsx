import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
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
      <Hero />
      <LogoBar />
      <ForWho />
      <Features />
      <HowItWorks />
      <CTASection />
      <Footer />
    </main>
  );
}
